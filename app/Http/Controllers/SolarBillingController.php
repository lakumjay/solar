<?php

namespace App\Http\Controllers;

use App\Models\SolarBill;
use App\Models\SolarBillingCompany;
use App\Models\SolarBillingSetting;
use App\Models\SolarBillingCharge;
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

        $query = SolarBill::with(['company:id,name,inv_prefix,gstin,bank_name,bank_ac,bank_ifsc,logo_path,interest_pct,due_days,signature_path,signature_enabled'])
            ->orderBy('invoice_date', 'desc')
            ->orderBy('id', 'desc');

        if ($request->filled('company_id') && $request->input('company_id') !== 'all') {
            $query->where('company_id', $request->input('company_id'));
        }

        if ($request->filled('month') && $request->input('month') !== 'all') {
            $query->where('month', $request->input('month'));
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
            $coInterest = $bill->company?->interest_pct !== null && is_numeric($bill->company->interest_pct)
                ? (float) $bill->company->interest_pct
                : $interestPct;
            $metrics = $bill->getLiveLedgerMetrics($coInterest);
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
        $companies = SolarBillingCompany::orderBy('id')->get()->map(function ($c) {
            $this->syncCompanyLastSeq($c);
            return $c->fresh();
        });
        return response()->json($companies);
    }

    /**
     * Synchronize company last_seq with the actual highest active bill in the database.
     * If a bill was deleted from the database (e.g. testing or reset), last_seq cleanly rewinds.
     */
    public function syncCompanyLastSeq(SolarBillingCompany $company): int
    {
        $bills = SolarBill::where('company_id', $company->id)
            ->where('status', '!=', 'void')
            ->pluck('invoice_no');

        $maxSeq = 0;
        foreach ($bills as $invNo) {
            if (preg_match('/\/(\d+)$/', $invNo, $m)) {
                $s = (int) $m[1];
                if ($s > $maxSeq) {
                    $maxSeq = $s;
                }
            }
        }
        if ((int) $company->last_seq !== $maxSeq) {
            $company->update(['last_seq' => $maxSeq]);
        }
        return $maxSeq;
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
            'active' => 'nullable|boolean',
            'signature_enabled' => 'nullable|boolean',
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

        // Disallow manual edits to last_seq — strictly auto-managed inside billing transaction
        unset($data['last_seq']);

        if ($request->hasFile('logo') && $request->file('logo')->isValid()) {
            $path = $request->file('logo')->store('company_logos', 'public');
            $data['logo_path'] = Storage::url($path);
        }

        if ($request->hasFile('signature') && $request->file('signature')->isValid()) {
            $path = $request->file('signature')->store('company_signatures', 'public');
            $data['signature_path'] = Storage::url($path);
        } elseif ($request->boolean('clear_signature') || $request->input('clear_signature') === '1') {
            $data['signature_path'] = null;
        }

        if ($request->hasFile('letterhead') && $request->file('letterhead')->isValid()) {
            $path = $request->file('letterhead')->store('company_letterheads', 'public');
            $data['letterhead_path'] = Storage::url($path);
        } elseif ($request->boolean('clear_letterhead') || $request->input('clear_letterhead') === '1') {
            $data['letterhead_path'] = null;
        }

        // Clean out raw uploaded file handles so Eloquent never tries to write them as SQL columns
        unset($data['logo'], $data['signature'], $data['letterhead']);

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
     * Delete a billing company with strict protection:
     * Disallows deletion if bills exist in database for this company.
     */
    public function destroyCompany(int $id): JsonResponse
    {
        $company = SolarBillingCompany::findOrFail($id);
        if (SolarBill::where('company_id', $company->id)->exists()) {
            return response()->json([
                'error' => 'Cannot delete company: billing records already exist for this company in database.'
            ], 422);
        }
        $company->delete();
        return response()->json(['message' => 'Company deleted successfully']);
    }

    /**
     * Distinct billing months that have active bills (for the Records month dropdown).
     */
    public function billMonths(): JsonResponse
    {
        $months = SolarBill::where('status', '!=', 'void')
            ->select('month')
            ->distinct()
            ->get()
            ->pluck('month')
            ->sort(function ($a, $b) {
                try {
                    $da = Carbon::createFromFormat('M-y', $a);
                    $db = Carbon::createFromFormat('M-y', $b);
                    return $db <=> $da;
                } catch (\Throwable $e) {
                    return strcmp($b, $a);
                }
            })
            ->values()
            ->toArray();

        return response()->json(['months' => $months]);
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
        } elseif ($request->boolean('clear_signature') || $request->input('clear_signature') === '1') {
            SolarBillingSetting::setVal('signature_path', '');
            SolarBillingSetting::setVal('signature_url', '');
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
            'bills.*.month' => ['required', 'string', 'regex:/^[A-Za-z]{3}-\d{2}$/'],
            'bills.*.invoice_date' => 'required|date',
            'bills.*.units_credited' => 'required|numeric|min:0.01',
            'bills.*.stmt_inputs' => 'required',
            'pdf_file' => 'nullable|file|mimes:pdf|max:10240', // 10MB max
        ], [
            'bills.*.month.regex' => 'બિલિંગ મહિનો માન્ય ફોર્મેટ (જેમ કે Oct-26) માં હોવો જોઈએ.',
        ]);

        $pdfPath = null;
        if ($request->hasFile('pdf_file')) {
            $file = $request->file('pdf_file');
            if ($file->isValid()) {
                $ext = strtolower($file->getClientOriginalExtension());
                if ($ext !== 'pdf') {
                    return response()->json([
                        'message' => 'ફક્ત માન્ય PDF (.pdf) ફાઈલ જ સ્વીકારવામાં આવે છે.',
                        'errors' => ['pdf_file' => ['ફક્ત માન્ય PDF (.pdf) ફાઈલ જ સ્વીકારવામાં આવે છે.']],
                    ], 422);
                }
                // Verify %PDF- magic bytes to reject renamed non-PDF files
                $handle = @fopen($file->getRealPath(), 'rb');
                if ($handle) {
                    $header = fread($handle, 5);
                    fclose($handle);
                    if ($header !== '%PDF-') {
                        return response()->json([
                            'message' => 'અમાન્ય PDF: અપલોડ કરેલ ફાઈલ સાચો PDF દસ્તાવેજ નથી.',
                            'errors' => ['pdf_file' => ['અમાન્ય PDF: અપલોડ કરેલ ફાઈલ સાચો PDF દસ્તાવેજ નથી.']],
                        ], 422);
                    }
                }
                // Store on private disk so statement PDFs are never exposed via direct public URLs
                $uploaded = $file->store('billing_statements', 'private');
                $pdfPath = $uploaded;
            }
        }

        $userId = $request->user()?->id;
        $savedBills = [];

        try {
            DB::transaction(function () use ($request, $pdfPath, $userId, &$savedBills) {
                foreach ($request->input('bills') as $billInput) {
                    $companyId = (int) $billInput['company_id'];

                    // 1. Pessimistic lock on company sequence row
                    $company = SolarBillingCompany::where('id', $companyId)->lockForUpdate()->firstOrFail();

                    // 2. SERVER-SIDE FINANCIAL SOURCE OF TRUTH:
                    // Independently recomputes all rates, breakdown, discount, roundoff, and canonical due_date.
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

                    // 5. Save Bill with 100% CANONICAL SERVER-VERIFIED FIGURES & TAMPER-PROOF DUE DATE
                    $bill = SolarBill::create([
                        'company_id' => $company->id,
                        'month' => $billInput['month'],
                        'invoice_no' => $invoiceNo,
                        'invoice_date' => $invDate,
                        'due_date' => $verified['due_date'],
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
                        'prev_invoice_no' => $verified['prev_invoice_no'] ?? null,
                        'interest_amt' => $verified['interest_amt'],
                        'interest_days' => $verified['interest_days'],
                        'interest_waived' => $verified['interest_waived'] ?? 0,
                        'interest_waive_reason' => $verified['interest_waive_reason'] ?? null,
                        'interest_waived_by' => ($verified['interest_waived'] ?? 0) > 0 ? $userId : null,
                        'interest_waived_at' => ($verified['interest_waived'] ?? 0) > 0 ? now() : null,
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

        // Check private disk first, fallback to local/public disk for legacy uploads
        $disk = Storage::disk('private')->exists("billing_statements/{$cleanFilename}")
            ? 'private'
            : (Storage::disk('local')->exists("billing_statements/{$cleanFilename}")
                ? 'local'
                : (Storage::disk('public')->exists("billing_statements/{$cleanFilename}") ? 'public' : null));

        if (! $disk) {
            return response()->json(['error' => 'Statement PDF file not found on server.'], 404);
        }

        $invClean = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $bill->invoice_no);
        $fullPath = Storage::disk($disk)->path("billing_statements/{$cleanFilename}");

        if ($request->boolean('inline') || $request->input('stream') === '1') {
            return response()->file($fullPath, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => "inline; filename=\"PGVCL-Statement-{$invClean}.pdf\"",
            ]);
        }

        return Storage::disk($disk)->download(
            "billing_statements/{$cleanFilename}",
            "PGVCL-Statement-{$invClean}.pdf"
        );
    }

    /**
     * Authenticated statement PDF download route alias.
     */
    public function downloadStatement(Request $request, $bill)
    {
        $id = $bill instanceof SolarBill ? $bill->id : (int) $bill;
        return $this->downloadPdf($request, $id);
    }

    /**
     * Daily Meter Reading vs PGVCL Credited Units Reconciliation Report.
     * Compares plant site export readings against credited utility units.
     */
    public function reconciliation(Request $request): JsonResponse
    {
        $monthStr = $request->input('month'); // e.g. 'Oct-26', 'Aug-26'
        if (! $monthStr) {
            $latestBill = SolarBill::orderByDesc('invoice_date')->first();
            $monthStr = $latestBill ? $latestBill->month : Carbon::now()->format('M-y');
        }

        try {
            $parsed = Carbon::createFromFormat('M-y', $monthStr);
        } catch (\Throwable $e) {
            $parsed = Carbon::now();
        }

        $year = (int) $parsed->format('Y');
        $monthNum = (int) $parsed->format('m');
        $monthName = $parsed->format('F Y');

        // 1. Plant Site Generation from Daily Readings
        $dailyRows = \App\Models\DailyReading::whereYear('reading_date', $year)
            ->whereMonth('reading_date', $monthNum)
            ->orderBy('reading_date')
            ->get();

        $plantMeterExport = (float) $dailyRows->sum('plant_export_unit');
        $plantMeterImport = (float) $dailyRows->sum('plant_import_unit');
        $subMeterExport = (float) $dailyRows->sum('sub_export_unit');
        $readingDaysCount = $dailyRows->count();

        // 2. PGVCL Bills for this Month
        $bills = SolarBill::with('company')
            ->where('month', $monthStr)
            ->where('status', '!=', 'void')
            ->get();

        $pgvclCreditedTotal = (float) $bills->sum('units_credited');
        $pgvclGeneratedTotal = (float) $bills->sum('units_generated');
        $pgvclGrandTotal = (float) $bills->sum('current_grand_total');

        // Weighted Average Bill Rate (₹/unit)
        $avgBillRate = $pgvclCreditedTotal > 0
            ? round($pgvclGrandTotal / $pgvclCreditedTotal, 4)
            : (float) SolarBillingSetting::getVal('avg_bill_rate', 6.56);

        // 3. Variance & Loss Calculations
        // Difference: Plant Meter Export - PGVCL Credited
        $unitDifference = round($plantMeterExport - $pgvclCreditedTotal, 2);
        $lossPct = $plantMeterExport > 0
            ? round(($unitDifference / $plantMeterExport) * 100, 2)
            : 0.0;
        $financialLossValue = round(max(0, $unitDifference) * $avgBillRate, 2);

        // 4. Per-Company Breakdown
        $companyBreakdown = [];
        foreach ($bills as $b) {
            $coName = $b->company?->name ?: 'Unknown Company';
            $breakdown = $b->breakdown ?: [];
            $rate = isset($breakdown['billRate']) ? (float) $breakdown['billRate'] : ($b->units_credited > 0 ? round($b->sub_total / $b->units_credited, 4) : 0);
            $sharePct = $pgvclCreditedTotal > 0 ? round(($b->units_credited / $pgvclCreditedTotal) * 100, 2) : 0;
            $meterAllocated = round($plantMeterExport * ($sharePct / 100), 2);
            $coDiff = round($meterAllocated - (float) $b->units_credited, 2);

            $companyBreakdown[] = [
                'bill_id' => $b->id,
                'company_id' => $b->company_id,
                'company_name' => $coName,
                'invoice_no' => $b->invoice_no,
                'credited_units' => (float) $b->units_credited,
                'allocated_meter_units' => $meterAllocated,
                'unit_diff' => $coDiff,
                'bill_rate' => $rate,
                'grand_total' => (float) $b->current_grand_total,
                'share_pct' => $sharePct,
                'loss_value' => round(max(0, $coDiff) * $rate, 2),
            ];
        }

        // 5. Day-by-Day Reading Breakdown
        $dayWise = $dailyRows->map(function ($r) {
            return [
                'date' => Carbon::parse($r->reading_date)->format('d M Y'),
                'raw_date' => Carbon::parse($r->reading_date)->format('Y-m-d'),
                'export_unit' => (float) $r->plant_export_unit,
                'import_unit' => (float) $r->plant_import_unit,
                'sub_export_unit' => (float) $r->sub_export_unit,
            ];
        });

        // 6. Available Billing Months in System for dropdown
        $availableMonths = SolarBill::where('status', '!=', 'void')
            ->distinct()
            ->pluck('month')
            ->toArray();
        if (! in_array($monthStr, $availableMonths)) {
            $availableMonths[] = $monthStr;
        }

        return response()->json([
            'month' => $monthStr,
            'month_label' => $monthName,
            'summary' => [
                'plant_meter_export' => $plantMeterExport,
                'plant_meter_import' => $plantMeterImport,
                'sub_meter_export' => $subMeterExport,
                'reading_days' => $readingDaysCount,
                'pgvcl_credited_units' => $pgvclCreditedTotal,
                'pgvcl_generated_units' => $pgvclGeneratedTotal,
                'pgvcl_grand_total' => $pgvclGrandTotal,
                'unit_difference' => $unitDifference,
                'loss_percentage' => $lossPct,
                'avg_bill_rate' => $avgBillRate,
                'financial_loss_value' => $financialLossValue,
            ],
            'companies' => $companyBreakdown,
            'daily_readings' => $dayWise,
            'available_months' => $availableMonths,
        ]);
    }

    /**
     * List all dynamic charges and rebates from the Charge Master.
     */
    public function charges(Request $request): JsonResponse
    {
        $charges = SolarBillingCharge::with('company:id,name')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json($charges);
    }

    /**
     * Create or update a charge/rebate in the Charge Master.
     * Supports rate history (archives previous row by setting effective_to when value changes).
     */
    public function saveCharge(Request $request, ?int $id = null): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:191',
            'code' => 'required|string|max:64|regex:/^[a-z0-9_]+$/',
            'type' => 'required|in:charge,rebate',
            'calc_basis' => 'required|in:per_unit,per_banking_unit,per_peak_unit,per_gen_unit,pct_energy,pct_energy_fca,pct_board,fixed',
            'value' => 'required|numeric',
            'company_id' => 'nullable|integer|exists:solar_billing_companies,id',
            'effective_from' => 'required|date',
            'effective_to' => 'nullable|date|after_or_equal:effective_from',
            'is_active' => 'nullable|boolean',
            'sort_order' => 'nullable|integer',
            'history' => 'nullable|boolean',
        ]);

        $data['is_active'] = $request->has('is_active') ? $request->boolean('is_active') : true;
        $data['sort_order'] = (int) ($data['sort_order'] ?? 0);

        if ($id) {
            $charge = SolarBillingCharge::findOrFail($id);
            if (! empty($data['history']) && (float) $charge->value != (float) $data['value']) {
                // Rate History preservation: archive old rate
                $newStart = Carbon::parse($data['effective_from']);
                $charge->update([
                    'effective_to' => $newStart->copy()->subDay()->format('Y-m-d'),
                ]);
                unset($data['history']);
                $newCharge = SolarBillingCharge::create($data);
                return response()->json([
                    'message' => 'New rate history row created successfully',
                    'charge' => $newCharge->load('company:id,name'),
                ]);
            } else {
                unset($data['history']);
                $charge->update($data);
                return response()->json([
                    'message' => 'Charge updated successfully',
                    'charge' => $charge->load('company:id,name'),
                ]);
            }
        }

        unset($data['history']);
        $charge = SolarBillingCharge::create($data);
        return response()->json([
            'message' => 'Charge created successfully',
            'charge' => $charge->load('company:id,name'),
        ]);
    }

    /**
     * Toggle active status of a charge/rebate.
     */
    public function toggleCharge(Request $request, int $id): JsonResponse
    {
        $charge = SolarBillingCharge::findOrFail($id);
        $charge->is_active = ! $charge->is_active;
        $charge->save();

        return response()->json([
            'message' => 'Charge status toggled',
            'is_active' => $charge->is_active,
        ]);
    }

    /**
     * Disable a charge/rebate (Soft disable to preserve audit integrity).
     */
    public function destroyCharge(Request $request, int $id): JsonResponse
    {
        $charge = SolarBillingCharge::findOrFail($id);
        $charge->is_active = false;
        $charge->save();

        return response()->json(['message' => 'Charge disabled successfully (Audit safe)']);
    }

    /**
     * Waive or update overdue interest on an existing bill with mandatory reason.
     */
    public function waiveInterest(Request $request, int $id): JsonResponse
    {
        $bill = SolarBill::where('id', $id)->lockForUpdate()->firstOrFail();

        if ($bill->status === 'void') {
            return response()->json(['error' => 'Void bills cannot be modified.'], 422);
        }

        $data = $request->validate([
            'interest_waived' => 'required|numeric|min:0',
            'reason' => 'required|string|min:3|max:500',
        ], [
            'reason.required' => 'વ્યાજ માફ કરવા માટે કારણ (Reason) લખવું ફરજિયાત છે.',
        ]);

        $waived = round((float) $data['interest_waived'], 2);
        $totalInterest = (float) $bill->interest_amt;

        if ($waived > $totalInterest) {
            return response()->json([
                'error' => 'માફ કરેલ વ્યાજ કુલ વ્યાજ (₹' . number_format($totalInterest, 2) . ') કરતાં વધુ ન હોઈ શકે.'
            ], 422);
        }

        $currentGrand = (float) $bill->current_grand_total;
        $prevBal = (float) $bill->prev_balance;
        $netInterest = max(0.0, $totalInterest - $waived);

        $bill->interest_waived = $waived;
        $bill->interest_waive_reason = trim($data['reason']);
        $bill->interest_waived_by = $request->user()?->id;
        $bill->interest_waived_at = $waived > 0 ? now() : null;
        $bill->total_outstanding = round($currentGrand + $prevBal + $netInterest, 2);
        $bill->save();

        return response()->json([
            'message' => $waived > 0 ? 'Interest waived successfully ✓' : 'Interest waiver updated ✓',
            'bill' => $bill,
        ]);
    }

    /**
     * Stream company signature image reliably without relying on broken /storage symlinks.
     */
    public function companySignature(int $id)
    {
        $company = SolarBillingCompany::find($id);
        if (!$company || !$company->signature_path || $company->signature_enabled === false) {
            return $this->transparentPixelResponse();
        }

        return $this->streamSignatureFile($company->signature_path);
    }

    /**
     * Stream global fallback signature image reliably.
     */
    public function globalSignature()
    {
        $enabled = SolarBillingSetting::getVal('signature_enabled', '1');
        if ($enabled === '0' || $enabled === false) {
            return $this->transparentPixelResponse();
        }

        $url = SolarBillingSetting::getVal('signature_url') ?: SolarBillingSetting::getVal('signature_path');
        if (!$url) {
            return $this->transparentPixelResponse();
        }

        return $this->streamSignatureFile($url);
    }

    /**
     * Helper to find and stream a signature file from public, local, or private storage.
     */
    protected function streamSignatureFile(string $storedPath)
    {
        // Strip out domain prefix or /storage/ prefix if present
        $clean = preg_replace('/^https?:\/\/[^\/]+/i', '', $storedPath);
        $clean = preg_replace('/^\/?storage\//i', '', $clean);
        $clean = ltrim($clean, '/');

        $candidatePaths = [
            storage_path('app/public/' . $clean),
            storage_path('app/private/' . $clean),
            storage_path('app/' . $clean),
            public_path($clean),
            public_path('storage/' . $clean),
            base_path('public/' . $clean),
        ];

        foreach ($candidatePaths as $fullPath) {
            if (file_exists($fullPath) && is_file($fullPath)) {
                $mime = mime_content_type($fullPath) ?: 'image/png';
                return response()->file($fullPath, [
                    'Content-Type' => $mime,
                    'Cache-Control' => 'public, max-age=86400',
                ]);
            }
        }

        foreach (['public', 'local', 'private'] as $disk) {
            if (Storage::disk($disk)->exists($clean)) {
                $fullPath = Storage::disk($disk)->path($clean);
                if (file_exists($fullPath) && is_file($fullPath)) {
                    $mime = mime_content_type($fullPath) ?: 'image/png';
                    return response()->file($fullPath, [
                        'Content-Type' => $mime,
                        'Cache-Control' => 'public, max-age=86400',
                    ]);
                }
            }
        }

        return $this->transparentPixelResponse();
    }

    /**
     * 1x1 transparent PNG response so browser NEVER renders a broken image placeholder.
     */
    protected function transparentPixelResponse()
    {
        $pixel = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
        return response($pixel, 200, [
            'Content-Type' => 'image/png',
            'Content-Length' => strlen($pixel),
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }
}

