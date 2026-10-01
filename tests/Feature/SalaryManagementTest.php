<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Company;
use App\Models\Employee;
use App\Models\EmployeeSalaryRate;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\SalaryAdjustment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class SalaryManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_approved_full_and_half_leave_are_the_only_salary_deductions(): void
    {
        Carbon::setTestNow('2026-10-05 10:00:00');
        $super = $this->superAdmin();
        $employee = $this->employee('EMP-001', [], '2026-09-01');
        $this->rate($employee, $super, '2026-09-01', 30000);
        $leaveType = LeaveType::firstOrFail();
        LeaveRequest::create(['employee_id' => $employee->id, 'leave_type_id' => $leaveType->id, 'date_from' => '2026-09-10', 'date_to' => '2026-09-10', 'day_part' => 'full_day', 'reason' => 'Personal', 'status' => 'approved']);
        LeaveRequest::create(['employee_id' => $employee->id, 'leave_type_id' => $leaveType->id, 'date_from' => '2026-09-11', 'date_to' => '2026-09-11', 'day_part' => 'first_half', 'reason' => 'Appointment', 'status' => 'approved']);
        LeaveRequest::create(['employee_id' => $employee->id, 'leave_type_id' => $leaveType->id, 'date_from' => '2026-09-12', 'date_to' => '2026-09-12', 'day_part' => 'full_day', 'reason' => 'Pending', 'status' => 'pending']);

        $response = $this->actingAs($super)->getJson('/api/salaries?month=2026-09');

        $response->assertOk()
            ->assertJsonPath('rows.0.monthly_salary', 30000)
            ->assertJsonPath('rows.0.scheduled_units', 30)
            ->assertJsonPath('rows.0.leave_units', 1.5)
            ->assertJsonPath('rows.0.prorated_gross', 30000)
            ->assertJsonPath('rows.0.leave_deduction', 1500)
            ->assertJsonPath('rows.0.final_payable', 28500);
        $this->assertGreaterThan(0, $response->json('rows.0.attendance.absent'));
    }

    public function test_joining_date_weekly_off_and_holidays_prorate_salary_and_cap_leave(): void
    {
        Carbon::setTestNow('2026-10-05 10:00:00');
        $super = $this->superAdmin();
        $employee = $this->employee('EMP-002', [0], '2026-09-16');
        $this->rate($employee, $super, '2026-09-01', 24500);
        Holiday::create(['name' => 'Full holiday', 'holiday_date' => '2026-09-07', 'type' => 'full_day', 'active' => true]);
        Holiday::create(['name' => 'Morning holiday', 'holiday_date' => '2026-09-08', 'type' => 'first_half', 'active' => true]);
        $leaveType = LeaveType::firstOrFail();
        LeaveRequest::create(['employee_id' => $employee->id, 'leave_type_id' => $leaveType->id, 'date_from' => '2026-09-17', 'date_to' => '2026-09-17', 'day_part' => 'second_half', 'reason' => 'Half leave', 'status' => 'approved']);
        LeaveRequest::create(['employee_id' => $employee->id, 'leave_type_id' => $leaveType->id, 'date_from' => '2026-09-20', 'date_to' => '2026-09-20', 'day_part' => 'full_day', 'reason' => 'Sunday', 'status' => 'approved']);

        $response = $this->actingAs($super)->getJson('/api/salaries?month=2026-09');

        $response->assertOk()
            ->assertJsonPath('rows.0.scheduled_units', 24.5)
            ->assertJsonPath('rows.0.eligible_units', 13)
            ->assertJsonPath('rows.0.leave_units', .5)
            ->assertJsonPath('rows.0.prorated_gross', 13000)
            ->assertJsonPath('rows.0.leave_deduction', 500)
            ->assertJsonPath('rows.0.final_payable', 12500);
    }

    public function test_effective_salary_history_preserves_old_months_and_rejects_future_rates(): void
    {
        Carbon::setTestNow('2026-09-21 10:00:00');
        $super = $this->superAdmin();
        $employee = $this->employee();

        $this->actingAs($super)->postJson("/api/employees/{$employee->id}/salary-rates", ['effective_month' => '2026-08', 'monthly_salary' => 30000])->assertCreated();
        $this->actingAs($super)->postJson("/api/employees/{$employee->id}/salary-rates", ['effective_month' => '2026-09', 'monthly_salary' => 33000])->assertCreated();
        $this->actingAs($super)->getJson('/api/salaries?month=2026-08')->assertJsonPath('rows.0.monthly_salary', 30000);
        $this->actingAs($super)->getJson('/api/salaries?month=2026-09')->assertJsonPath('rows.0.monthly_salary', 33000)->assertJsonPath('period_status', 'provisional');
        $this->actingAs($super)->postJson("/api/employees/{$employee->id}/salary-rates", ['effective_month' => '2026-10', 'monthly_salary' => 35000])
            ->assertUnprocessable()->assertJsonValidationErrors('month');
        $this->assertDatabaseCount('employee_salary_rates', 2);
    }

    public function test_super_admin_adds_cancels_and_replaces_adjustments_without_negative_salary(): void
    {
        Carbon::setTestNow('2026-10-05 10:00:00');
        $super = $this->superAdmin('Payroll Admin');
        $employee = $this->employee();
        $this->rate($employee, $super, '2026-09-01', 30000);

        $this->actingAs($super)->postJson('/api/salary-adjustments', ['employee_id' => $employee->id, 'salary_month' => '2026-09', 'type' => 'addition', 'amount' => 1000, 'reason' => 'Performance reward'])->assertCreated();
        $deduction = $this->actingAs($super)->postJson('/api/salary-adjustments', ['employee_id' => $employee->id, 'salary_month' => '2026-09', 'type' => 'deduction', 'amount' => 500, 'reason' => 'Advance recovery'])->assertCreated()->json('id');
        $this->actingAs($super)->getJson('/api/salaries?month=2026-09')->assertJsonPath('rows.0.final_payable', 30500);
        $this->actingAs($super)->postJson('/api/salary-adjustments', ['employee_id' => $employee->id, 'salary_month' => '2026-09', 'type' => 'deduction', 'amount' => 40000, 'reason' => 'Too much'])
            ->assertUnprocessable()->assertJsonValidationErrors('amount');

        $this->actingAs($super)->postJson("/api/salary-adjustments/{$deduction}/cancel", [
            'correction_reason' => 'Incorrect recovery value', 'replacement_type' => 'deduction',
            'replacement_amount' => 700, 'replacement_reason' => 'Correct advance recovery',
        ])->assertOk()->assertJsonPath('replacement_adjustment.replaces_adjustment_id', $deduction);
        $this->actingAs($super)->getJson('/api/salaries?month=2026-09')->assertJsonPath('rows.0.final_payable', 30300);

        $employeeResponse = $this->actingAs($employee->user)->getJson('/api/my-salary?month=2026-09');
        $employeeResponse->assertOk()->assertJsonFragment(['reason' => 'Correct advance recovery', 'created_by' => 'Payroll Admin'])
            ->assertJsonFragment(['cancellation_reason' => 'Incorrect recovery value', 'cancelled_by' => 'Payroll Admin']);
        $this->assertSame(1, SalaryAdjustment::whereNotNull('cancelled_at')->count());
        $this->assertGreaterThanOrEqual(4, ActivityLog::whereIn('subject_type', ['employee_salary_rate', 'salary_adjustment'])->count());
    }

    public function test_salary_access_is_private_to_super_admin_and_the_employee_themselves(): void
    {
        Carbon::setTestNow('2026-09-21 10:00:00');
        $super = $this->superAdmin();
        $employee = $this->employee('EMP-PRIVATE');
        $other = $this->employee('EMP-OTHER');
        $this->rate($employee, $super, '2026-09-01', 42000);
        $company = Company::create(['name' => 'Salary Privacy Solar']);
        $admin = User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);

        $this->actingAs($employee->user)->getJson('/api/my-salary?month=2026-09')->assertOk()->assertJsonPath('statement.monthly_salary', 42000);
        $this->actingAs($other->user)->getJson('/api/my-salary?month=2026-09')->assertOk()->assertJsonPath('statement.configured', false);
        $this->actingAs($employee->user)->getJson('/api/salaries?month=2026-09')->assertForbidden();
        $this->actingAs($admin)->getJson('/api/salaries?month=2026-09')->assertForbidden();
        $this->actingAs($admin)->getJson("/api/employees/{$employee->id}/salary-rates")->assertForbidden();
        $this->actingAs($admin)->getJson('/api/employees')->assertOk()->assertJsonMissingPath('0.monthly_salary')->assertJsonMissingPath('0.salary_rates');
    }

    public function test_super_admin_exports_salary_workbook_and_future_reports_are_rejected(): void
    {
        Carbon::setTestNow('2026-09-21 10:00:00');
        $super = $this->superAdmin();
        $employee = $this->employee();
        $this->rate($employee, $super, '2026-09-01', 30000);

        $response = $this->actingAs($super)->get('/api/salaries/export/excel?month=2026-09')->assertOk()->assertDownload('employee-salary-2026-09.xlsx');
        $path = tempnam(sys_get_temp_dir(), 'salary-test-');
        file_put_contents($path, $response->streamedContent());
        $workbook = IOFactory::load($path);
        $this->assertSame(['Salary Summary', 'Attendance and Leave', 'Adjustments'], $workbook->getSheetNames());
        $this->assertSame('EMP-001', $workbook->getSheet(0)->getCell('A2')->getValue());
        $this->assertEquals(30000, $workbook->getSheet(0)->getCell('Q2')->getValue());
        $workbook->disconnectWorksheets();
        unlink($path);

        $this->actingAs($super)->getJson('/api/salaries?month=2026-10')->assertUnprocessable()->assertJsonValidationErrors('month');
    }

    private function superAdmin(string $name = 'Super Admin'): User
    {
        return User::factory()->create(['name' => $name, 'role' => 'super_admin']);
    }

    private function employee(string $code = 'EMP-001', array $weeklyOffs = [], string $joiningDate = '2026-01-01'): Employee
    {
        $user = User::factory()->create(['name' => $code.' Employee', 'role' => 'employee', 'company_id' => null]);

        return Employee::create([
            'user_id' => $user->id, 'employee_code' => $code, 'joining_date' => $joiningDate, 'active' => true,
            'shift_start' => '09:00', 'shift_end' => '18:00', 'working_minutes' => 480, 'half_day_minutes' => 240,
            'grace_minutes' => 15, 'weekly_offs' => $weeklyOffs,
        ]);
    }

    private function rate(Employee $employee, User $creator, string $month, float $salary): EmployeeSalaryRate
    {
        return EmployeeSalaryRate::create(['employee_id' => $employee->id, 'effective_month' => $month, 'monthly_salary' => $salary, 'created_by' => $creator->id]);
    }
}
