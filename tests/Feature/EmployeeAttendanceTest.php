<?php

namespace Tests\Feature;

use App\Models\AttendanceBreak;
use App\Models\AttendanceRecord;
use App\Models\Company;
use App\Models\DailyReading;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Inverter;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class EmployeeAttendanceTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_company_admin_creates_a_global_employee_login(): void
    {
        $admin = $this->admin('Alpha Solar');
        $response = $this->actingAs($admin)->postJson('/api/employees', $this->employeePayload());

        $response->assertSuccessful()->assertJsonPath('user.role', 'employee');
        $employee = Employee::firstOrFail();
        $this->assertNull($employee->user->company_id);
        $this->assertSame('employee', $employee->user->role);
        $this->actingAs($employee->user)->getJson('/api/companies')->assertOk()->assertJsonCount(1)->assertJsonPath('0.name', 'Alpha Solar')->assertJsonMissingPath('0.admin_email');
        $this->actingAs($employee->user)->getJson('/api/me')->assertJsonPath('employee.employee_code', 'EMP-001');
        $this->actingAs($employee->user)->getJson('/api/me')
            ->assertJsonFragment(['enter_readings'])
            ->assertJsonFragment(['view_stock'])
            ->assertJsonFragment(['manage_stock'])
            ->assertJsonFragment(['issue_stock'])
            ->assertJsonFragment(['return_stock']);
        $this->actingAs(User::factory()->create(['role' => 'super_admin']))->getJson('/api/users')->assertJsonMissing(['email' => 'employee@example.com']);
    }

    public function test_employee_clock_in_requires_selfie_and_location_then_clocks_out_with_notes(): void
    {
        Storage::fake('local');
        Carbon::setTestNow('2026-09-21 09:05:00');
        $employee = $this->employee();

        $this->actingAs($employee->user)->postJson('/api/attendance/clock-in', [])->assertUnprocessable()->assertJsonValidationErrors(['selfie', 'latitude', 'longitude']);
        $this->actingAs($employee->user)->withHeader('Accept', 'application/json')->post('/api/attendance/clock-in', [
            'selfie' => UploadedFile::fake()->image('selfie.jpg'), 'latitude' => 22.3039, 'longitude' => 70.8022, 'accuracy' => 8.25,
        ])->assertSuccessful()->assertJsonPath('status', 'open');
        $record = AttendanceRecord::firstOrFail();
        Storage::assertExists($record->selfie_path);

        Carbon::setTestNow('2026-09-21 17:10:00');
        $this->actingAs($employee->user)->postJson('/api/attendance/clock-out', [
            'latitude' => 22.3040, 'longitude' => 70.8023, 'accuracy' => 10,
            'work_done' => 'Completed meter reconciliation.', 'learned' => 'Learned the revised reporting flow.',
        ])->assertOk()->assertJsonPath('status', 'present')->assertJsonPath('work_minutes', 485);
        $this->assertDatabaseHas('attendance_records', ['work_done' => 'Completed meter reconciliation.', 'learned' => 'Learned the revised reporting flow.']);
    }

    public function test_employee_can_take_multiple_breaks_and_only_net_work_time_is_counted(): void
    {
        Storage::fake('local');
        Carbon::setTestNow('2026-09-21 09:00:00');
        $employee = $this->employee();
        $this->actingAs($employee->user)->withHeader('Accept', 'application/json')->post('/api/attendance/clock-in', [
            'selfie' => UploadedFile::fake()->image('selfie.jpg'), 'latitude' => 22.3, 'longitude' => 70.8,
        ])->assertSuccessful();

        Carbon::setTestNow('2026-09-21 10:00:00');
        $this->actingAs($employee->user)->postJson('/api/attendance/break-in')->assertSuccessful();
        Carbon::setTestNow('2026-09-21 10:15:00');
        $this->actingAs($employee->user)->postJson('/api/attendance/clock-out', [
            'latitude' => 22.3, 'longitude' => 70.8, 'work_done' => 'Work', 'learned' => 'Learning',
        ])->assertUnprocessable()->assertJsonValidationErrors('attendance');
        Carbon::setTestNow('2026-09-21 10:30:00');
        $this->actingAs($employee->user)->postJson('/api/attendance/break-out')->assertUnprocessable()->assertJsonValidationErrors('selfie');
        $this->actingAs($employee->user)->withHeader('Accept', 'application/json')->post('/api/attendance/break-out', [
            'selfie' => UploadedFile::fake()->image('break-return-1.jpg'),
        ])->assertSuccessful()->assertJsonPath('duration_minutes', 30)->assertJsonPath('return_selfie_url', '/api/attendance/breaks/1/selfie')->assertJsonMissingPath('return_selfie_path');

        Carbon::setTestNow('2026-09-21 13:00:00');
        $this->actingAs($employee->user)->postJson('/api/attendance/break-in')->assertSuccessful();
        Carbon::setTestNow('2026-09-21 13:15:00');
        $this->actingAs($employee->user)->withHeader('Accept', 'application/json')->post('/api/attendance/break-out', [
            'selfie' => UploadedFile::fake()->image('break-return-2.jpg'),
        ])->assertSuccessful()->assertJsonPath('duration_minutes', 15);

        Carbon::setTestNow('2026-09-21 17:45:00');
        $this->actingAs($employee->user)->postJson('/api/attendance/clock-out', [
            'latitude' => 22.3, 'longitude' => 70.8, 'work_done' => 'Completed work', 'learned' => 'Break flow',
        ])->assertOk()->assertJsonPath('work_minutes', 480)->assertJsonPath('break_minutes', 45)->assertJsonCount(2, 'breaks');
        $this->assertDatabaseCount('attendance_breaks', 2);
        AttendanceBreak::all()->each(fn (AttendanceBreak $break) => Storage::assertExists($break->return_selfie_path));
    }

    public function test_no_selected_weekly_off_means_every_day_is_working(): void
    {
        Carbon::setTestNow('2026-09-20 09:00:00');
        $admin = $this->admin('Everyday Solar');
        $payload = $this->employeePayload();
        $payload['weekly_offs'] = [];

        $this->actingAs($admin)->postJson('/api/employees', $payload)->assertSuccessful();
        $employee = Employee::firstOrFail();
        $this->assertSame([], $employee->weekly_offs);
        $this->actingAs($employee->user)->getJson('/api/attendance/today')
            ->assertOk()->assertJsonPath('weekly_off', false)->assertJsonPath('can_clock_in', true);
    }

    public function test_full_day_holiday_blocks_clock_in_and_half_day_is_shown(): void
    {
        Storage::fake('local');
        Carbon::setTestNow('2026-09-21 09:00:00');
        $employee = $this->employee();
        Holiday::create(['name' => 'Festival', 'holiday_date' => '2026-09-21', 'type' => 'full_day', 'active' => true]);

        $this->actingAs($employee->user)->getJson('/api/attendance/today')->assertJsonPath('holiday.name', 'Festival')->assertJsonPath('can_clock_in', false);
        $this->actingAs($employee->user)->withHeader('Accept', 'application/json')->post('/api/attendance/clock-in', [
            'selfie' => UploadedFile::fake()->image('selfie.jpg'), 'latitude' => 22.3, 'longitude' => 70.8,
        ])->assertUnprocessable()->assertJsonValidationErrors('attendance');

        Holiday::first()->update(['type' => 'first_half']);
        $this->actingAs($employee->user)->getJson('/api/attendance/today')->assertJsonPath('holiday.type', 'first_half')->assertJsonPath('can_clock_in', true);
    }

    public function test_any_company_manager_can_approve_common_employee_leave(): void
    {
        $employee = $this->employee();
        $manager = User::factory()->create(['company_id' => Company::create(['name' => 'Other Solar'])->id, 'role' => 'manager']);
        $this->actingAs($employee->user)->postJson('/api/leaves', [
            'date_from' => '2026-09-22', 'date_to' => '2026-09-22', 'day_part' => 'full_day', 'reason' => 'Personal work',
        ])->assertSuccessful();
        $leave = LeaveRequest::firstOrFail();
        $this->assertSame('General Leave', $leave->leaveType->name);

        $this->actingAs($manager)->postJson("/api/leaves/{$leave->id}/review", ['status' => 'approved', 'remarks' => 'Approved by manager'])->assertOk()->assertJsonPath('status', 'approved');
        $this->assertDatabaseHas('leave_requests', ['id' => $leave->id, 'reviewed_by' => $manager->id, 'status' => 'approved']);
    }

    public function test_manager_records_completed_attendance_for_marked_employee_with_full_audit(): void
    {
        Carbon::setTestNow('2026-09-21 20:00:00');
        $employee = $this->employee();
        $employee->update(['manager_attendance_only' => true, 'joining_date' => '2026-09-01']);
        $manager = User::factory()->create([
            'name' => 'Attendance Manager',
            'company_id' => Company::create(['name' => 'Manager Solar'])->id,
            'role' => 'manager',
        ]);

        $response = $this->actingAs($manager)->postJson('/api/attendance/manual', $this->manualAttendancePayload($employee, '2026-09-19'));

        $response->assertCreated()
            ->assertJsonPath('entry_source', 'manager')
            ->assertJsonPath('recorded_by.name', 'Attendance Manager')
            ->assertJsonPath('entry_reason', 'Employee does not own a smartphone.')
            ->assertJsonPath('status', 'present')
            ->assertJsonPath('work_minutes', 480)
            ->assertJsonPath('break_minutes', 60)
            ->assertJsonPath('clock_in_latitude', null)
            ->assertJsonMissingPath('selfie_path');
        $record = AttendanceRecord::firstOrFail();
        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $manager->id,
            'action' => 'created',
            'subject_type' => 'manager_attendance',
            'subject_id' => $record->id,
        ]);

        $this->actingAs($manager)->getJson('/api/attendance?date=2026-09-19')
            ->assertOk()
            ->assertJsonPath('0.selfie_url', null)
            ->assertJsonPath('0.recorded_by.name', 'Attendance Manager');
        $this->actingAs($employee->user)->getJson('/api/attendance/mine')
            ->assertOk()
            ->assertJsonPath('0.entry_source', 'manager')
            ->assertJsonPath('0.recorded_by.name', 'Attendance Manager');
        $this->actingAs($manager)->postJson("/api/attendance/{$record->id}/correct", [
            'clock_out_at' => '2026-09-19 18:30:00',
            'work_done' => 'Updated work',
            'learned' => 'Updated learning',
            'correction_reason' => 'Correction attempt',
        ])->assertForbidden();
        $admin = $this->admin('Attendance Owner');
        $this->actingAs($admin)->postJson("/api/attendance/{$record->id}/correct", [
            'clock_out_at' => '2026-09-19 18:30:00',
            'work_done' => 'Updated work',
            'learned' => 'Updated learning',
            'correction_reason' => 'Corrected manager entry',
        ])->assertOk()->assertJsonPath('break_minutes', 60)->assertJsonPath('work_minutes', 510);

        $report = $this->actingAs($manager)->getJson('/api/attendance-report?month=2026-09&employee_id='.$employee->id);
        $report->assertOk()->assertJsonFragment([
            'entry_source' => 'manager',
            'recorded_by' => 'Attendance Manager',
            'entry_reason' => 'Employee does not own a smartphone.',
        ]);
        $this->actingAs($manager)->get('/api/attendance-report/export/excel?month=2026-09&employee_id='.$employee->id)
            ->assertOk()->assertHeader('content-disposition');
    }

    public function test_company_admin_and_super_admin_can_record_marked_employee_attendance(): void
    {
        Carbon::setTestNow('2026-09-21 20:00:00');
        $employee = $this->employee();
        $employee->update(['manager_attendance_only' => true]);
        $admin = $this->admin('Attendance Admin');
        $superAdmin = User::factory()->create(['role' => 'super_admin']);

        $this->actingAs($admin)->postJson('/api/attendance/manual', $this->manualAttendancePayload($employee, '2026-09-18'))
            ->assertCreated()->assertJsonPath('recorded_by.id', $admin->id);
        $this->actingAs($superAdmin)->postJson('/api/attendance/manual', $this->manualAttendancePayload($employee, '2026-09-19'))
            ->assertCreated()->assertJsonPath('recorded_by.id', $superAdmin->id);
    }

    public function test_manager_attendance_requires_permission_and_marked_active_employee_and_disables_self_clock(): void
    {
        Storage::fake('local');
        Carbon::setTestNow('2026-09-21 20:00:00');
        $employee = $this->employee();
        $manager = User::factory()->create(['company_id' => Company::create(['name' => 'Manager Company'])->id, 'role' => 'manager']);
        $viewer = User::factory()->create([
            'company_id' => $manager->company_id,
            'role' => 'viewer',
            'permissions' => ['view_attendance'],
        ]);
        $payload = $this->manualAttendancePayload($employee, '2026-09-19');

        $this->actingAs($viewer)->postJson('/api/attendance/manual', $payload)->assertForbidden();
        $this->actingAs($manager)->postJson('/api/attendance/manual', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('employee_id');

        $employee->update(['manager_attendance_only' => true]);
        $this->actingAs($employee->user)->getJson('/api/attendance/today')
            ->assertOk()->assertJsonPath('manager_attendance_only', true)->assertJsonPath('can_clock_in', false);
        $this->actingAs($employee->user)->withHeader('Accept', 'application/json')->post('/api/attendance/clock-in', [
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
            'latitude' => 22.3,
            'longitude' => 70.8,
        ])->assertUnprocessable()->assertJsonValidationErrors('attendance');

        $employee->update(['active' => false]);
        $this->actingAs($manager)->postJson('/api/attendance/manual', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('employee_id');
    }

    public function test_manual_attendance_validates_dates_calendar_times_breaks_and_duplicates(): void
    {
        Carbon::setTestNow('2026-09-21 20:00:00');
        $employee = $this->employee();
        $employee->update(['manager_attendance_only' => true, 'joining_date' => '2026-09-10']);
        $manager = User::factory()->create(['company_id' => Company::create(['name' => 'Manager Company'])->id, 'role' => 'manager']);

        $this->actingAs($manager)->postJson('/api/attendance/manual', $this->manualAttendancePayload($employee, '2026-09-09'))
            ->assertUnprocessable()->assertJsonValidationErrors('attendance_date');
        $this->actingAs($manager)->postJson('/api/attendance/manual', $this->manualAttendancePayload($employee, '2026-09-22'))
            ->assertUnprocessable()->assertJsonValidationErrors('attendance_date');

        $futureTime = $this->manualAttendancePayload($employee, '2026-09-21');
        $futureTime['clock_out_at'] = '2026-09-21T21:00';
        $this->actingAs($manager)->postJson('/api/attendance/manual', $futureTime)
            ->assertUnprocessable()->assertJsonValidationErrors('clock_out_at');

        $invalidBreak = $this->manualAttendancePayload($employee, '2026-09-19');
        $invalidBreak['clock_out_at'] = '2026-09-19T10:00';
        $invalidBreak['break_minutes'] = 60;
        $this->actingAs($manager)->postJson('/api/attendance/manual', $invalidBreak)
            ->assertUnprocessable()->assertJsonValidationErrors('break_minutes');

        $this->actingAs($manager)->postJson('/api/attendance/manual', $this->manualAttendancePayload($employee, '2026-09-20'))
            ->assertUnprocessable()->assertJsonValidationErrors('attendance_date');
        Holiday::create(['name' => 'Festival', 'holiday_date' => '2026-09-18', 'type' => 'full_day', 'active' => true]);
        $this->actingAs($manager)->postJson('/api/attendance/manual', $this->manualAttendancePayload($employee, '2026-09-18'))
            ->assertUnprocessable()->assertJsonValidationErrors('attendance_date');

        LeaveRequest::create([
            'employee_id' => $employee->id,
            'leave_type_id' => LeaveType::firstOrFail()->id,
            'date_from' => '2026-09-17',
            'date_to' => '2026-09-17',
            'day_part' => 'full_day',
            'reason' => 'Approved leave',
            'status' => 'approved',
        ]);
        $this->actingAs($manager)->postJson('/api/attendance/manual', $this->manualAttendancePayload($employee, '2026-09-17'))
            ->assertUnprocessable()->assertJsonValidationErrors('attendance_date');

        LeaveRequest::create([
            'employee_id' => $employee->id,
            'leave_type_id' => LeaveType::firstOrFail()->id,
            'date_from' => '2026-09-16',
            'date_to' => '2026-09-16',
            'day_part' => 'first_half',
            'reason' => 'Morning appointment',
            'status' => 'approved',
        ]);
        $halfDay = $this->manualAttendancePayload($employee, '2026-09-16');
        $halfDay['clock_in_at'] = '2026-09-16T13:00';
        $halfDay['clock_out_at'] = '2026-09-16T17:00';
        $halfDay['break_minutes'] = 0;
        $this->actingAs($manager)->postJson('/api/attendance/manual', $halfDay)
            ->assertCreated()->assertJsonPath('status', 'present')->assertJsonPath('work_minutes', 240);
        $this->actingAs($manager)->postJson('/api/attendance/manual', $halfDay)
            ->assertUnprocessable()->assertJsonValidationErrors('attendance_date');
    }

    public function test_only_owner_or_admin_can_correct_a_missing_clock_out_and_change_is_audited(): void
    {
        Carbon::setTestNow('2026-09-21 09:00:00');
        $employee = $this->employee();
        $record = AttendanceRecord::create(['employee_id' => $employee->id, 'attendance_date' => '2026-09-21', 'clock_in_at' => now(), 'clock_in_latitude' => 22.3, 'clock_in_longitude' => 70.8, 'selfie_path' => 'selfie.jpg']);
        $manager = User::factory()->create(['company_id' => Company::create(['name' => 'Manager Company'])->id, 'role' => 'manager']);
        $payload = ['clock_out_at' => '2026-09-21 18:00:00', 'work_done' => 'Recorded by owner', 'learned' => 'Reviewed process', 'correction_reason' => 'Employee forgot to clock out'];

        $this->actingAs($manager)->postJson("/api/attendance/{$record->id}/correct", $payload)->assertForbidden();
        $admin = $this->admin('Owner Company');
        $this->actingAs($admin)->postJson("/api/attendance/{$record->id}/correct", $payload)->assertOk()->assertJsonPath('manual_correction', true);
        $this->assertDatabaseHas('attendance_adjustments', ['attendance_record_id' => $record->id, 'user_id' => $admin->id, 'reason' => 'Employee forgot to clock out']);
        $this->assertNull($record->fresh()->clock_out_latitude);
    }

    public function test_monthly_report_and_exports_include_common_employee_summary(): void
    {
        Carbon::setTestNow('2026-09-30 20:00:00');
        $employee = $this->employee();
        AttendanceRecord::create(['employee_id' => $employee->id, 'attendance_date' => '2026-09-21', 'clock_in_at' => '2026-09-21 09:00:00', 'clock_in_latitude' => 22.3, 'clock_in_longitude' => 70.8, 'selfie_path' => 'selfie.jpg', 'clock_out_at' => '2026-09-21 17:00:00', 'clock_out_latitude' => 22.3, 'clock_out_longitude' => 70.8, 'status' => 'present', 'work_minutes' => 480, 'work_done' => 'Work', 'learned' => 'Learning']);
        $admin = $this->admin('Report Company');

        $this->actingAs($admin)->getJson('/api/attendance-report?month=2026-09')->assertOk()->assertJsonPath('rows.0.summary.present', 1)->assertJsonPath('rows.0.summary.work_minutes', 480)
            ->assertJsonFragment(['clock_in' => '09:00 AM', 'clock_out' => '05:00 PM']);
        $this->actingAs($admin)->get('/api/attendance-report/export/excel?month=2026-09')->assertOk()->assertHeader('content-disposition');
        $this->actingAs($admin)->get('/api/attendance-report/export/pdf?month=2026-09')->assertOk()->assertHeader('content-type', 'application/pdf');
    }

    public function test_media_urls_are_relative_and_work_on_any_host_or_port(): void
    {
        Storage::fake('local');
        $employee = $this->employee();
        $employee->update(['profile_photo_path' => 'employee-profiles/photo.jpg']);
        $record = AttendanceRecord::create(['employee_id' => $employee->id, 'attendance_date' => '2026-09-21', 'clock_in_at' => '2026-09-21 09:00:00', 'clock_in_latitude' => 22.3, 'clock_in_longitude' => 70.8, 'selfie_path' => 'selfie.jpg']);
        $break = $record->breaks()->create(['started_at' => '2026-09-21 10:00:00', 'ended_at' => '2026-09-21 10:15:00', 'return_selfie_path' => 'break-selfie.jpg', 'duration_minutes' => 15]);
        Storage::put('break-selfie.jpg', 'image');
        $admin = $this->admin('Media Company');

        $this->actingAs($admin)->getJson('/api/employees')->assertJsonPath('0.profile_photo_url', "/api/employees/{$employee->id}/photo?v={$employee->updated_at->timestamp}");
        $this->actingAs($admin)->getJson('/api/attendance?date=2026-09-21')->assertJsonPath('0.selfie_url', "/api/attendance/{$record->id}/selfie")
            ->assertJsonPath('0.breaks.0.return_selfie_url', "/api/attendance/breaks/{$break->id}/selfie")
            ->assertJsonMissingPath('0.breaks.0.return_selfie_path');
        $this->actingAs($employee->user)->get("/api/attendance/breaks/{$break->id}/selfie")->assertOk();
        $viewer = User::factory()->create(['company_id' => $admin->company_id, 'role' => 'viewer']);
        $this->actingAs($viewer)->get("/api/attendance/breaks/{$break->id}/selfie")->assertForbidden();
    }

    public function test_inactive_employee_history_and_half_day_leave_are_kept_in_monthly_report(): void
    {
        Carbon::setTestNow('2026-09-30 20:00:00');
        $employee = $this->employee();
        $employee->update(['active' => false]);
        $employee->user->update(['active' => false]);
        $leaveType = LeaveType::where('paid', true)->firstOrFail();
        LeaveRequest::create(['employee_id' => $employee->id, 'leave_type_id' => $leaveType->id, 'date_from' => '2026-09-21', 'date_to' => '2026-09-21', 'day_part' => 'first_half', 'reason' => 'Appointment', 'status' => 'approved']);
        AttendanceRecord::create(['employee_id' => $employee->id, 'attendance_date' => '2026-09-21', 'clock_in_at' => '2026-09-21 13:00:00', 'clock_in_latitude' => 22.3, 'clock_in_longitude' => 70.8, 'selfie_path' => 'selfie.jpg', 'clock_out_at' => '2026-09-21 17:00:00', 'clock_out_latitude' => 22.3, 'clock_out_longitude' => 70.8, 'status' => 'present', 'work_minutes' => 240]);

        $this->actingAs($this->admin('Historical Report Company'))->getJson('/api/attendance-report?month=2026-09')
            ->assertOk()->assertJsonPath('rows.0.employee.employee_code', 'EMP-001')
            ->assertJsonPath('rows.0.summary.present', 0.5)->assertJsonPath('rows.0.summary.leave', 0.5);
    }

    public function test_half_day_leave_cannot_span_multiple_dates(): void
    {
        $employee = $this->employee();
        $this->actingAs($employee->user)->postJson('/api/leaves', [
            'date_from' => '2026-09-21', 'date_to' => '2026-09-22', 'day_part' => 'first_half', 'reason' => 'Appointment',
        ])->assertUnprocessable()->assertJsonValidationErrors('day_part');
    }

    public function test_employee_can_add_readings_for_all_companies_but_cannot_edit_or_delete(): void
    {
        $employee = $this->employee();
        $first = Company::create(['name' => 'First Solar']);
        $second = Company::create(['name' => 'Second Solar']);
        $firstInverter = Inverter::create(['company_id' => $first->id, 'name' => 'Inverter 1', 'active' => true]);
        $secondInverter = Inverter::create(['company_id' => $second->id, 'name' => 'Inverter 1', 'active' => true]);

        $this->actingAs($employee->user)->getJson('/api/companies')->assertOk()->assertJsonCount(2);
        $firstPayload = $this->readingPayload($first, $firstInverter, '2026-09-21');
        $secondPayload = $this->readingPayload($second, $secondInverter, '2026-09-21');
        $this->actingAs($employee->user)->postJson('/api/readings', $firstPayload)->assertSuccessful();
        $this->actingAs($employee->user)->postJson('/api/readings', $secondPayload)->assertSuccessful();
        $this->assertDatabaseCount('daily_readings', 2);

        $firstPayload['plant_import_reading'] = 101;
        $this->actingAs($employee->user)->postJson('/api/readings', $firstPayload)->assertForbidden();
        $reading = DailyReading::firstOrFail();
        $this->actingAs($employee->user)->deleteJson("/api/readings/{$reading->id}")->assertNotFound();
    }

    private function admin(string $companyName): User
    {
        $company = Company::create(['name' => $companyName]);

        return User::factory()->create(['company_id' => $company->id, 'role' => 'company_admin']);
    }

    private function employee(): Employee
    {
        $user = User::factory()->create(['name' => 'Common Employee', 'company_id' => null, 'role' => 'employee', 'permissions' => ['clock_attendance', 'enter_readings']]);

        return Employee::create(['user_id' => $user->id, 'employee_code' => 'EMP-001', 'active' => true, 'shift_start' => '09:00', 'shift_end' => '18:00', 'working_minutes' => 480, 'half_day_minutes' => 240, 'grace_minutes' => 15, 'weekly_offs' => [0]]);
    }

    private function employeePayload(): array
    {
        return ['name' => 'Common Employee', 'email' => 'employee@example.com', 'password' => 'password123', 'employee_code' => 'EMP-001', 'active' => true, 'shift_start' => '09:00', 'shift_end' => '18:00', 'working_minutes' => 480, 'half_day_minutes' => 240, 'grace_minutes' => 15, 'weekly_offs' => [0]];
    }

    private function manualAttendancePayload(Employee $employee, string $date): array
    {
        return [
            'employee_id' => $employee->id,
            'attendance_date' => $date,
            'clock_in_at' => $date.'T09:00',
            'clock_out_at' => $date.'T18:00',
            'break_minutes' => 60,
            'work_done' => 'Completed assigned field work.',
            'learned' => 'Reviewed the daily operating process.',
            'entry_reason' => 'Employee does not own a smartphone.',
        ];
    }

    private function readingPayload(Company $company, Inverter $inverter, string $date): array
    {
        return [
            'company_id' => $company->id,
            'reading_date' => $date,
            'plant_import_reading' => 100,
            'plant_export_reading' => 200,
            'sub_import_reading' => 300,
            'sub_export_reading' => 400,
            'outputs' => [['inverter_id' => $inverter->id, 'generation' => 25]],
        ];
    }
}
