<?php

namespace App\Services;

use App\Models\SolarBill;
use App\Models\SolarBillingCompany;
use App\Models\SolarBillingSetting;
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
    public static function companyBill(array $units = [], array $rates = [], array $extra = [], float $discount = 1.25): array
    {
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
        $cross = ($energy + $fca) * ($crossPct / 100);
        $wheel = $generated * $wheelRate;
        $bankChg = $banking * $bankRate;
        $net = $total - $cross - $wheel - $bankChg;

        $billRate = self::safeDiv($net, $credited);
        $netRate = $billRate - $discount;
        $discountAmt = $credited * $discount;
        $rawGrand = $net - $discountAmt;
        $grand = (float) round($rawGrand);
        $roundOff = self::round2($grand - $rawGrand);

        if ($billRate > 0 && ($billRate < 6.0 || $billRate > 7.2)) {
            $warnings[] = sprintf('Bill Rate %.2f — should normally be between 6.0 and 7.2.', $billRate);
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
            'cross' => self::round2($cross),
            'wheeling' => self::round2($wheel),
            'banking' => self::round2($bankChg),
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
     */
    public static function getCompanyPendingAndInterest(int $companyId, ?float $interestPct = null, ?string $referenceDate = null): array
    {
        if ($interestPct === null) {
            $interestPct = (float) SolarBillingSetting::getVal('interest_pct', 18.0);
        }

        $pendingBills = SolarBill::where('company_id', $companyId)
            ->where('status', 'pending')
            ->get();

        $prevBal = (float) $pendingBills->sum('total_outstanding');
        $rawInterest = 0.00;
        $maxDays = 0;
        $ref = $referenceDate ? Carbon::parse($referenceDate)->startOfDay() : Carbon::now()->startOfDay();

        foreach ($pendingBills as $b) {
            $due = Carbon::parse($b->due_date ?: $b->invoice_date)->startOfDay();
            $days = $ref->greaterThan($due) ? $ref->diffInDays($due) : 0;
            if ($days > $maxDays) {
                $maxDays = $days;
            }
            if ($days > 0 && $b->total_outstanding > 0) {
                $rawInterest += (float) $b->total_outstanding * ($interestPct / 100) * ($days / 365);
            }
        }

        return [
            'prev_balance' => self::round2($prevBal),
            'interest_amt' => self::round2($rawInterest),
            'interest_days' => $maxDays,
            'interest_pct' => $interestPct,
        ];
    }

    /**
     * MASTER RECOMPUTATION & SECURITY GATEKEEPER:
     *
     * Validates that the submitted financial figures match the server's independent
     * recomputation from raw statement inputs within tolerance.
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

        // 4. Server computes breakdown independently
        $recomputed = self::companyBill($units, $serverRates, $extra, $discount);

        // 5. Server checks pending balance & interest directly from DB
        $interestPct = (float) SolarBillingSetting::getVal('interest_pct', 18.0);
        $invDate = $billInput['invoice_date'] ?? null;
        $dbPending = self::getCompanyPendingAndInterest($company->id, $interestPct, $invDate);

        // 6. Security verification: Compare server vs client
        $serverGrand = (float) $recomputed['grand'];
        $serverNet = (float) $recomputed['net'];
        $serverDiscountAmt = (float) $recomputed['discountAmt'];

        $clientGrand = self::num($clientBreakdown['grand'] ?? $billInput['current_grand_total'] ?? 0);
        $clientNet = self::num($clientBreakdown['net'] ?? $billInput['sub_total'] ?? 0);
        $clientDiscountAmt = self::num($clientBreakdown['discountAmt'] ?? $billInput['discount_amt'] ?? 0);

        // Check discrepancies if client provided amounts
        if ($clientGrand > 0) {
            $grandDiff = abs($serverGrand - $clientGrand);
            if ($grandDiff > self::TOLERANCE_RUPEES) {
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
        }

        if ($clientNet > 0) {
            $netDiff = abs($serverNet - $clientNet);
            if ($netDiff > self::TOLERANCE_RUPEES) {
                throw new InvalidArgumentException(
                    sprintf(
                        "Subtotal (Net PGVCL Credit) મેળ ખાતો નથી: Client ₹%s vs Server ₹%s (Difference: ₹%s). Request rejected.",
                        number_format($clientNet, 2),
                        number_format($serverNet, 2),
                        number_format($netDiff, 2)
                    )
                );
            }
        }

        if ($clientDiscountAmt > 0) {
            $discDiff = abs($serverDiscountAmt - $clientDiscountAmt);
            if ($discDiff > self::TOLERANCE_RUPEES) {
                throw new InvalidArgumentException(
                    sprintf(
                        "Discount Amount મેળ ખાતી નથી: Client ₹%s vs Server ₹%s. Request rejected.",
                        number_format($clientDiscountAmt, 2),
                        number_format($serverDiscountAmt, 2)
                    )
                );
            }
        }

        // Canonical server totals
        $prevBal = $dbPending['prev_balance'];
        $interestAmt = $dbPending['interest_amt'];
        $interestDays = $dbPending['interest_days'];
        $totalOutstanding = self::round2($serverGrand + $prevBal + $interestAmt);

        return [
            'stmt_inputs' => $stmt,
            'rates_derived' => $serverRates,
            'extra_params' => $extra,
            'breakdown' => $recomputed,
            'sub_total' => $recomputed['net'],
            'discount_rate' => $discount,
            'discount_amt' => $recomputed['discountAmt'],
            'round_off' => $recomputed['roundOff'],
            'current_grand_total' => $serverGrand,
            'prev_balance' => $prevBal,
            'interest_amt' => $interestAmt,
            'interest_days' => $interestDays,
            'total_outstanding' => $totalOutstanding,
            'units_generated' => $recomputed['generated'],
        ];
    }
}
