<?php

namespace Tests\Unit;

use App\Models\SolarBillingCompany;
use App\Services\SolarBillingEngineService;
use InvalidArgumentException;
use Tests\TestCase;

class SolarBillingEngineTest extends TestCase
{
    /**
     * Standard Aug-26 PGVCL Statement sample (Blueart Granito statement).
     */
    private function sampleStatement(): array
    {
        return [
            'unit' => 166107,
            'energyAmt' => 697649.40,
            'fcaAmt' => 406962.15,
            'pfAmt' => 14301.81,
            'ehvAmt' => 6976.49,
            'touAmt' => 41995.95,
            'totalPeak' => 49407,
            'varAmt' => 44074.00,
            'boardAmt' => 1169403.19,
            'dutyAmt' => 175410.48,
        ];
    }

    private function sampleExtra(): array
    {
        return [
            'lossPct' => 6.5,
            'crossPct' => 15,
            'wheelRate' => 0.2352,
            'bankRate' => 1.50,
        ];
    }

    private function sampleUnits(): array
    {
        return [
            'credited' => 105715,
            'peak' => 31708,
            'banking' => 20113,
            'generated' => 113064,
        ];
    }

    public function test_safe_div_handles_zero_cleanly(): void
    {
        $this->assertEquals(0.0, SolarBillingEngineService::safeDiv(100.0, 0.0));
        $this->assertEquals(0.0, SolarBillingEngineService::safeDiv(0.0, 0.0));
        $this->assertEquals(5.0, SolarBillingEngineService::safeDiv(10.0, 2.0));
    }

    public function test_derive_rates_from_pgvcl_credit_statement(): void
    {
        $stmt = $this->sampleStatement();
        $rates = SolarBillingEngineService::deriveRates($stmt);

        // 697649.40 / 166107 = 4.20
        $this->assertEqualsWithDelta(4.20, $rates['energyRate'], 0.001);
        // 406962.15 / 166107 = 2.45
        $this->assertEqualsWithDelta(2.45, $rates['fcaRate'], 0.001);
        // 14301.81 / 697649.40 = 2.05%
        $this->assertEqualsWithDelta(2.05, $rates['pfPct'], 0.001);
        // 6976.49 / 697649.40 = 1.00%
        $this->assertEqualsWithDelta(1.00, $rates['ehvPct'], 0.001);
        // 41995.95 / 49407 = 0.85
        $this->assertEqualsWithDelta(0.85, $rates['touRate'], 0.001);
        // 44074 / 1104611.55 = 3.99%
        $this->assertEqualsWithDelta(3.99, $rates['varPct'], 0.001);
        // 175410.48 / 1169403.19 = 15.00%
        $this->assertEqualsWithDelta(15.00, $rates['dutyPct'], 0.001);
    }

    public function test_computes_company_bill_matching_aug_26_statement(): void
    {
        $rates = SolarBillingEngineService::deriveRates($this->sampleStatement());
        $units = $this->sampleUnits();
        $extra = $this->sampleExtra();

        $bill = SolarBillingEngineService::companyBill($units, $rates, $extra, 1.25);

        // Net PGVCL Credit: ₹6,93,921.14
        $this->assertEquals(693921.14, $bill['net']);
        // Discount: 105715 * 1.25 = ₹1,32,143.75
        $this->assertEquals(132143.75, $bill['discountAmt']);
        // Raw Grand: 693921.14 - 132143.75 = 561777.39 -> Rounded to ₹5,61,777
        $this->assertEquals(561777.0, $bill['grand']);
        // Roundoff: 561777 - 561777.39 = -0.39
        $this->assertEquals(-0.39, $bill['roundOff']);
        // Bill Rate: ~6.564 / unit
        $this->assertEqualsWithDelta(6.564, $bill['billRate'], 0.01);
        // Net Rate: ~5.314 / unit
        $this->assertEqualsWithDelta(5.314, $bill['netRate'], 0.01);
    }

    public function test_verify_and_recompute_passes_valid_bill(): void
    {
        $company = new SolarBillingCompany([
            'id' => 999,
            'name' => 'Test Company',
            'discount' => 1.25,
        ]);

        $payload = [
            'company_id' => 999,
            'units_credited' => 105715,
            'units_peak' => 31708,
            'units_banking' => 20113,
            'units_generated' => 113064,
            'stmt_inputs' => $this->sampleStatement(),
            'extra_params' => $this->sampleExtra(),
            'breakdown' => [
                'grand' => 561777,
                'net' => 693921.14,
                'discountAmt' => 132143.75,
            ],
        ];

        $res = SolarBillingEngineService::verifyAndRecompute($payload, $company);

        $this->assertEquals(561777.0, $res['current_grand_total']);
        $this->assertEquals(693921.14, $res['sub_total']);
        $this->assertEquals(132143.75, $res['discount_amt']);
    }

    public function test_verify_and_recompute_rejects_financial_tampering(): void
    {
        $company = new SolarBillingCompany([
            'id' => 999,
            'name' => 'Test Company',
            'discount' => 1.25,
        ]);

        $payload = [
            'company_id' => 999,
            'units_credited' => 105715,
            'units_peak' => 31708,
            'units_banking' => 20113,
            'units_generated' => 113064,
            'stmt_inputs' => $this->sampleStatement(),
            'extra_params' => $this->sampleExtra(),
            'breakdown' => [
                'grand' => 500000, // Tampered: lower than real ₹5,61,777
                'net' => 693921.14,
                'discountAmt' => 132143.75,
            ],
        ];

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('ગણતરી મેળ ખાતી નથી (Financial Integrity Mismatch)');

        SolarBillingEngineService::verifyAndRecompute($payload, $company);
    }

    public function test_float_dust_does_not_trigger_false_rejection(): void
    {
        $company = new SolarBillingCompany([
            'id' => 999,
            'name' => 'Test Company',
            'discount' => 1.25,
        ]);

        // Client grand has IEEE 754 precision dust: 561777.0000000001
        $payload = [
            'company_id' => 999,
            'units_credited' => 105715,
            'units_peak' => 31708,
            'units_banking' => 20113,
            'units_generated' => 113064,
            'stmt_inputs' => $this->sampleStatement(),
            'extra_params' => $this->sampleExtra(),
            'breakdown' => [
                'grand' => 561777.0000000001,
                'net' => 693921.1400000002,
                'discountAmt' => 132143.7500000001,
            ],
        ];

        $res = SolarBillingEngineService::verifyAndRecompute($payload, $company);
        $this->assertEquals(561777.0, $res['current_grand_total']);
    }

    public function test_tolerance_allows_small_rounding_drift_under_two_rupees(): void
    {
        $company = new SolarBillingCompany([
            'id' => 999,
            'name' => 'Test Company',
            'discount' => 1.25,
        ]);

        // Drift of ₹1.00 (within ₹2.00 tolerance)
        $payload = [
            'company_id' => 999,
            'units_credited' => 105715,
            'units_peak' => 31708,
            'units_banking' => 20113,
            'units_generated' => 113064,
            'stmt_inputs' => $this->sampleStatement(),
            'extra_params' => $this->sampleExtra(),
            'breakdown' => [
                'grand' => 561778.0, // ₹1 diff
                'net' => 693921.14,
                'discountAmt' => 132143.75,
            ],
        ];

        $res = SolarBillingEngineService::verifyAndRecompute($payload, $company);
        // Server saves CANONICAL ₹561777, not the client drift ₹561778
        $this->assertEquals(561777.0, $res['current_grand_total']);
    }
}
