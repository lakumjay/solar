<?php

namespace App\Http\Controllers;

use App\Models\SolarBill;
use App\Models\SolarBillingCompany;
use App\Models\SolarBillingSetting;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class SolarBillingController extends Controller
{
    /**
     * Financial year helper (India: April to March).
     * e.g., 2026-09-15 -> 26-27, 2027-02-10 -> 26-27
     */
    private function fyOf(?string $dateStr): string
    {
        $d = $dateStr ? Carbon::parse($dateStr) : Carbon::now();
        $y = $d->year;
        $m = $d->month;
        if ($m >= 4) {
            return substr((string) $y, -2) . '-' . substr((string) ($y + 1), -2);
        } else {
            return substr((string) ($y - 1), -2) . '-' . substr((string) $y, -2);
        }
    }

    /**
     * List bills with optional filtering and live ledger accrued interest.
     */
    public function index(Request $request): JsonResponse
    {
        $interestPct = (float) SolarBillingSetting::getVal('interest_pct', 18.0);

        $query = SolarBill::with(['company:id,name,inv_prefix,gstin,bank_name,bank_ac,bank_ifsc,logo_path'])
            ->orderBy('invoice_date', 'desc')
            ->orderBy('id', 'desc');

        if ($request->filled('company_id') && $request->input('company_id') !== 'all') {
            $query->where('company_id', $request->input('company_id'));
        }

        if ($request->filled('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('search')) {
            $s = trim($request->input('search'));
            $query->where(function ($q) use ($s) {
                $q->where('invoice_no', 'like', "%{$s}%")
                    ->orWhere('month', 'like', "%{$s}%")
                    ->orWhere('customer_name', 'like', "%{$s}%");
            });
        }

        $bills = $query->get()->map(function (SolarBill $bill) use ($interestPct) {
            $metrics = $bill->getLiveLedgerMetrics($interestPct);
            $arr = $bill->toArray();
            $arr['live_ledger'] = $metrics;
            return $arr;
        });

        // Summary metrics
        $totalBilled = SolarBill::where('status', '!=', 'void')->sum('total_outstanding');
        $totalPaid = SolarBill::where('status', 'paid')->sum('total_outstanding');
        $pendingBills = $bills->where('status', 'pending');
        $totalPendingSnapshot = $pendingBills->sum('total_outstanding');
        $totalLiveDue = $pendingBills->sum(fn ($b) => $b['live_ledger']['current_total_due']);

        return response()->json([
            'bills' => $bills,
            'summary' => [
                'total_billed' => round($totalBilled, 2),
                'total_paid' => round($totalPaid, 2),
                'total_pending' => round($totalPendingSnapshot, 2),
                'total_live_due' => round($totalLiveDue, 2),
                'pending_count' => $pendingBills->count(),
                'interest_pct' => $interestPct,
            ],
        ]);
    }

    /**
     * Get billing companies.
     */
    public function companies(): JsonResponse
    {
        $companies = SolarBillingCompany::orderBy('id')->get();
        return response()->json($companies);
    }

    /**
     * Create or update a billing company.
     */
    public function saveCompany(Request $request, ?int $id = null): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:150',
            'gstin' => 'nullable|string|max:30',
            'address' => 'nullable|string',
            'phones' => 'nullable|string|max:100',
            'bank_name' => 'nullable|string|max:150',
            'bank_ac' => 'nullable|string|max:50',
            'bank_ifsc' => 'nullable|string|max:30',
            'discount' => 'nullable|numeric|min:0',
            'inv_prefix' => 'required|string|max:20',
            'last_seq' => 'nullable|integer|min:0',
            'active' => 'nullable|boolean',
        ]);

        if ($request->hasFile('logo')) {
            $path = $request->file('logo')->store('company_logos', 'public');
            $data['logo_path'] = Storage::url($path);
        }

        if ($id) {
            $company = SolarBillingCompany::findOrFail($id);
            $company->update($data);
        } else {
            $company = SolarBillingCompany::create($data);
        }

        return response()->json([
            'message' => 'Company saved successfully',
            'company' => $company,
        ]);
    }

    /**
     * Get settings map.
     */
    public function settings(): JsonResponse
    {
        return response()->json(SolarBillingSetting::getMap());
    }

    /**
     * Save settings map.
     */
    public function saveSettings(Request $request): JsonResponse
    {
        $inputs = $request->except(['_token', 'signature_file']);

        foreach ($inputs as $key => $val) {
            if ($val !== null) {
                SolarBillingSetting::setVal($key, (string) $val);
            }
        }

        if ($request->hasFile('signature_file')) {
            $path = $request->file('signature_file')->store('signatures', 'public');
            SolarBillingSetting::setVal('signature_url', Storage::url($path));
        }

        return response()->json([
            'message' => 'Settings saved successfully',
            'settings' => SolarBillingSetting::getMap(),
        ]);
    }

    /**
     * Check current pending balance & overdue interest for a company.
     */
    public function pendingBalance(Request $request, int $companyId): JsonResponse
    {
        $interestPct = (float) SolarBillingSetting::getVal('interest_pct', 18.0);
        $pendingBills = SolarBill::where('company_id', $companyId)
            ->where('status', 'pending')
            ->get();

        $prevBal = $pendingBills->sum('total_outstanding');
        $rawInterest = 0.00;
        $maxDays = 0;
        $now = Carbon::now()->startOfDay();

        foreach ($pendingBills as $b) {
            $due = Carbon::parse($b->due_date ?: $b->invoice_date)->startOfDay();
            $days = $now->greaterThan($due) ? $now->diffInDays($due) : 0;
            if ($days > $maxDays) {
                $maxDays = $days;
            }
            if ($days > 0 && $b->total_outstanding > 0) {
                $rawInterest += (float) $b->total_outstanding * ($interestPct / 100) * ($days / 365);
            }
        }

        return response()->json([
            'prev_balance' => round($prevBal, 2),
            'interest' => round($rawInterest, 2),
            'interest_days' => $maxDays,
            'interest_pct' => $interestPct,
        ]);
    }

    /**
     * Store new bill(s) inside a database transaction with pessimistic locking
     * to prevent invoice number collision and ensure mathematical auditability.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'bills' => 'required|array|min:1',
            'bills.*.company_id' => 'required|integer|exists:solar_billing_companies,id',
            'bills.*.month' => 'required|string|max:30',
            'bills.*.invoice_date' => 'required|date',
            'bills.*.units_credited' => 'required|numeric|min:0.01',
            'bills.*.breakdown' => 'required|array',
            'pdf_file' => 'nullable|file|mimes:pdf|max:10240', // 10MB max
        ]);

        $pdfPath = null;
        if ($request->hasFile('pdf_file')) {
            $uploaded = $request->file('pdf_file')->store('billing_statements', 'public');
            $pdfPath = Storage::url($uploaded);
        }

        $userId = $request->user()?->id;
        $dueDays = (int) SolarBillingSetting::getVal('due_days', 15);
        $savedBills = [];

        DB::transaction(function () use ($request, $pdfPath, $userId, $dueDays, &$savedBills) {
            foreach ($request->input('bills') as $billInput) {
                $companyId = (int) $billInput['company_id'];

                // 1. Pessimistic lock on company sequence row
                $company = SolarBillingCompany::where('id', $companyId)->lockForUpdate()->firstOrFail();

                // 2. Determine Financial Year
                $invDate = $billInput['invoice_date'];
                $fy = $this->fyOf($invDate);

                // 3. Invoice Number generation / collision protection
                if (! empty($billInput['invoice_no'])) {
                    $invoiceNo = trim($billInput['invoice_no']);
                } else {
                    $nextSeq = (int) $company->last_seq + 1;
                    $seqPadded = str_pad((string) $nextSeq, 2, '0', STR_PAD_LEFT);
                    $invoiceNo = "{$company->inv_prefix}/{$fy}/{$seqPadded}";
                }

                // Verify uniqueness (extra safety)
                if (SolarBill::where('invoice_no', $invoiceNo)->exists()) {
                    throw new \RuntimeException("Invoice number '{$invoiceNo}' already exists! Collision prevented.");
                }

                // 4. Calculate due date
                $dueDate = isset($billInput['due_date'])
                    ? Carbon::parse($billInput['due_date'])->format('Y-m-d')
                    : Carbon::parse($invDate)->addDays($dueDays)->format('Y-m-d');

                // 5. Units & Financials
                $breakdown = $billInput['breakdown'];
                $subTotal = (float) ($breakdown['net'] ?? $billInput['sub_total'] ?? 0);
                $discountAmt = (float) ($breakdown['discountAmt'] ?? $billInput['discount_amt'] ?? 0);
                $roundOff = (float) ($breakdown['roundOff'] ?? $billInput['round_off'] ?? 0);
                $currentGrand = (float) ($breakdown['grand'] ?? $billInput['current_grand_total'] ?? 0);

                $prevBal = (float) ($billInput['prev_balance'] ?? 0);
                $interestAmt = (float) ($billInput['interest_amt'] ?? 0);
                $interestDays = (int) ($billInput['interest_days'] ?? 0);
                $totalOutstanding = round($currentGrand + $prevBal + $interestAmt, 2);

                // 6. Save Bill
                $bill = SolarBill::create([
                    'company_id' => $company->id,
                    'month' => $billInput['month'],
                    'invoice_no' => $invoiceNo,
                    'invoice_date' => $invDate,
                    'due_date' => $dueDate,
                    'customer_name' => $billInput['customer_name'] ?? 'Blueart Granito Pvt. Ltd.',
                    'customer_address' => $billInput['customer_address'] ?? null,
                    'customer_gstin' => $billInput['customer_gstin'] ?? null,
                    'units_credited' => $billInput['units_credited'],
                    'units_peak' => $billInput['units_peak'] ?? 0,
                    'units_banking' => $billInput['units_banking'] ?? 0,
                    'units_generated' => $billInput['units_generated'] ?? ($breakdown['generated'] ?? 0),
                    'stmt_inputs' => $billInput['stmt_inputs'] ?? null,
                    'rates_derived' => $billInput['rates_derived'] ?? null,
                    'extra_params' => $billInput['extra_params'] ?? null,
                    'breakdown' => $breakdown,
                    'sub_total' => $subTotal,
                    'discount_rate' => $billInput['discount_rate'] ?? 1.25,
                    'discount_amt' => $discountAmt,
                    'prev_balance' => $prevBal,
                    'interest_amt' => $interestAmt,
                    'interest_days' => $interestDays,
                    'round_off' => $roundOff,
                    'current_grand_total' => $currentGrand,
                    'total_outstanding' => $totalOutstanding,
                    'status' => 'pending',
                    'pdf_path' => $pdfPath,
                    'notes' => $billInput['notes'] ?? null,
                    'created_by' => $userId,
                ]);

                // 7. Increment sequence atomically
                $company->increment('last_seq');

                $savedBills[] = $bill;
            }
        });

        return response()->json([
            'message' => count($savedBills) . ' bill(s) saved successfully',
            'bills' => $savedBills,
        ]);
    }

    /**
     * Toggle Paid / Pending status.
     */
    public function togglePaid(Request $request, int $id): JsonResponse
    {
        $bill = SolarBill::findOrFail($id);

        if ($bill->status === 'void') {
            return response()->json(['error' => 'Voided bill status cannot be toggled.'], 422);
        }

        if ($bill->status === 'paid') {
            $bill->status = 'pending';
            $bill->paid_at = null;
        } else {
            $bill->status = 'paid';
            $bill->paid_at = Carbon::now();
        }

        $bill->save();

        return response()->json([
            'message' => "Bill status updated to {$bill->status}",
            'bill' => $bill,
        ]);
    }

    /**
     * Mark a bill as Void / Cancelled instead of deleting it.
     */
    public function voidBill(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason' => 'required|string|max:255',
        ]);

        $bill = SolarBill::findOrFail($id);

        if ($bill->status === 'void') {
            return response()->json(['error' => 'Bill is already voided.'], 422);
        }

        $bill->status = 'void';
        $bill->voided_at = Carbon::now();
        $bill->voided_by = $request->user()?->id;
        $bill->void_reason = $request->input('reason');
        $bill->save();

        return response()->json([
            'message' => "Bill {$bill->invoice_no} has been voided.",
            'bill' => $bill,
        ]);
    }
}
