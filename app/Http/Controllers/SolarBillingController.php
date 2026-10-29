<?php

namespace App\Http\Controllers;

use App\Models\SolarBill;
use App\Models\SolarBillingCompany;
use App\Models\SolarBillingSetting;
use App\Services\SolarBillingEngineService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use RuntimeException;

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

        // Summary metrics (Principal-based revenue & debt tracking with strict void exclusion & partial payment handling)
        $totalBilled = SolarBill::where('status', '!=', 'void')->sum('current_grand_total');
        $totalPaidDirect = (float) SolarBill::where('status', 'paid')->sum('current_grand_total');
        $totalPaidPartial = (float) SolarBill::where('status', 'partial')->sum('paid_amount');
        $totalPaid = $totalPaidDirect + $totalPaidPartial;

        $unpaidBills = $bills->filter(fn ($b) => $b && in_array($b['status'], ['pending', 'partial']));
        $totalPendingSnapshot = $unpaidBills->sum(fn ($b) => max(0.0, (float) ($b['current_grand_total'] ?? 0) - (float) ($b['paid_amount'] ?? 0)));
        $totalLiveDue = $unpaidBills->sum(fn ($b) => $b['live_ledger']['current_total_due']);

        return response()->json([
            'bills' => $bills,
            'summary' => [
                'total_billed' => round($totalBilled, 2),
                'total_paid' => round($totalPaid, 2),
                'total_pending' => round($totalPendingSnapshot, 2),
                'total_live_due' => round($totalLiveDue, 2),
                'pending_count' => $unpaidBills->count(),
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
            'due_days' => 'nullable|integer|min:1|max:180',
            'interest_pct' => 'nullable|numeric|min:0|max:100',
            'loss_pct' => 'nullable|numeric|min:0|max:100',
            'wheel_rate' => 'nullable|numeric|min:0',
            'bank_rate' => 'nullable|numeric|min:0',
            'cross_pct' => 'nullable|numeric|min:0|max:100',
            'letterhead_mode' => 'nullable|string|in:digital,custom_image,preprinted',
            'logo' => 'nullable|file|image|max:5120',
            'signature' => 'nullable|file|image|max:5120',
            'letterhead' => 'nullable|file|mimes:jpeg,png,jpg,webp,pdf|max:10240',
        ]);

        if ($request->hasFile('logo') && $request->file('logo')->isValid()) {
            $path = $request->file('logo')->store('company_logos', 'public');
            $data['logo_path'] = Storage::url($path);
        }

        if ($request->hasFile('signature') && $request->file('signature')->isValid()) {
            $path = $request->file('signature')->store('company_signatures', 'public');
            $data['signature_path'] = Storage::url($path);
        }

        if ($request->hasFile('letterhead') && $request->file('letterhead')->isValid()) {
            $path = $request->file('letterhead')->store('company_letterheads', 'public');
            $data['letterhead_path'] = Storage::url($path);
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
        $company = SolarBillingCompany::find($companyId);
        $interestPct = $company?->interest_pct !== null && is_numeric($company->interest_pct)
            ? (float) $company->interest_pct
            : (float) SolarBillingSetting::getVal('interest_pct', 18.0);

        $metrics = SolarBillingEngineService::getCompanyPendingAndInterest($companyId, $interestPct);
        return response()->json($metrics);
    }

    /**
     * Store new bill(s) inside a database transaction with pessimistic locking.
     * Enforces strict server-side financial recomputation from raw statement inputs.
     * Never trusts client-submitted financial totals.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'bills' => 'required|array|min:1',
            'bills.*.company_id' => 'required|integer|exists:solar_billing_companies,id',
            'bills.*.month' => 'required|string|max:30',
            'bills.*.invoice_date' => 'required|date',
            'bills.*.units_credited' => 'required|numeric|min:0.01',
            'bills.*.stmt_inputs' => 'required',
            'pdf_file' => 'nullable|file|mimes:pdf|max:10240', // 10MB max
        ]);

        $pdfPath = null;
        if ($request->hasFile('pdf_file')) {
            $file = $request->file('pdf_file');
            if ($file->isValid()) {
                $ext = strtolower($file->getClientOriginalExtension());
                if ($ext !== 'pdf') {
                    return response()->json(['error' => 'Only valid PDF files are accepted.'], 422);
                }
                $uploaded = $file->store('billing_statements', 'public');
                $pdfPath = Storage::url($uploaded);
            }
        }

        $userId = $request->user()?->id;
        $dueDays = (int) SolarBillingSetting::getVal('due_days', 15);
        $savedBills = [];

        try {
            DB::transaction(function () use ($request, $pdfPath, $userId, $dueDays, &$savedBills) {
                foreach ($request->input('bills') as $billInput) {
                    $companyId = (int) $billInput['company_id'];

                    // 1. Pessimistic lock on company sequence row
                    $company = SolarBillingCompany::where('id', $companyId)->lockForUpdate()->firstOrFail();

                    // 2. SERVER-SIDE FINANCIAL SOURCE OF TRUTH:
                    // Independently recomputes all rates, breakdown, discount, roundoff, and totals.
                    // Strictly verifies client totals within ₹2 tolerance, otherwise throws InvalidArgumentException.
                    $verified = SolarBillingEngineService::verifyAndRecompute($billInput, $company);

                    // 3. Determine Financial Year
                    $invDate = $billInput['invoice_date'];
                    $fy = $this->fyOf($invDate);

                    // 4. Invoice Number generation / collision protection
                    if (! empty($billInput['invoice_no'])) {
                        $invoiceNo = trim($billInput['invoice_no']);
                    } else {
                        $nextSeq = (int) $company->last_seq + 1;
                        $seqPadded = str_pad((string) $nextSeq, 2, '0', STR_PAD_LEFT);
                        $invoiceNo = "{$company->inv_prefix}/{$fy}/{$seqPadded}";
                    }

                    // Verify uniqueness (extra safety)
                    if (SolarBill::where('invoice_no', $invoiceNo)->exists()) {
                        throw new RuntimeException("Invoice number '{$invoiceNo}' already exists! Collision prevented.");
                    }

                    // 5. Calculate due date
                    $companyDueDays = (int) ($company->due_days ?: $dueDays);
                    $dueDate = isset($billInput['due_date']) && ! empty($billInput['due_date'])
                        ? Carbon::parse($billInput['due_date'])->format('Y-m-d')
                        : Carbon::parse($invDate)->addDays($companyDueDays)->format('Y-m-d');

                    // 6. Save Bill with 100% CANONICAL SERVER-VERIFIED FIGURES
                    $bill = SolarBill::create([
                        'company_id' => $company->id,
                        'month' => $billInput['month'],
                        'invoice_no' => $invoiceNo,
                        'invoice_date' => $invDate,
                        'due_date' => $dueDate,
                        'customer_name' => $billInput['customer_name'] ?? 'Blueart Granito Pvt. Ltd.',
                        'customer_address' => $billInput['customer_address'] ?? null,
                        'customer_gstin' => $billInput['customer_gstin'] ?? null,
                        'units_credited' => (float) $billInput['units_credited'],
                        'units_peak' => (float) ($billInput['units_peak'] ?? 0),
                        'units_banking' => (float) ($billInput['units_banking'] ?? 0),
                        'units_generated' => $verified['units_generated'],
                        'stmt_inputs' => $verified['stmt_inputs'],
                        'rates_derived' => $verified['rates_derived'],
                        'extra_params' => $verified['extra_params'],
                        'breakdown' => $verified['breakdown'],
                        'sub_total' => $verified['sub_total'],
                        'discount_rate' => $verified['discount_rate'],
                        'discount_amt' => $verified['discount_amt'],
                        'prev_balance' => $verified['prev_balance'],
                        'interest_amt' => $verified['interest_amt'],
                        'interest_days' => $verified['interest_days'],
                        'round_off' => $verified['round_off'],
                        'current_grand_total' => $verified['current_grand_total'],
                        'total_outstanding' => $verified['total_outstanding'],
                        'status' => 'pending',
                        'pdf_path' => $pdfPath,
                        'notes' => $billInput['notes'] ?? null,
                        'created_by' => $userId,
                    ]);

                    // 7. Increment sequence atomically:
                    // If invoice_no ends with a sequence number (e.g. RS/26-27/05),
                    // ensure last_seq advances to at least that number to prevent collisions.
                    $extractedSeq = null;
                    if (preg_match('/\/(\d+)$/', $invoiceNo, $m)) {
                        $extractedSeq = (int) $m[1];
                    }
                    $targetSeq = $extractedSeq !== null ? max((int) $company->last_seq + 1, $extractedSeq) : (int) $company->last_seq + 1;
                    $company->update(['last_seq' => $targetSeq]);

                    $savedBills[] = $bill;
                }
            });
        } catch (InvalidArgumentException $e) {
            return response()->json([
                'error' => $e->getMessage(),
                'security_status' => 'REJECTED_CALCULATION_MISMATCH',
            ], 422);
        } catch (RuntimeException $e) {
            return response()->json([
                'error' => $e->getMessage(),
                'security_status' => 'COLLISION_CONFLICT',
            ], 409);
        }

        return response()->json([
            'message' => count($savedBills) . ' bill(s) verified & saved successfully (Server Recomputed & Secured)',
            'bills' => $savedBills,
        ]);
    }

    /**
     * Toggle Paid / Pending status.
     * Enforces strict Lock Order: Company -> Bill inside transaction to prevent deadlocks.
     */
    public function togglePaid(Request $request, int $id): JsonResponse
    {
        return DB::transaction(function () use ($id) {
            $bill = SolarBill::findOrFail($id);

            // 1. Lock company first (Strict Lock Order: Company -> Bill)
            SolarBillingCompany::where('id', $bill->company_id)->lockForUpdate()->first();

            // 2. Lock bill
            $bill = SolarBill::where('id', $id)->lockForUpdate()->firstOrFail();

            if ($bill->status === 'void') {
                return response()->json(['error' => 'Voided bill status cannot be toggled.'], 422);
            }

            if ($bill->status === 'paid') {
                $bill->status = 'pending';
                $bill->paid_at = null;
                $bill->paid_amount = 0.00;
            } else {
                $bill->status = 'paid';
                $bill->paid_at = Carbon::now();
                $bill->paid_amount = $bill->total_outstanding;
            }

            $bill->save();

            return response()->json([
                'message' => "Bill status updated to {$bill->status}",
                'bill' => $bill,
            ]);
        });
    }

    /**
     * Mark a bill as Void / Cancelled instead of deleting it.
     * Enforces strict Lock Order: Company -> Bill inside transaction to prevent deadlocks.
     */
    public function voidBill(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason' => 'required|string|max:255',
        ]);

        return DB::transaction(function () use ($request, $id) {
            $bill = SolarBill::findOrFail($id);

            // 1. Lock company first (Strict Lock Order: Company -> Bill)
            SolarBillingCompany::where('id', $bill->company_id)->lockForUpdate()->first();

            // 2. Lock bill
            $bill = SolarBill::where('id', $id)->lockForUpdate()->firstOrFail();

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
        });
    }

    /**
     * Securely download or view statement PDF with path traversal guards.
     */
    public function downloadPdf(Request $request, int $id)
    {
        $bill = SolarBill::findOrFail($id);
        if (! $bill->pdf_path) {
            return response()->json(['error' => 'No statement PDF attached to this bill.'], 404);
        }

        // Path traversal guard: only extract basename and verify existence within billing_statements
        $relPath = str_replace('/storage/', '', $bill->pdf_path);
        $cleanFilename = basename($relPath);

        if (! Storage::disk('public')->exists("billing_statements/{$cleanFilename}")) {
            return response()->json(['error' => 'Statement PDF file not found on server.'], 404);
        }

        $invClean = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $bill->invoice_no);
        return Storage::disk('public')->download(
            "billing_statements/{$cleanFilename}",
            "PGVCL-Statement-{$invClean}.pdf"
        );
    }
}
