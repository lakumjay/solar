<?php

namespace App\Http\Controllers;

use App\Http\Requests\CancelSalaryAdjustmentRequest;
use App\Http\Requests\SaveSalaryAdjustmentRequest;
use App\Http\Requests\SaveSalaryRateRequest;
use App\Models\Employee;
use App\Models\EmployeeSalaryRate;
use App\Models\SalaryAdjustment;
use App\Services\ActivityLogger;
use App\Services\SalaryCalculationService;
use App\Services\SalaryExcelExporter;
use App\Services\SolarAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SalaryController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly SalaryCalculationService $salaries,
        private readonly SalaryExcelExporter $excel,
        private readonly ActivityLogger $activity,
    ) {}

    public function index(Request $request): array
    {
        $this->requireSalaryAccess($request);

        return $this->salaries->report($this->validatedMonth($request));
    }

    public function mine(Request $request): array
    {
        abort_unless($request->user()?->role === 'employee', 403);
        $employee = $request->user()->employee;
        abort_unless($employee, 404, 'Employee profile not found.');
        $report = $this->salaries->report($this->validatedMonth($request), $employee);

        return [
            'month' => $report['month'],
            'from' => $report['from'],
            'to' => $report['to'],
            'period_status' => $report['period_status'],
            'statement' => $report['rows'][0] ?? null,
        ];
    }

    public function excel(Request $request)
    {
        $this->requireSalaryAccess($request);
        $report = $this->salaries->report($this->validatedMonth($request));

        return response()->download($this->excel->create($report), 'employee-salary-'.$report['month'].'.xlsx')->deleteFileAfterSend(true);
    }

    public function rates(Request $request, Employee $employee)
    {
        $this->requireSalaryAccess($request);

        return $employee->salaryRates()->with('creator:id,name')->get()->map(fn (EmployeeSalaryRate $rate) => [
            'id' => $rate->id,
            'effective_month' => $rate->effective_month->format('Y-m'),
            'monthly_salary' => (float) $rate->monthly_salary,
            'created_by' => $rate->creator?->name,
            'updated_at' => $rate->updated_at?->toIso8601String(),
        ])->values();
    }

    public function storeRate(SaveSalaryRateRequest $request, Employee $employee)
    {
        $this->requireSalaryAccess($request);
        $data = $request->validated();
        $month = $this->salaries->assertAllowedMonth($data['effective_month']);
        $rate = DB::transaction(function () use ($request, $employee, $data, $month) {
            $existing = EmployeeSalaryRate::where('employee_id', $employee->id)
                ->whereDate('effective_month', $month)->lockForUpdate()->first();
            $old = $existing?->monthly_salary;
            $rate = EmployeeSalaryRate::updateOrCreate(
                ['employee_id' => $employee->id, 'effective_month' => $month->toDateString()],
                ['monthly_salary' => $data['monthly_salary'], 'created_by' => $request->user()->id],
            );
            $this->activity->log(
                $request->user(), null, $existing ? 'updated' : 'created', 'employee_salary_rate', $rate->id,
                "Monthly salary for {$employee->employee_code} set from {$month->format('M Y')}",
                ['old_monthly_salary' => $old, 'monthly_salary' => $rate->monthly_salary, 'effective_month' => $month->format('Y-m')],
            );

            return $rate;
        });

        return response()->json([
            'id' => $rate->id,
            'effective_month' => $rate->effective_month->format('Y-m'),
            'monthly_salary' => (float) $rate->monthly_salary,
        ], $rate->wasRecentlyCreated ? 201 : 200);
    }

    public function storeAdjustment(SaveSalaryAdjustmentRequest $request)
    {
        $this->requireSalaryAccess($request);
        $data = $request->validated();
        $employee = Employee::findOrFail($data['employee_id']);
        $month = $this->salaries->assertAllowedMonth($data['salary_month']);

        $adjustment = DB::transaction(function () use ($request, $data, $employee, $month) {
            SalaryAdjustment::where('employee_id', $employee->id)->whereDate('salary_month', $month)->lockForUpdate()->get();
            $this->validateAdjustment($employee, $month->format('Y-m'), $data['type'], (float) $data['amount']);

            return SalaryAdjustment::create([
                'employee_id' => $employee->id,
                'salary_month' => $month->toDateString(),
                'type' => $data['type'],
                'amount' => $data['amount'],
                'reason' => $data['reason'],
                'created_by' => $request->user()->id,
            ]);
        });
        $this->activity->log(
            $request->user(), null, 'created', 'salary_adjustment', $adjustment->id,
            ucfirst($adjustment->type)." recorded for {$employee->employee_code}",
            ['salary_month' => $month->format('Y-m'), 'type' => $adjustment->type, 'amount' => $adjustment->amount, 'reason' => $adjustment->reason],
        );

        return response()->json($adjustment->load('creator:id,name'), 201);
    }

    public function cancelAdjustment(CancelSalaryAdjustmentRequest $request, SalaryAdjustment $adjustment)
    {
        $this->requireSalaryAccess($request);
        $data = $request->validated();
        $replacement = DB::transaction(function () use ($request, $adjustment, $data) {
            $adjustment = SalaryAdjustment::whereKey($adjustment->id)->lockForUpdate()->firstOrFail();
            if ($adjustment->cancelled_at) {
                throw ValidationException::withMessages(['adjustment' => 'This salary adjustment is already cancelled.']);
            }
            $adjustment->update([
                'cancelled_at' => now(),
                'cancelled_by' => $request->user()->id,
                'cancellation_reason' => $data['correction_reason'],
            ]);

            if (empty($data['replacement_type'])) {
                return null;
            }
            $employee = $adjustment->employee;
            $month = $adjustment->salary_month->format('Y-m');
            $this->validateAdjustment($employee, $month, $data['replacement_type'], (float) $data['replacement_amount']);

            return SalaryAdjustment::create([
                'employee_id' => $employee->id,
                'salary_month' => $adjustment->salary_month,
                'type' => $data['replacement_type'],
                'amount' => $data['replacement_amount'],
                'reason' => $data['replacement_reason'],
                'created_by' => $request->user()->id,
                'replaces_adjustment_id' => $adjustment->id,
            ]);
        });
        $this->activity->log(
            $request->user(), null, 'cancelled', 'salary_adjustment', $adjustment->id,
            "Salary adjustment {$adjustment->id} cancelled",
            ['cancellation_reason' => $data['correction_reason'], 'replacement_adjustment_id' => $replacement?->id],
        );
        if ($replacement) {
            $this->activity->log(
                $request->user(), null, 'created', 'salary_adjustment', $replacement->id,
                "Replacement salary adjustment created for {$replacement->employee->employee_code}",
                ['replaces_adjustment_id' => $adjustment->id, 'type' => $replacement->type, 'amount' => $replacement->amount, 'reason' => $replacement->reason],
            );
        }

        return response()->json([
            'cancelled_adjustment' => $adjustment->fresh(['creator:id,name', 'canceller:id,name']),
            'replacement_adjustment' => $replacement?->load('creator:id,name'),
        ]);
    }

    private function validatedMonth(Request $request): string
    {
        return $request->validate(['month' => ['required', 'date_format:Y-m']])['month'];
    }

    private function validateAdjustment(Employee $employee, string $month, string $type, float $amount): void
    {
        $statement = $this->salaries->report($month, $employee)['rows'][0] ?? null;
        if (! $statement || ! $statement['configured']) {
            throw ValidationException::withMessages(['employee_id' => 'Configure the employee monthly salary before adding adjustments.']);
        }
        if ($type === 'deduction' && $amount > (float) $statement['final_payable']) {
            throw ValidationException::withMessages(['amount' => 'The deduction cannot make the final payable salary negative.']);
        }
    }

    private function requireSalaryAccess(Request $request): void
    {
        abort_unless(in_array($request->user()?->role, ['super_admin', 'company_admin'], true), 403);
    }
}
