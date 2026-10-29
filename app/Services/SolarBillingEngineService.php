<?php

namespace App\Services;

use App\Models\SolarBill;
use App\Models\SolarBillingCompany;
use App\Models\SolarBillingSetting;
use App\Models\SolarBillingCharge;
use Carbon\Carbon;
use InvalidArgumentException;

class SolarBillingEngineService
{
    public const TOLERANCE_RUPEES = 2.00;

    /**
     * Safely parse a value as float with default fallback.
     */
    public static function num($v, float $default = 0.0): float
    {
        if (is_null($v) || $v === '') {
            return $default;
        }
        return is_numeric($v) ? (float) $v : $default;
    }

    /**
     * Zero-safe division.
     */
    public static function safeDiv(float $a, float $b): float
    {
        return abs($b) < 1e-9 ? 0.0 : $a / $b;
    }

    /**
     * Round to 2 decimal places.
     */
    public static function round2(float $v): float
    {
        return round($v, 2);
    }

    /**
     * Decode JSON string or return array.
     */
    public static function parseJsonOrArray($val): array
    {
        if (is_array($val)) {
            return $val;
        }
        if (is_string($val)) {
            $decoded = json_decode($val, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
        return [];
    }

    /**
     * Derive per-unit rates from PGVCL CREDIT column statement inputs.
     *
     * stmt: { unit, energyAmt, fcaAmt, pfAmt, ehvAmt, touAmt, totalPeak, varAmt, boardAmt, dutyAmt }
     */
    public static function deriveRates(array $stmt = []): array
    {
        $unit = self::num($stmt['unit'] ?? 0);
        $energyAmt = self::num($stmt['energyAmt'] ?? 0);
        $fcaAmt = self::num($stmt['fcaAmt'] ?? 0);
        $pfAmt = self::num($stmt['pfAmt'] ?? 0);
        $ehvAmt = self::num($stmt['ehvAmt'] ?? 0);
        $touAmt = self::num($stmt['touAmt'] ?? 0);
        $totalPeak = self::num($stmt['totalPeak'] ?? 0);
        $varAmt = self::num($stmt['varAmt'] ?? 0);
        $boardAmt = self::num($stmt['boardAmt'] ?? 0);
        $dutyAmt = self::num($stmt['dutyAmt'] ?? 0);

        return [
            'energyRate' => self::safeDiv($energyAmt, $unit),
            'fcaRate' => self::safeDiv($fcaAmt, $unit),
            'pfPct' => self::safeDiv($pfAmt, $energyAmt) * 100,
            'ehvPct' => self::safeDiv($ehvAmt, $energyAmt) * 100,
            'touRate' => self::safeDiv($touAmt, $totalPeak),
            'varPct' => self::safeDiv($varAmt, $energyAmt + $fcaAmt) * 100,
            'dutyPct' => self::safeDiv($dutyAmt, $boardAmt) * 100,
        ];
    }

    /**
     * Compute company share of the bill.
     *
     * units: { credited, peak, banking, generated }
     * rates: output of deriveRates
     * extra: { lossPct, crossPct, wheelRate, bankRate }
     * discount: Rs per unit (e.g. 1.25)
     */
    public static function companyBill(
        array $units = [],
        array $rates = [],
        array $extra = [],
        float $discount = 1.25,
        ?int $companyId = null,
        ?string $billDate = null
    ): array {
        $warnings = [];
        $credited = self::num($units['credited'] ?? 0);
        $peak = self::num($units['peak'] ?? 0);
        $banking = self::num($units['banking'] ?? 0);
        $lossPct = self::num($extra['lossPct'] ?? 0);
        $crossPct = self::num($extra['crossPct'] ?? 0);
        $wheelRate = self::num($extra['wheelRate'] ?? 0);
        $bankRate = self::num($extra['bankRate'] ?? 0);

        if ($credited <= 0) {
            $warnings[] = 'Credited unit 0 or empty.';
        }

        $generated = self::num($units['generated'] ?? 0);
        if ($generated <= 0 && $credited > 0) {
            $lossDenom = 1 - ($lossPct / 100);
            $generated = $lossDenom > 0 ? self::safeDiv($credited, $lossDenom) : 0.0;
            if ($generated <= 0) {
                $warnings[] = 'Generated unit could not be derived from Loss%.';
            }
        }

        $energy = $credited * self::num($rates['energyRate'] ?? 0);
        $fca = $credited * self::num($rates['fcaRate'] ?? 0);
        $pf = $energy * (self::num($rates['pfPct'] ?? 0) / 100);
        $ehv = $energy * (self::num($rates['ehvPct'] ?? 0) / 100);
        $tou = $peak * self::num($rates['touRate'] ?? 0);
        $vari = ($energy + $fca) * (self::num($rates['varPct'] ?? 0) / 100);
        $board = $energy + $fca - $pf - $ehv + $tou + $vari;
        $duty = $board * (self::num($rates['dutyPct'] ?? 0) / 100);
        $total = $board + $duty;

        // DYNAMIC CHARGE / REBATE MASTER CALCULATION
        $appliedCharges = [];
        $net = $total;
        $discountAmt = 0.0;
        $hasDynamicCharges = false;

        try {
            $date = $billDate ? Carbon::parse($billDate)->format('Y-m-d') : now()->format('Y-m-d');
            $chargesQuery = SolarBillingCharge::where('is_active', true)
                ->where('effective_from', '<=', $date)
                ->where(function ($q) use ($date) {
                    $q->whereNull('effective_to')->orWhere('effective_to', '>=', $date);
                })
                ->where(function ($q) use ($companyId) {
                    $q->whereNull('company_id');
                    if ($companyId) {
                        $q->orWhere('company_id', $companyId);
                    }
                })
                ->orderByRaw('company_id IS NULL ASC') // company-specific comes first
                ->orderBy('sort_order');

            $charges = $chargesQuery->get()->unique('code');

            if ($charges->isNotEmpty()) {
                $hasDynamicCharges = true;
                $hasPpa = false;

                foreach ($charges as $c) {
                    $cVal = (float) $c->value;

                    // Manual parameter overrides if non-default value passed in $extra
                    if ($c->code === 'wheeling' && isset($extra['wheelRate']) && is_numeric($extra['wheelRate']) && (float) $extra['wheelRate'] > 0) {
                        $cVal = (float) $extra['wheelRate'];
                    } elseif ($c->code === 'banking' && isset($extra['bankRate']) && is_numeric($extra['bankRate']) && (float) $extra['bankRate'] > 0) {
                        $cVal = (float) $extra['bankRate'];
                    } elseif ($c->code === 'cross_subsidy' && isset($extra['crossPct']) && is_numeric($extra['crossPct']) && (float) $extra['crossPct'] > 0) {
                        $cVal = (float) $extra['crossPct'];
                    } elseif ($c->code === 'ppa_discount' && $discount > 0) {
                        $cVal = $discount;
                    }

                    $rawAmt = match ($c->calc_basis) {
                        'per_unit' => $credited * $cVal,
                        'per_banking_unit' => $banking * $cVal, // Strictly banking units!
                        'per_peak_unit' => $peak * $cVal,
                        'per_gen_unit' => $generated * $cVal,
                        'pct_energy' => $energy * ($cVal / 100),
                        'pct_energy_fca' => ($energy + $fca) * ($cVal / 100),
                        'pct_board' => $board * ($cVal / 100),
                        'fixed' => $cVal,
                        default => 0.0,
                    };

                    if ($c->code === 'ppa_discount') {
                        $discountAmt = $rawAmt;
                        $discount = $cVal;
                        $hasPpa = true;
                    } else {
                        if ($c->type === 'rebate') {
                            $net -= $rawAmt;
                        } else {
                            $net += $rawAmt;
                        }
                    }

                    $appliedCharges[$c->code] = [
                        'name' => $c->name,
                        'code' => $c->code,
                        'type' => $c->type,
                        'calc_basis' => $c->calc_basis,
                        'value' => $cVal,
                        'amount' => self::round2($rawAmt),
                    ];
                }

                if (!$hasPpa) {
                    $discountAmt = $credited * $discount;
                }
            }
        } catch (\Throwable $e) {
            $hasDynamicCharges = false;
        }

        // Fallback for tests/environments without DB
        if (!$hasDynamicCharges) {
            $cross = ($energy + $fca) * ($crossPct / 100);
            $wheel = $generated * $wheelRate;
            $bankChg = $banking * $bankRate;
            $net = $total - $cross - $wheel - $bankChg;
            $discountAmt = $credited * $discount;

            $appliedCharges = [
                'cross_subsidy' => ['name' => 'Cross Subsidy', 'code' => 'cross_subsidy', 'type' => 'rebate', 'calc_basis' => 'pct_energy_fca', 'value' => $crossPct, 'amount' => self::round2($cross)],
                'wheeling' => ['name' => 'Wheeling Charge', 'code' => 'wheeling', 'type' => 'rebate', 'calc_basis' => 'per_gen_unit', 'value' => $wheelRate, 'amount' => self::round2($wheel)],
                'banking' => ['name' => 'Banking Charge', 'code' => 'banking', 'type' => 'rebate', 'calc_basis' => 'per_banking_unit', 'value' => $bankRate, 'amount' => self::round2($bankChg)],
                'ppa_discount' => ['name' => 'Discount (PPA)', 'code' => 'ppa_discount', 'type' => 'rebate', 'calc_basis' => 'per_unit', 'value' => $discount, 'amount' => self::round2($discountAmt)],
            ];
        }

        $crossVal = $appliedCharges['cross_subsidy']['amount'] ?? 0.0;
        $wheelVal = $appliedCharges['wheeling']['amount'] ?? 0.0;
        $bankVal = $appliedCharges['banking']['amount'] ?? 0.0;

        $billRate = self::safeDiv($net, $credited);
        $netRate = $billRate - $discount;
        $rawGrand = $net - $discountAmt;
        $grand = (float) round($rawGrand);
        $roundOff = self::round2($grand - $rawGrand);

        $minRate = isset($extra['min_bill_rate']) && is_numeric($extra['min_bill_rate'])
            ? (float) $extra['min_bill_rate']
            : (float) SolarBillingSetting::getVal('min_bill_rate', 6.00);
        $maxRate = isset($extra['max_bill_rate']) && is_numeric($extra['max_bill_rate'])
            ? (float) $extra['max_bill_rate']
            : (float) SolarBillingSetting::getVal('max_bill_rate', 7.20);

        if ($billRate > 0 && ($billRate < $minRate || $billRate > $maxRate)) {
            $warnings[] = sprintf('Bill Rate %.2f — should normally be between %.2f and %.2f.', $billRate, $minRate, $maxRate);
        }

        return [
            'generated' => self::round2($generated),
            'energy' => self::round2($energy),
            'fca' => self::round2($fca),
            'pf' => self::round2($pf),
            'ehv' => self::round2($ehv),
            'tou' => self::round2($tou),
            'variable' => self::round2($vari),
            'board' => self::round2($board),
            'duty' => self::round2($duty),
            'total' => self::round2($total),
            'cross' => self::round2($crossVal),
            'wheeling' => self::round2($wheelVal),
            'banking' => self::round2($bankVal),
            'charges' => $appliedCharges,
            'net' => self::round2($net),
            'billRate' => $billRate,
            'netRate' => $netRate,
            'discountAmt' => self::round2($discountAmt),
            'roundOff' => $roundOff,
            'grand' => $grand,
            'warnings' => $warnings,
        ];
    }

    /**
     * Compute actual pending balance & overdue interest from database records.
     * Enforces principal-based interest calculation (no interest-on-interest / double counting),
     * strictly accounts for partial payments, and provides proper grace period fallbacks.
     *
     * FAIL CLOSED: If database query fails, throws exception to rollback outer transaction.
     */
    public static function getCompanyPendingAndInterest(
        int $companyId,
        ?float $interestPct = null,
        ?string $referenceDate = null,
        bool $lockForUpdate = false
    ): array {
        if ($interestPct === null) {
            $comp = SolarBillingCompany::find($companyId);
            $interestPct = $comp && $comp->interest_pct !== null && is_numeric($comp->interest_pct)
                ? (float) $comp->interest_pct
                : (float) SolarBillingSetting::getVal('interest_pct', 18.0);
        }

        // FAIL CLOSED: No silent catch block! If database fails, exception bubbles up
        // to rollback transaction, preventing invoices from saving with false zero balances.
        $query = SolarBill::with('company:id,due_days')
            ->where('company_id', $companyId)
            ->whereIn('status', ['pending', 'partial']);

        // Pessimistic locking inside transaction prevents race conditions across concurrent bills
        if ($lockForUpdate && \Illuminate\Support\Facades\DB::transactionLevel() > 0) {
            $query->lockForUpdate();
        }

        $pendingBills = $query->get();

        // PRINCIPAL DEFINITION:
        // In utility billing, previous unpaid balance is the sum of unpaid monthly bill principals
        // (`current_grand_total - paid_amount`), avoiding double-counting of previous carry-forwards.
        $defaultDueDays = (int) SolarBillingSetting::getVal('due_days', 15);
        $prevBal = 0.00;
        $rawInterest = 0.00;
        $maxDays = 0;
        $ref = $referenceDate ? Carbon::parse($referenceDate)->startOfDay() : Carbon::now()->startOfDay();

        foreach ($pendingBills as $b) {
            // Grace period fallback: if due_date is null, fallback to invoice_date + due_days
            $coDueDays = (int) ($b->company?->due_days ?: $defaultDueDays);
            $due = $b->due_date
                ? Carbon::parse($b->due_date)->startOfDay()
                : Carbon::parse($b->invoice_date)->addDays($coDueDays)->startOfDay();

            $days = $ref->greaterThan($due) ? $due->diffInDays($ref) : 0;
            if ($days > $maxDays) {
                $maxDays = $days;
            }

            // Interest charged strictly on the unpaid principal of each overdue bill
            $paidAmt = (float) ($b->paid_amount ?? 0);
            $billPrincipal = (float) ($b->current_grand_total > 0 ? $b->current_grand_total : $b->total_outstanding);
            $unpaidPrincipal = max(0.0, $billPrincipal - $paidAmt);

            $prevBal += $unpaidPrincipal;

            if ($days > 0 && $unpaidPrincipal > 0) {
                $rawInterest += $unpaidPrincipal * ($interestPct / 100) * ($days / 365);
            }
        }

        $lastUnpaidInvNo = $pendingBills->sortByDesc('invoice_date')->first()?->invoice_no;

        return [
            'prev_balance' => self::round2($prevBal),
            'interest_amt' => self::round2($rawInterest),
            'interest_days' => $maxDays,
            'interest_pct' => $interestPct,
            'prev_invoice_no' => $lastUnpaidInvNo,
        ];
    }

    /**
     * MASTER RECOMPUTATION & SECURITY GATEKEEPER:
     *
     * Validates that the submitted financial figures match the server's independent
     * recomputation from raw statement inputs within tolerance.
     * Prevents float dust false-rejections by pre-rounding operands before diff comparison.
     * Rejects request if tampered or mismatched.
     * Returns server-verified canonical figures for database persistence.
     *
     * @throws InvalidArgumentException
     */
    public static function verifyAndRecompute(array $billInput, SolarBillingCompany $company): array
    {
        $stmt = self::parseJsonOrArray($billInput['stmt_inputs'] ?? []);
        $extra = self::parseJsonOrArray($billInput['extra_params'] ?? []);
        $clientBreakdown = self::parseJsonOrArray($billInput['breakdown'] ?? []);

        // Validate mandatory statement inputs
        $stmtUnit = self::num($stmt['unit'] ?? 0);
        if ($stmtUnit <= 0) {
            throw new InvalidArgumentException(
                "PGVCL Statement Total Unit ખાલી કે અમાન્ય છે (Statement Unit: {$stmtUnit}). ગણતરી માટે સ્ટેટમેન્ટ ડેટા ફરજિયાત છે."
            );
        }

        $credited = self::num($billInput['units_credited'] ?? 0);
        if ($credited <= 0) {
            throw new InvalidArgumentException('Credited units must be greater than zero.');
        }

        // 1. Server derives rates independently
        $serverRates = self::deriveRates($stmt);

        // 2. Server resolves company PPA discount
        $discount = $company->discount !== null && is_numeric($company->discount)
            ? (float) $company->discount
            : (float) SolarBillingSetting::getVal('default_discount', 1.25);

        // 3. Server units payload
        $units = [
            'credited' => $credited,
            'peak' => self::num($billInput['units_peak'] ?? 0),
            'banking' => self::num($billInput['units_banking'] ?? 0),
            'generated' => self::num($billInput['units_generated'] ?? 0),
        ];

        // Merge company-specific deductions if not explicitly supplied
        $extra['lossPct'] = isset($extra['lossPct']) && $extra['lossPct'] !== '' ? (float) $extra['lossPct'] : (float) ($company->loss_pct ?? 6.50);
        $extra['wheelRate'] = isset($extra['wheelRate']) && $extra['wheelRate'] !== '' ? (float) $extra['wheelRate'] : (float) ($company->wheel_rate ?? 0.2352);
        $extra['bankRate'] = isset($extra['bankRate']) && $extra['bankRate'] !== '' ? (float) $extra['bankRate'] : (float) ($company->bank_rate ?? 1.50);
        $extra['crossPct'] = isset($extra['crossPct']) && $extra['crossPct'] !== '' ? (float) $extra['crossPct'] : (float) ($company->cross_pct ?? 15.00);

        // 4. Server computes breakdown independently (with Dynamic Charge Master & company scope)
        $invDate = $billInput['invoice_date'] ?? null;
        $recomputed = self::companyBill($units, $serverRates, $extra, $discount, $company->id ?? null, $invDate);

        // 5. Server checks pending balance & interest directly from DB under row lock
        $dbPending = [
            'prev_balance' => 0.0,
            'interest_amt' => 0.0,
            'interest_days' => 0,
            'interest_pct' => 18.0,
            'prev_invoice_no' => null,
        ];
        if (! empty($company->id)) {
            $interestPct = $company->interest_pct !== null && is_numeric($company->interest_pct)
                ? (float) $company->interest_pct
                : (float) SolarBillingSetting::getVal('interest_pct', 18.0);
            $dbPending = self::getCompanyPendingAndInterest((int) $company->id, $interestPct, $invDate, true);
        }

        // 6. Security verification: Compare server vs client with float-dust protection
        $serverGrand = round((float) $recomputed['grand'], 2);
        $clientGrand = round(self::num($clientBreakdown['grand'] ?? $billInput['current_grand_total'] ?? 0), 2);
        $grandDiff = round(abs($serverGrand - $clientGrand), 2);

        $serverNet = round((float) $recomputed['net'], 2);
        $clientNet = round(self::num($clientBreakdown['net'] ?? $billInput['sub_total'] ?? 0), 2);
        $netDiff = round(abs($serverNet - $clientNet), 2);

        $serverDiscountAmt = round((float) $recomputed['discountAmt'], 2);
        $clientDiscountAmt = round(self::num($clientBreakdown['discountAmt'] ?? $billInput['discount_amt'] ?? 0), 2);
        $discDiff = round(abs($serverDiscountAmt - $clientDiscountAmt), 2);

        // Check discrepancies if client provided amounts
        if ($clientGrand > 0 && $grandDiff > self::TOLERANCE_RUPEES) {
            throw new InvalidArgumentException(
                sprintf(
                    "ગણતરી મેળ ખાતી નથી (Financial Integrity Mismatch): Client Grand Total ₹%s vs Server Recomputed ₹%s (Difference: ₹%s > ₹%.2f). સુરક્ષા કારણોસર આ બિલ સેવ થશે નહીં.",
                    number_format($clientGrand, 2),
                    number_format($serverGrand, 2),
                    number_format($grandDiff, 2),
                    self::TOLERANCE_RUPEES
                )
            );
        }

        if ($clientNet > 0 && $netDiff > self::TOLERANCE_RUPEES) {
            throw new InvalidArgumentException(
                sprintf(
                    "Subtotal (Net PGVCL Credit) મેળ ખાતો નથી: Client ₹%s vs Server ₹%s (Difference: ₹%s). Request rejected.",
                    number_format($clientNet, 2),
                    number_format($serverNet, 2),
                    number_format($netDiff, 2)
                )
            );
        }

        if ($clientDiscountAmt > 0 && $discDiff > self::TOLERANCE_RUPEES) {
            throw new InvalidArgumentException(
                sprintf(
                    "Discount Amount મેળ ખાતી નથી: Client ₹%s vs Server ₹%s. Request rejected.",
                    number_format($clientDiscountAmt, 2),
                    number_format($serverDiscountAmt, 2)
                )
            );
        }

        // Canonical server totals (DB pending has first priority; batch-chained billInput fallback)
        $prevBal = $dbPending['prev_balance'] > 0 ? $dbPending['prev_balance'] : (float) ($billInput['prev_balance'] ?? 0.0);
        $prevInvNo = ! empty($dbPending['prev_invoice_no']) ? $dbPending['prev_invoice_no'] : ($billInput['prev_invoice_no'] ?? null);
        $interestAmt = $dbPending['interest_amt'];
        $interestDays = $dbPending['interest_days'];

        // Overdue Interest: Apply or Waive handling
        $interestWaived = isset($billInput['interest_waived']) ? round(self::num($billInput['interest_waived']), 2) : 0.0;
        $waiveReason = trim($billInput['interest_waive_reason'] ?? '');

        if ($interestWaived > 0) {
            if (empty($waiveReason)) {
                throw new InvalidArgumentException("વ્યાજ માફ કરવા માટે કારણ (Reason) લખવું ફરજિયાત છે.");
            }
            if ($interestWaived > $interestAmt) {
                throw new InvalidArgumentException(
                    sprintf("માફ કરેલ વ્યાજ (₹%s) કુલ ગણતરી કરેલ વ્યાજ (₹%s) કરતાં વધુ ન હોઈ શકે.", number_format($interestWaived, 2), number_format($interestAmt, 2))
                );
            }
        }

        $appliedInterest = max(0.0, $interestAmt - $interestWaived);
        $totalOutstanding = self::round2($serverGrand + $prevBal + $appliedInterest);

        // Server derives canonical due_date (tamper-proof)
        $companyDueDays = (int) ($company->due_days ?: SolarBillingSetting::getVal('due_days', 15));
        $canonicalDueDate = Carbon::parse($invDate)->addDays($companyDueDays)->format('Y-m-d');

        return [
            'stmt_inputs' => $stmt,
            'rates_derived' => $serverRates,
            'extra_params' => $extra,
            'breakdown' => $recomputed,
            'sub_total' => $serverNet,
            'discount_rate' => $discount,
            'discount_amt' => $serverDiscountAmt,
            'round_off' => $recomputed['roundOff'],
            'current_grand_total' => $serverGrand,
            'prev_balance' => $prevBal,
            'interest_amt' => $interestAmt,
            'interest_days' => $interestDays,
            'interest_waived' => $interestWaived,
            'interest_waive_reason' => $interestWaived > 0 ? $waiveReason : null,
            'prev_invoice_no' => $prevInvNo,
            'total_outstanding' => $totalOutstanding,
            'units_generated' => $recomputed['generated'],
            'due_date' => $canonicalDueDate,
        ];
    }
}
