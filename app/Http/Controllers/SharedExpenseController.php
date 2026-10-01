<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveExpensePercentagesRequest;
use App\Http\Requests\SaveExpenseSettlementRequest;
use App\Http\Requests\SaveSharedExpenseRequest;
use App\Models\SharedExpense;
use App\Services\ExpenseExcelExporter;
use App\Services\SharedExpenseService;
use App\Services\SolarAccessService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SharedExpenseController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly SharedExpenseService $expenses,
        private readonly ExpenseExcelExporter $excel,
    ) {}

    public function index(Request $request): array
    {
        return $this->report($request);
    }

    public function excel(Request $request)
    {
        $report = $this->report($request);
        $user = $request->user();
        $scope = $user->role === 'super_admin' ? 'all-companies' : str($user->company?->name ?? 'company')->slug();

        return response()->download(
            $this->excel->create($report, $user),
            "expenses-{$scope}-{$report['from']}-{$report['to']}.xlsx",
        )->deleteFileAfterSend(true);
    }

    public function percentages(SaveExpensePercentagesRequest $request): array
    {
        return $this->expenses->savePercentages($request->validated('percentages'), $request->user());
    }

    public function store(SaveSharedExpenseRequest $request)
    {
        return $this->expenses->createExpense($request->validated(), $request->file('receipt'), $request->user());
    }

    public function update(SaveSharedExpenseRequest $request, SharedExpense $expense)
    {
        return $this->expenses->updateExpense($expense, $request->validated(), $request->file('receipt'), $request->user());
    }

    public function cancel(Request $request, SharedExpense $expense)
    {
        $this->access->requireSuperAdmin($request);

        return $this->expenses->cancelExpense($expense, $request->user());
    }

    public function reverse(Request $request, SharedExpense $expense)
    {
        $this->access->requireSuperAdmin($request);

        return $this->expenses->reverseExpense($expense, $request->user());
    }

    public function settle(SaveExpenseSettlementRequest $request)
    {
        return $this->expenses->createSettlement($request->validated(), $request->user());
    }

    public function receipt(Request $request, SharedExpense $expense)
    {
        $this->access->requirePermission($request, 'view_expenses');
        abort_unless($this->expenses->canViewReceipt($expense, $request->user()), 403);
        abort_unless($expense->receipt_path && Storage::disk('local')->exists($expense->receipt_path), 404);

        return Storage::disk('local')->response($expense->receipt_path);
    }

    private function report(Request $request): array
    {
        $this->access->requirePermission($request, 'view_expenses');
        $validated = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
        ]);
        $from = isset($validated['date_from']) ? Carbon::parse($validated['date_from'])->startOfDay() : now()->startOfMonth();
        $to = isset($validated['date_to']) ? Carbon::parse($validated['date_to'])->endOfDay() : today()->endOfDay();

        return $this->expenses->dashboard($request->user(), $from, $to);
    }
}
