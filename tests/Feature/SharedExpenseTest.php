<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\SharedExpense;
use App\Models\User;
use App\Services\ExpenseExcelExporter;
use App\Services\SharedExpenseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class SharedExpenseTest extends TestCase
{
    use RefreshDatabase;

    public function test_three_company_expense_creates_exact_company_balances(): void
    {
        [$rajeshwari, $sunrise, $nilkanth] = $this->companies();
        $admin = User::factory()->create(['role' => 'super_admin']);

        $this->actingAs($admin)->postJson('/api/expenses', $this->expensePayload($rajeshwari, 300))
            ->assertCreated();

        $this->assertDatabaseHas('shared_expense_allocations', ['company_id' => $rajeshwari->id, 'percentage' => 40, 'share_amount' => 120]);
        $this->assertDatabaseHas('shared_expense_allocations', ['company_id' => $sunrise->id, 'percentage' => 30, 'share_amount' => 90]);
        $this->assertDatabaseHas('shared_expense_allocations', ['company_id' => $nilkanth->id, 'percentage' => 30, 'share_amount' => 90]);

        $this->actingAs($admin)->getJson('/api/expenses?date_from=2026-09-01&date_to=2026-09-30')
            ->assertOk()
            ->assertJsonPath('summary.total_outstanding', 180)
            ->assertJsonCount(2, 'balances');

        $rajeshwariUser = User::factory()->create(['company_id' => $rajeshwari->id, 'role' => 'viewer', 'permissions' => ['view_expenses']]);
        $sunriseUser = User::factory()->create(['company_id' => $sunrise->id, 'role' => 'viewer', 'permissions' => ['view_expenses']]);
        $this->actingAs($rajeshwariUser)->getJson('/api/expenses?date_from=2026-09-01&date_to=2026-09-30')
            ->assertJsonPath('summary.receivable', 180)
            ->assertJsonPath('summary.payable', 0);
        $this->actingAs($sunriseUser)->getJson('/api/expenses?date_from=2026-09-01&date_to=2026-09-30')
            ->assertJsonPath('summary.payable', 90)
            ->assertJsonCount(1, 'balances');
    }

    public function test_opposite_expenses_net_and_partial_then_full_settlement_is_visible_to_both_companies(): void
    {
        [$rajeshwari, $sunrise] = $this->companies();
        $admin = User::factory()->create(['role' => 'super_admin']);
        $this->actingAs($admin)->postJson('/api/expenses', $this->expensePayload($rajeshwari, 300))->assertCreated();
        $this->actingAs($admin)->postJson('/api/expenses', $this->expensePayload($sunrise, 100, 'Hardik'))->assertCreated();

        $response = $this->actingAs($admin)->getJson('/api/expenses?date_from=2026-09-01&date_to=2026-09-30')->assertOk();
        $pair = collect($response->json('balances'))->first(fn (array $row) => $row['company_ids'] === [$rajeshwari->id, $sunrise->id]);
        $this->assertSame($sunrise->id, $pair['debtor_company_id']);
        $this->assertSame($rajeshwari->id, $pair['creditor_company_id']);
        $this->assertSame(50, $pair['amount']);

        $settlement = ['settled_on' => '2026-09-20', 'from_company_id' => $sunrise->id, 'to_company_id' => $rajeshwari->id, 'amount' => 20, 'notes' => 'UPI'];
        $this->actingAs($admin)->postJson('/api/expense-settlements', [...$settlement, 'amount' => 51])->assertUnprocessable();
        $this->actingAs($admin)->postJson('/api/expense-settlements', $settlement)->assertCreated();
        $response = $this->actingAs($admin)->getJson('/api/expenses?date_from=2026-09-01&date_to=2026-09-30')->assertOk();
        $pair = collect($response->json('balances'))->first(fn (array $row) => $row['company_ids'] === [$rajeshwari->id, $sunrise->id]);
        $this->assertSame(30, $pair['amount']);
        $this->assertSame('partial', collect($response->json('entries'))->firstWhere('type', 'settlement')['status']);
        $this->actingAs($admin)->postJson('/api/expense-settlements', [...$settlement, 'amount' => 30])->assertCreated();

        $response = $this->actingAs($admin)->getJson('/api/expenses?date_from=2026-09-01&date_to=2026-09-30')->assertOk();
        $pair = collect($response->json('balances'))->first(fn (array $row) => $row['company_ids'] === [$rajeshwari->id, $sunrise->id]);
        $this->assertSame('cleared', $pair['status']);
        $this->assertSame(0, $pair['amount']);
        $this->assertSame('cleared', collect($response->json('entries'))->where('type', 'settlement')->first()['status']);

        foreach ([$rajeshwari, $sunrise] as $company) {
            $viewer = User::factory()->create(['company_id' => $company->id, 'role' => 'viewer', 'permissions' => ['view_expenses']]);
            $response = $this->actingAs($viewer)->getJson('/api/expenses?date_from=2026-09-01&date_to=2026-09-30')->assertOk();
            $pair = collect($response->json('balances'))->first(fn (array $row) => $row['company_ids'] === [$rajeshwari->id, $sunrise->id]);
            $this->assertSame('cleared', $pair['status']);
        }
    }

    public function test_percentage_configuration_is_atomic_and_historical_allocations_do_not_change(): void
    {
        [$rajeshwari, $sunrise, $nilkanth] = $this->companies();
        $admin = User::factory()->create(['role' => 'super_admin']);
        $this->actingAs($admin)->postJson('/api/expenses', $this->expensePayload($rajeshwari, 100))->assertCreated();
        $expense = SharedExpense::firstOrFail();

        $this->actingAs($admin)->postJson('/api/expense-percentages', ['percentages' => [
            ['company_id' => $rajeshwari->id, 'percentage' => 50],
            ['company_id' => $sunrise->id, 'percentage' => 20],
            ['company_id' => $nilkanth->id, 'percentage' => 20],
        ]])->assertUnprocessable();
        $this->actingAs($admin)->postJson('/api/expense-percentages', ['percentages' => [
            ['company_id' => $rajeshwari->id, 'percentage' => 50],
            ['company_id' => $sunrise->id, 'percentage' => 25],
            ['company_id' => $nilkanth->id, 'percentage' => 25],
        ]])->assertOk()->assertJsonPath('total', 100);

        $this->assertDatabaseHas('shared_expense_allocations', ['shared_expense_id' => $expense->id, 'company_id' => $sunrise->id, 'percentage' => 30, 'share_amount' => 30]);
        $this->actingAs($admin)->postJson('/api/expenses', $this->expensePayload($rajeshwari, 100, 'Jay', 'New split'))->assertCreated();
        $this->assertDatabaseHas('shared_expense_allocations', ['shared_expense_id' => SharedExpense::latest('id')->value('id'), 'company_id' => $sunrise->id, 'percentage' => 25, 'share_amount' => 25]);
    }

    public function test_rounding_future_dates_locking_reversal_and_access_are_enforced(): void
    {
        [$rajeshwari, $sunrise, $nilkanth] = $this->companies([33.33, 33.33, 33.34]);
        $outsider = Company::create(['name' => 'Outsider', 'active' => true, 'expense_percentage' => 0]);
        $admin = User::factory()->create(['role' => 'super_admin']);

        $this->actingAs($admin)->postJson('/api/expenses', $this->expensePayload($rajeshwari, 0.01))->assertCreated();
        $this->assertSame(0.01, (float) SharedExpense::first()->allocations()->sum('share_amount'));
        $this->actingAs($admin)->postJson('/api/expenses', [...$this->expensePayload($rajeshwari, 10), 'expense_date' => now()->addDay()->toDateString()])->assertUnprocessable();

        $expense = SharedExpense::firstOrFail();
        $this->actingAs($admin)->postJson('/api/expense-settlements', ['settled_on' => '2026-09-20', 'from_company_id' => $nilkanth->id, 'to_company_id' => $rajeshwari->id, 'amount' => 0.01])->assertCreated();
        $this->actingAs($admin)->postJson('/api/expenses/'.$expense->id, $this->expensePayload($rajeshwari, 1))->assertUnprocessable();
        $this->actingAs($admin)->postJson('/api/expenses/'.$expense->id.'/reverse')->assertCreated();
        $this->assertDatabaseHas('shared_expenses', ['id' => $expense->id, 'status' => 'reversed']);
        $this->assertDatabaseHas('shared_expenses', ['entry_type' => 'reversal', 'reverses_expense_id' => $expense->id, 'amount' => -0.01]);

        $viewer = User::factory()->create(['company_id' => $sunrise->id, 'role' => 'viewer', 'permissions' => ['view_expenses']]);
        $this->actingAs($viewer)->postJson('/api/expenses', $this->expensePayload($sunrise, 50))->assertForbidden();
        $outsiderViewer = User::factory()->create(['company_id' => $outsider->id, 'role' => 'viewer', 'permissions' => ['view_expenses']]);
        $this->actingAs($outsiderViewer)->getJson('/api/expenses?date_from=2026-09-01&date_to=2026-09-30')->assertJsonCount(0, 'entries');
    }

    public function test_receipts_are_private_and_only_visible_to_involved_companies(): void
    {
        Storage::fake('local');
        [$rajeshwari, $sunrise] = $this->companies();
        $outsider = Company::create(['name' => 'Outsider', 'active' => true, 'expense_percentage' => 0]);
        $admin = User::factory()->create(['role' => 'super_admin']);
        $response = $this->actingAs($admin)->post('/api/expenses', [
            ...$this->expensePayload($rajeshwari, 300),
            'receipt' => UploadedFile::fake()->image('bill.jpg'),
        ]);
        $response->assertCreated();
        $expense = SharedExpense::firstOrFail();
        Storage::disk('local')->assertExists($expense->receipt_path);

        $involved = User::factory()->create(['company_id' => $sunrise->id, 'role' => 'viewer', 'permissions' => ['view_expenses']]);
        $notInvolved = User::factory()->create(['company_id' => $outsider->id, 'role' => 'viewer', 'permissions' => ['view_expenses']]);
        $this->actingAs($involved)->get('/api/expenses/'.$expense->id.'/receipt')->assertOk();
        $this->actingAs($notInvolved)->get('/api/expenses/'.$expense->id.'/receipt')->assertForbidden();
    }

    public function test_unsettled_expense_can_be_edited_and_cancelled_without_losing_audit_history(): void
    {
        [$rajeshwari] = $this->companies();
        $admin = User::factory()->create(['role' => 'super_admin']);
        $this->actingAs($admin)->postJson('/api/expenses', $this->expensePayload($rajeshwari, 300))->assertCreated();
        $expense = SharedExpense::firstOrFail();

        $this->actingAs($admin)->postJson('/api/expenses/'.$expense->id, $this->expensePayload($rajeshwari, 250, 'Jay', 'Corrected material'))
            ->assertOk()
            ->assertJsonPath('amount', '250.00');
        $this->actingAs($admin)->postJson('/api/expenses/'.$expense->id.'/cancel')->assertOk();

        $this->actingAs($admin)->getJson('/api/expenses?date_from=2026-09-01&date_to=2026-09-30')
            ->assertOk()
            ->assertJsonPath('entries.0.status', 'cancelled')
            ->assertJsonPath('entries.0.description', 'Corrected material')
            ->assertJsonCount(0, 'balances');
    }

    public function test_expense_excel_export_is_scoped_for_company_login_and_complete_for_super_admin(): void
    {
        [$rajeshwari, $sunrise] = $this->companies();
        $admin = User::factory()->create(['role' => 'super_admin']);
        $companyUser = User::factory()->create([
            'company_id' => $sunrise->id,
            'role' => 'viewer',
            'permissions' => ['view_expenses'],
        ]);
        $this->actingAs($admin)->postJson('/api/expenses', $this->expensePayload($rajeshwari, 300))->assertCreated();

        $from = now()->setDate(2026, 9, 1)->startOfDay();
        $to = now()->setDate(2026, 9, 30)->endOfDay();
        $service = app(SharedExpenseService::class);
        $exporter = app(ExpenseExcelExporter::class);

        $adminPath = $exporter->create($service->dashboard($admin, $from, $to), $admin);
        $adminBook = IOFactory::load($adminPath);
        $this->assertSame(['All Expenses', 'Company Allocations', 'Balances'], $adminBook->getSheetNames());
        $this->assertSame(300.0, $adminBook->getSheetByName('All Expenses')->getCell('G5')->getValue());
        $this->assertSame('Sunrise', $adminBook->getSheetByName('Company Allocations')->getCell('F3')->getValue());
        unlink($adminPath);

        $companyPath = $exporter->create($service->dashboard($companyUser, $from, $to), $companyUser);
        $companyBook = IOFactory::load($companyPath);
        $companySheet = $companyBook->getSheetByName('Company Expenses');
        $this->assertSame(['Company Expenses', 'Balances'], $companyBook->getSheetNames());
        $this->assertSame('Sunrise Expenses', $companySheet->getCell('A1')->getValue());
        $this->assertSame(90.0, $companySheet->getCell('I5')->getValue());
        $this->assertSame(-90.0, $companySheet->getCell('J5')->getValue());
        unlink($companyPath);

        $this->actingAs($admin)->get('/api/expenses/export/excel?date_from=2026-09-01&date_to=2026-09-30')
            ->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            ->assertDownload('expenses-all-companies-2026-09-01-2026-09-30.xlsx');
        $this->actingAs($companyUser)->get('/api/expenses/export/excel?date_from=2026-09-01&date_to=2026-09-30')
            ->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            ->assertDownload('expenses-sunrise-2026-09-01-2026-09-30.xlsx');
    }

    private function companies(array $percentages = [40, 30, 30]): array
    {
        return [
            Company::create(['name' => 'Rajeshwari', 'active' => true, 'expense_percentage' => $percentages[0]]),
            Company::create(['name' => 'Sunrise', 'active' => true, 'expense_percentage' => $percentages[1]]),
            Company::create(['name' => 'Nilkanth', 'active' => true, 'expense_percentage' => $percentages[2]]),
        ];
    }

    private function expensePayload(Company $company, float $amount, string $purchaser = 'Jay', string $description = 'Common material'): array
    {
        return [
            'expense_date' => '2026-09-20',
            'payer_company_id' => $company->id,
            'purchaser_name' => $purchaser,
            'description' => $description,
            'amount' => $amount,
            'notes' => 'Shared purchase',
        ];
    }
}
