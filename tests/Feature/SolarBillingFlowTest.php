<?php

namespace Tests\Feature;

use App\Models\SolarBill;
use App\Models\SolarBillingCompany;
use App\Models\SolarBillingCharge;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SolarBillingFlowTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;
    protected SolarBillingCompany $rajeshwari;
    protected SolarBillingCompany $sunrise;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create([
            'role' => 'admin',
        ]);

        $this->rajeshwari = SolarBillingCompany::updateOrCreate(
            ['name' => 'RAJESHWARI SOLAR'],
            [
                'inv_prefix' => 'RS',
                'last_seq' => 0,
                'gstin' => '24ABJFR7554G1ZX',
                'bank_name' => 'State Bank of India',
                'bank_ac' => '44295348601',
                'bank_ifsc' => 'SBIN0060086',
                'discount' => 1.25,
                'due_days' => 15,
                'loss_pct' => 6.5,
                'cross_pct' => 15.0,
                'wheel_rate' => 0.2352,
                'bank_rate' => 1.50,
                'interest_pct' => 18.0,
                'active' => true,
            ]
        );

        $this->sunrise = SolarBillingCompany::updateOrCreate(
            ['name' => 'SUNRISE GREEN ENERGY'],
            [
                'inv_prefix' => 'SUN',
                'last_seq' => 0,
                'gstin' => '24FFNPP9576P1Z4',
                'bank_name' => 'State Bank of India',
                'bank_ac' => '44588738053',
                'bank_ifsc' => 'SBIN0060086',
                'discount' => 1.25,
                'due_days' => 10,
                'loss_pct' => 6.5,
                'cross_pct' => 15.0,
                'wheel_rate' => 0.2352,
                'bank_rate' => 1.50,
                'interest_pct' => 15.0,
                'active' => true,
            ]
        );
    }

    public function test_can_create_single_company_bill_and_strictly_derives_due_date(): void
    {
        Storage::fake('solar_bills');

        $stmt = [
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

        $derived = \App\Services\SolarBillingEngineService::deriveRates($stmt);
        $units = [
            'credited' => 105715,
            'peak' => 31708,
            'banking' => 20113,
            'generated' => 113064,
        ];
        $extra = [
            'lossPct' => 6.5,
            'crossPct' => 15.0,
            'wheelRate' => 0.2352,
            'bankRate' => 1.50,
        ];
        $result = \App\Services\SolarBillingEngineService::companyBill($units, $derived, $extra, 1.25);

        $invDate = '2026-08-15';
        $tamperedDueDate = '2099-12-31'; // Client attempts to supply distant due date

        // Valid PDF mock with %PDF- header
        $validPdf = UploadedFile::fake()->createWithContent('statement_aug_26.pdf', "%PDF-1.4\nPGVCL Statement Aug 2026");

        $response = $this->actingAs($this->user)->postJson('/api/billing/bills', [
            'bills' => [
                [
                    'company_id' => $this->rajeshwari->id,
                    'month' => 'Aug-26',
                    'invoice_no' => 'RS/26-27/001',
                    'invoice_date' => $invDate,
                    'due_date' => $tamperedDueDate, // Should be ignored by server
                    'customer_name' => 'Blueart Granito Pvt. Ltd.',
                    'customer_address' => 'Morbi-363642',
                    'customer_gstin' => '24AABCO3285B1ZU',
                    'units_credited' => 105715,
                    'units_peak' => 31708,
                    'units_banking' => 20113,
                    'units_generated' => 113064,
                    'prev_balance' => 0,
                    'interest_amt' => 0,
                    'interest_days' => 0,
                    'stmt_inputs' => json_encode($stmt),
                    'rates_derived' => json_encode($derived),
                    'extra_params' => json_encode($extra),
                    'breakdown' => json_encode($result),
                ],
            ],
            'pdf_file' => $validPdf,
        ]);

        $response->assertOk();
        $response->assertJsonFragment(['invoice_no' => 'RS/26-27/001']);

        // Assert server derived due date = invDate + 15 days = 2026-08-30 (ignoring tampered 2099-12-31)
        $expectedDueDate = Carbon::parse($invDate)->addDays(15)->format('Y-m-d');
        $this->assertDatabaseHas('solar_bills', [
            'invoice_no' => 'RS/26-27/001',
            'due_date' => $expectedDueDate,
            'status' => 'pending',
            'prev_balance' => 0,
            'total_outstanding' => $result['grand'],
        ]);

        $this->assertDatabaseMissing('solar_bills', [
            'due_date' => $tamperedDueDate,
        ]);
    }

    public function test_rejects_tampered_non_pdf_file_upload(): void
    {
        $fakeCorruptPdf = UploadedFile::fake()->createWithContent('corrupt.pdf', 'This is a plain text file spoofed as pdf');

        $stmt = [
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
        $derived = \App\Services\SolarBillingEngineService::deriveRates($stmt);
        $units = [
            'credited' => 105715,
            'peak' => 31708,
            'banking' => 20113,
            'generated' => 113064,
        ];
        $extra = [
            'lossPct' => 6.5,
            'crossPct' => 15.0,
            'wheelRate' => 0.2352,
            'bankRate' => 1.50,
        ];
        $result = \App\Services\SolarBillingEngineService::companyBill($units, $derived, $extra, 1.25);

        $response = $this->actingAs($this->user)->postJson('/api/billing/bills', [
            'bills' => [
                [
                    'company_id' => $this->rajeshwari->id,
                    'month' => 'Aug-26',
                    'invoice_no' => 'RS/26-27/002',
                    'invoice_date' => '2026-08-15',
                    'customer_name' => 'Blueart Granito Pvt. Ltd.',
                    'units_credited' => 105715,
                    'units_peak' => 31708,
                    'units_banking' => 20113,
                    'units_generated' => 113064,
                    'prev_balance' => 0,
                    'interest_amt' => 0,
                    'stmt_inputs' => json_encode($stmt),
                    'rates_derived' => json_encode($derived),
                    'extra_params' => json_encode([]),
                    'breakdown' => json_encode($result),
                ],
            ],
            'pdf_file' => $fakeCorruptPdf,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['pdf_file']);
    }

    public function test_can_create_two_company_split_bills_in_single_request(): void
    {
        $stmt = [
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
        $derived = \App\Services\SolarBillingEngineService::deriveRates($stmt);

        // Bill 1: Rajeshwari
        $units1 = ['credited' => 105715, 'peak' => 31708, 'banking' => 20113, 'generated' => 113064];
        $extra = ['lossPct' => 6.5, 'crossPct' => 15.0, 'wheelRate' => 0.2352, 'bankRate' => 1.50];
        $res1 = \App\Services\SolarBillingEngineService::companyBill($units1, $derived, $extra, 1.25);

        // Bill 2: Sunrise
        $units2 = ['credited' => 60392, 'peak' => 17699, 'banking' => 11497, 'generated' => 64590];
        $res2 = \App\Services\SolarBillingEngineService::companyBill($units2, $derived, $extra, 1.25);

        $validPdf = UploadedFile::fake()->createWithContent('statement_two_co.pdf', "%PDF-1.5\nPGVCL Two Company Statement");

        $response = $this->actingAs($this->user)->postJson('/api/billing/bills', [
            'bills' => [
                [
                    'company_id' => $this->rajeshwari->id,
                    'month' => 'Aug-26',
                    'invoice_no' => 'RS/26-27/001',
                    'invoice_date' => '2026-08-15',
                    'customer_name' => 'Blueart Granito Pvt. Ltd.',
                    'units_credited' => 105715,
                    'units_peak' => 31708,
                    'units_banking' => 20113,
                    'units_generated' => 113064,
                    'prev_balance' => 0,
                    'interest_amt' => 0,
                    'stmt_inputs' => json_encode($stmt),
                    'rates_derived' => json_encode($derived),
                    'extra_params' => json_encode($extra),
                    'breakdown' => json_encode($res1),
                ],
                [
                    'company_id' => $this->sunrise->id,
                    'month' => 'Aug-26',
                    'invoice_no' => 'SUN/26-27/001',
                    'invoice_date' => '2026-08-15',
                    'customer_name' => 'Blueart Granito Pvt. Ltd.',
                    'units_credited' => 60392,
                    'units_peak' => 17699,
                    'units_banking' => 11497,
                    'units_generated' => 64590,
                    'prev_balance' => 0,
                    'interest_amt' => 0,
                    'stmt_inputs' => json_encode($stmt),
                    'rates_derived' => json_encode($derived),
                    'extra_params' => json_encode($extra),
                    'breakdown' => json_encode($res2),
                ],
            ],
            'pdf_file' => $validPdf,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('solar_bills', ['invoice_no' => 'RS/26-27/001', 'total_outstanding' => $res1['grand']]);
        $this->assertDatabaseHas('solar_bills', ['invoice_no' => 'SUN/26-27/001', 'total_outstanding' => $res2['grand']]);
    }

    public function test_can_create_two_month_bills_for_same_company_in_single_request(): void
    {
        $stmt = [
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
        $derived = \App\Services\SolarBillingEngineService::deriveRates($stmt);
        $units = ['credited' => 105715, 'peak' => 31708, 'banking' => 20113, 'generated' => 113064];
        $extra = ['lossPct' => 6.5, 'crossPct' => 15.0, 'wheelRate' => 0.2352, 'bankRate' => 1.50];
        $res = \App\Services\SolarBillingEngineService::companyBill($units, $derived, $extra, 1.25);

        $validPdf = UploadedFile::fake()->createWithContent('statement_two_months.pdf', "%PDF-1.5\nPGVCL Sep-Oct Statement");

        // Bill 1: Sep-26 for Rajeshwari
        // Bill 2: Oct-26 for Rajeshwari (Same company!)
        $response = $this->actingAs($this->user)->postJson('/api/billing/bills', [
            'bills' => [
                [
                    'company_id' => $this->rajeshwari->id,
                    'month' => 'Sep-26',
                    'invoice_no' => 'RS/26-27/001',
                    'invoice_date' => '2026-09-05',
                    'customer_name' => 'Blueart Granito Pvt. Ltd.',
                    'units_credited' => 105715,
                    'units_peak' => 31708,
                    'units_banking' => 20113,
                    'units_generated' => 113064,
                    'prev_balance' => 0,
                    'interest_amt' => 0,
                    'stmt_inputs' => json_encode($stmt),
                    'rates_derived' => json_encode($derived),
                    'extra_params' => json_encode($extra),
                    'breakdown' => json_encode($res),
                ],
                [
                    'company_id' => $this->rajeshwari->id,
                    'month' => 'Oct-26',
                    'invoice_no' => 'RS/26-27/002',
                    'invoice_date' => '2026-10-05',
                    'customer_name' => 'Blueart Granito Pvt. Ltd.',
                    'units_credited' => 105715,
                    'units_peak' => 31708,
                    'units_banking' => 20113,
                    'units_generated' => 113064,
                    'prev_balance' => $res['grand'],
                    'interest_amt' => 0,
                    'stmt_inputs' => json_encode($stmt),
                    'rates_derived' => json_encode($derived),
                    'extra_params' => json_encode($extra),
                    'breakdown' => json_encode($res),
                ],
            ],
            'pdf_file' => $validPdf,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('solar_bills', ['invoice_no' => 'RS/26-27/001', 'company_id' => $this->rajeshwari->id, 'month' => 'Sep-26']);
        $this->assertDatabaseHas('solar_bills', ['invoice_no' => 'RS/26-27/002', 'company_id' => $this->rajeshwari->id, 'month' => 'Oct-26']);
        // Verify Sunrise was NOT created
        $this->assertDatabaseMissing('solar_bills', ['company_id' => $this->sunrise->id]);
    }

    public function test_next_month_pending_and_interest_calculation(): void
    {
        // 1. Create previous month bill (Sep-26) with due date 2026-09-20
        SolarBill::create([
            'company_id' => $this->rajeshwari->id,
            'month' => 'Sep-26',
            'invoice_no' => 'RS/26-27/010',
            'invoice_date' => '2026-09-05',
            'due_date' => '2026-09-20',
            'customer_name' => 'Blueart Granito Pvt. Ltd.',
            'units_credited' => 100000,
            'units_generated' => 105000,
            'sub_total' => 625000.00,
            'discount_amt' => 125000.00,
            'current_grand_total' => 500000.00,
            'prev_balance' => 0,
            'interest_amt' => 0,
            'total_outstanding' => 500000.00,
            'breakdown' => ['net' => 500000.00],
            'status' => 'pending', // Unpaid
        ]);

        // 2. Query pending endpoint
        $res = $this->actingAs($this->user)->getJson("/api/billing/pending/{$this->rajeshwari->id}");
        $res->assertOk();
        $res->assertJsonFragment([
            'prev_balance' => 500000.0,
            'prev_invoice_no' => 'RS/26-27/010',
        ]);
        $this->assertGreaterThan(0, $res->json('interest_amt'));
    }

    public function test_waive_interest_endpoint_validates_reason_and_updates_totals(): void
    {
        $bill = SolarBill::create([
            'company_id' => $this->rajeshwari->id,
            'month' => 'Oct-26',
            'invoice_no' => 'RS/26-27/011',
            'invoice_date' => '2026-10-05',
            'due_date' => '2026-10-20',
            'customer_name' => 'Blueart Granito Pvt. Ltd.',
            'units_credited' => 100000,
            'units_generated' => 105000,
            'sub_total' => 625000.00,
            'discount_amt' => 125000.00,
            'current_grand_total' => 500000.00,
            'prev_balance' => 100000.00,
            'interest_amt' => 5000.00,
            'total_outstanding' => 605000.00,
            'breakdown' => ['net' => 500000.00],
            'status' => 'pending',
        ]);

        // 1. Attempt waiver without reason -> 422
        $resFail = $this->actingAs($this->user)->postJson("/api/billing/bills/{$bill->id}/waive-interest", [
            'interest_waived' => 5000.00,
            'reason' => '',
        ]);
        $resFail->assertStatus(422);

        // 2. Waive with valid reason -> 200
        $resSuccess = $this->actingAs($this->user)->postJson("/api/billing/bills/{$bill->id}/waive-interest", [
            'interest_waived' => 5000.00,
            'reason' => 'Management special approval for festive settlement',
        ]);
        $resSuccess->assertOk();

        // 3. Verify total outstanding decreased by waived interest (605,000 - 5,000 = 600,000)
        $this->assertDatabaseHas('solar_bills', [
            'id' => $bill->id,
            'interest_waived' => 5000.00,
            'total_outstanding' => 600000.00,
            'interest_waive_reason' => 'Management special approval for festive settlement',
            'interest_waived_by' => $this->user->id,
        ]);
    }

    public function test_dynamic_charges_master_can_be_queried(): void
    {
        $res = $this->actingAs($this->user)->getJson('/api/billing/charges');
        $res->assertOk();

        // Verify default seeded charges exist
        $codes = collect($res->json())->pluck('code')->all();
        $this->assertContains('banking', $codes);
        $this->assertContains('wheeling', $codes);
        $this->assertContains('cross_subsidy', $codes);
        $this->assertContains('ppa_discount', $codes);
    }
}
