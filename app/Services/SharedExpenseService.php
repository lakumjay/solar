<?php

namespace App\Services;

use App\Models\Company;
use App\Models\ExpenseSettlement;
use App\Models\SharedExpense;
use App\Models\SharedExpenseAllocation;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class SharedExpenseService
{
    public function __construct(private readonly ActivityLogger $activity) {}

    public function savePercentages(array $rows, User $actor): array
    {
        return DB::transaction(function () use ($rows, $actor) {
            $companies = Company::where('active', true)->orderBy('id')->lockForUpdate()->get();
            $submitted = collect($rows)->keyBy(fn (array $row) => (int) $row['company_id']);

            if ($companies->pluck('id')->sort()->values()->all() !== $submitted->keys()->map(fn ($id) => (int) $id)->sort()->values()->all()) {
                throw ValidationException::withMessages(['percentages' => 'Submit one percentage for every active company.']);
            }

            $totalBasisPoints = $submitted->sum(fn (array $row) => $this->percentageBasisPoints($row['percentage']));
            if ($totalBasisPoints !== 10000) {
                throw ValidationException::withMessages(['percentages' => 'Active company percentages must total exactly 100%.']);
            }

            foreach ($companies as $company) {
                $company->update(['expense_percentage' => $this->percentageBasisPoints($submitted[$company->id]['percentage']) / 100]);
            }

            $this->activity->log($actor, null, 'updated', 'expense_percentages', null, 'Shared expense percentages updated', [
                'percentages' => $companies->mapWithKeys(fn (Company $company) => [$company->name => (float) $company->fresh()->expense_percentage])->all(),
            ]);

            return $this->settings();
        });
    }

    public function settings(): array
    {
        $companies = Company::where('active', true)->orderBy('name')->get(['id', 'name', 'expense_percentage']);
        $total = round($companies->sum(fn (Company $company) => (float) $company->expense_percentage), 2);

        return [
            'companies' => $companies->map(fn (Company $company) => [
                'id' => $company->id,
                'name' => $company->name,
                'percentage' => (float) $company->expense_percentage,
            ])->all(),
            'total' => $total,
            'configured' => abs($total - 100) < 0.001,
        ];
    }

    public function createExpense(array $data, ?UploadedFile $receipt, User $actor): SharedExpense
    {
        $receiptPath = $receipt?->store('expense-receipts', 'local');

        try {
            return DB::transaction(function () use ($data, $receiptPath, $actor) {
                $companies = Company::where('active', true)->orderBy('id')->lockForUpdate()->get();
                $this->assertConfigured($companies);

                [$primaryPayerId, $payersMap] = $this->resolvePayers($data, $companies);
                $allocationsConfig = $this->resolveAllocationsConfig($data, $companies);

                $expense = SharedExpense::create([
                    'expense_date' => $data['expense_date'],
                    'payer_company_id' => $primaryPayerId,
                    'purchaser_name' => $data['purchaser_name'],
                    'description' => $data['description'],
                    'amount' => $data['amount'],
                    'notes' => $data['notes'] ?? null,
                    'allocation_scope' => $data['allocation_scope'] ?? 'all',
                    'receipt_path' => $receiptPath,
                    'entry_type' => 'expense',
                    'status' => 'active',
                    'created_by' => $actor->id,
                    'updated_by' => $actor->id,
                ]);

                $this->replaceAllocationsWithPayers($expense, (float) $data['amount'], $allocationsConfig, $payersMap);
                $this->activity->log($actor, $expense->payer_company_id, 'created', 'shared_expense', $expense->id, "Shared expense {$expense->description} created", ['amount' => (float) $expense->amount]);

                return $expense->load(['payerCompany:id,name', 'allocations.company:id,name', 'creator:id,name']);
            });
        } catch (Throwable $error) {
            if ($receiptPath) {
                Storage::disk('local')->delete($receiptPath);
            }
            throw $error;
        }
    }

    public function updateExpense(SharedExpense $expense, array $data, ?UploadedFile $receipt, User $actor): SharedExpense
    {
        $newReceiptPath = $receipt?->store('expense-receipts', 'local');
        $oldReceiptPath = $expense->receipt_path;

        try {
            $updated = DB::transaction(function () use ($expense, $data, $newReceiptPath, $actor) {
                $expense = SharedExpense::with('allocations')->lockForUpdate()->findOrFail($expense->id);
                $this->assertEditable($expense);
                $companies = Company::where('active', true)->orderBy('id')->lockForUpdate()->get();

                [$primaryPayerId, $payersMap] = $this->resolvePayers($data, $companies);
                $allocationsConfig = $this->resolveAllocationsConfig($data, $companies, $expense);

                $expense->fill([
                    'expense_date' => $data['expense_date'],
                    'payer_company_id' => $primaryPayerId,
                    'purchaser_name' => $data['purchaser_name'],
                    'description' => $data['description'],
                    'amount' => $data['amount'],
                    'notes' => $data['notes'] ?? null,
                    'allocation_scope' => $data['allocation_scope'] ?? $expense->allocation_scope ?? 'all',
                ]);

                if ($newReceiptPath) {
                    $expense->receipt_path = $newReceiptPath;
                } elseif (! empty($data['remove_receipt'])) {
                    $expense->receipt_path = null;
                }
                $expense->updated_by = $actor->id;
                $expense->save();

                $this->replaceAllocationsWithPayers($expense, (float) $expense->amount, $allocationsConfig, $payersMap);
                $this->activity->log($actor, $expense->payer_company_id, 'updated', 'shared_expense', $expense->id, "Shared expense {$expense->description} updated", ['amount' => (float) $expense->amount]);

                return $expense->fresh()->load(['payerCompany:id,name', 'allocations.company:id,name', 'creator:id,name']);
            });
        } catch (Throwable $error) {
            if ($newReceiptPath) {
                Storage::disk('local')->delete($newReceiptPath);
            }
            throw $error;
        }

        if (($newReceiptPath || ! empty($data['remove_receipt'])) && $oldReceiptPath && $oldReceiptPath !== $updated->receipt_path) {
            Storage::disk('local')->delete($oldReceiptPath);
        }

        return $updated;
    }

    public function cancelExpense(SharedExpense $expense, User $actor): SharedExpense
    {
        return DB::transaction(function () use ($expense, $actor) {
            $expense = SharedExpense::lockForUpdate()->findOrFail($expense->id);
            $this->assertEditable($expense);
            $expense->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancelled_by' => $actor->id, 'updated_by' => $actor->id]);
            $this->activity->log($actor, $expense->payer_company_id, 'cancelled', 'shared_expense', $expense->id, "Shared expense {$expense->description} cancelled");

            return $expense;
        });
    }

    public function reverseExpense(SharedExpense $expense, User $actor): SharedExpense
    {
        return DB::transaction(function () use ($expense, $actor) {
            $expense = SharedExpense::with('allocations')->lockForUpdate()->findOrFail($expense->id);
            abort_unless($expense->entry_type === 'expense' && $expense->status === 'active' && $expense->locked_at, 422, 'Only an active locked expense can be reversed.');

            $reversal = SharedExpense::create([
                'expense_date' => today(),
                'payer_company_id' => $expense->payer_company_id,
                'purchaser_name' => $expense->purchaser_name,
                'description' => 'Reversal: '.$expense->description,
                'amount' => -1 * (float) $expense->amount,
                'notes' => 'Reverses expense #'.$expense->id,
                'entry_type' => 'reversal',
                'status' => 'active',
                'allocation_scope' => $expense->allocation_scope ?? 'all',
                'reverses_expense_id' => $expense->id,
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);
            foreach ($expense->allocations as $allocation) {
                SharedExpenseAllocation::create([
                    'shared_expense_id' => $reversal->id,
                    'company_id' => $allocation->company_id,
                    'percentage' => $allocation->percentage,
                    'share_amount' => -1 * (float) $allocation->share_amount,
                    'amount_paid' => -1 * (float) ($allocation->amount_paid ?? 0),
                ]);
            }
            $expense->update(['status' => 'reversed', 'updated_by' => $actor->id]);
            $this->activity->log($actor, $expense->payer_company_id, 'reversed', 'shared_expense', $expense->id, "Shared expense {$expense->description} reversed", ['reversal_id' => $reversal->id]);

            return $reversal->load(['payerCompany:id,name', 'allocations.company:id,name', 'creator:id,name']);
        });
    }

    public function createSettlement(array $data, User $actor): ExpenseSettlement
    {
        return DB::transaction(function () use ($data, $actor) {
            $companyIds = [(int) $data['from_company_id'], (int) $data['to_company_id']];
            Company::whereIn('id', $companyIds)->orderBy('id')->lockForUpdate()->get();
            $balance = $this->pairBalanceAsOf($companyIds[0], $companyIds[1], Carbon::parse($data['settled_on']));

            if (! $balance || $balance['status'] === 'cleared') {
                throw ValidationException::withMessages(['amount' => 'These companies do not have an open balance.']);
            }
            if ($balance['debtor_company_id'] !== $companyIds[0] || $balance['creditor_company_id'] !== $companyIds[1]) {
                throw ValidationException::withMessages(['from_company_id' => 'Settlement direction must follow the current debtor and creditor.']);
            }
            if ($this->moneyCents($data['amount']) > $this->moneyCents($balance['amount'])) {
                throw ValidationException::withMessages(['amount' => 'Settlement cannot exceed the open balance.']);
            }

            $currentOpenCents = $this->moneyCents($balance['amount']);
            $settleCents = $this->moneyCents($data['amount']);
            $remainingCents = max(0, $currentOpenCents - $settleCents);
            $remainingBalance = $remainingCents / 100;
            $settlementType = $remainingCents === 0 ? 'full' : ($data['settlement_type'] ?? 'partial');
            $paymentMode = $data['payment_mode'] ?? 'bank_transfer';

            $settlement = ExpenseSettlement::create([
                'settled_on' => $data['settled_on'],
                'settled_at' => now(),
                'from_company_id' => $data['from_company_id'],
                'to_company_id' => $data['to_company_id'],
                'amount' => $data['amount'],
                'settlement_type' => $settlementType,
                'remaining_balance' => $remainingBalance,
                'payment_mode' => $paymentMode,
                'notes' => $data['notes'] ?? null,
                'created_by' => $actor->id,
            ]);
            $this->lockAffectedExpenses($settlement);
            $this->activity->log($actor, $settlement->from_company_id, 'created', 'expense_settlement', $settlement->id, 'Shared expense balance settled', [
                'from_company_id' => $settlement->from_company_id,
                'to_company_id' => $settlement->to_company_id,
                'amount' => (float) $settlement->amount,
                'settlement_type' => $settlementType,
                'remaining_balance' => $remainingBalance,
            ]);

            return $settlement->load(['fromCompany:id,name', 'toCompany:id,name', 'creator:id,name']);
        });
    }

    public function dashboard(User $user, Carbon $from, Carbon $to): array
    {
        $allExpenses = SharedExpense::with(['payerCompany:id,name', 'allocations.company:id,name', 'creator:id,name'])
            ->whereDate('expense_date', '<=', today())
            ->orderBy('expense_date')
            ->orderBy('id')
            ->get();
        $expenses = $allExpenses->where('status', '!=', 'cancelled')->values();
        $settlements = ExpenseSettlement::with(['fromCompany:id,name', 'toCompany:id,name', 'creator:id,name'])
            ->whereDate('settled_on', '<=', today())
            ->orderBy('settled_on')
            ->orderBy('id')
            ->get();
        $pairs = collect($this->pairBalances($expenses, $settlements));
        $companyId = $user->role === 'super_admin' ? null : (int) $user->company_id;
        if ($companyId) {
            $pairs = $pairs->filter(fn (array $pair) => in_array($companyId, $pair['company_ids'], true))->values();
        }

        $settlementStatuses = $this->settlementStatuses($expenses, $settlements);
        $visibleExpenses = $allExpenses->filter(fn (SharedExpense $expense) => $expense->expense_date->betweenIncluded($from, $to))
            ->filter(fn (SharedExpense $expense) => ! $companyId || $expense->payer_company_id === $companyId || $expense->allocations->contains(fn ($allocation) => $allocation->company_id === $companyId && (abs((float) $allocation->share_amount) > 0.0001 || abs((float) ($allocation->amount_paid ?? 0)) > 0.0001)));
        $visibleSettlements = $settlements->filter(fn (ExpenseSettlement $settlement) => $settlement->settled_on->betweenIncluded($from, $to))
            ->filter(fn (ExpenseSettlement $settlement) => ! $companyId || in_array($companyId, [$settlement->from_company_id, $settlement->to_company_id], true));
        $entries = $visibleExpenses->map(fn (SharedExpense $expense) => $this->expensePayload($expense, $user))
            ->concat($visibleSettlements->map(fn (ExpenseSettlement $settlement) => $this->settlementPayload($settlement, $settlementStatuses[$settlement->id] ?? 'partial')))
            ->sortByDesc(fn (array $entry) => $entry['date'].' '.str_pad((string) $entry['id'], 12, '0', STR_PAD_LEFT))
            ->values();

        // Settlements Audit History
        $settlementsHistory = $settlements->map(fn (ExpenseSettlement $s) => [
            'id' => $s->id,
            'date' => $s->settled_on->toDateString(),
            'settled_at' => $s->settled_at?->format('d M Y, h:i A') ?? $s->created_at?->format('d M Y, h:i A'),
            'from_company' => $s->fromCompany,
            'to_company' => $s->toCompany,
            'amount' => (float) $s->amount,
            'settlement_type' => $s->settlement_type ?? 'full',
            'remaining_balance' => (float) ($s->remaining_balance ?? 0),
            'payment_mode' => $s->payment_mode ?? 'bank_transfer',
            'notes' => $s->notes,
            'creator' => $s->creator,
        ])->sortByDesc(fn ($s) => $s['date'].' '.$s['id'])->values()->all();

        return [
            'settings' => $this->settings(),
            'summary' => $this->summary($pairs, $companyId, $entries),
            'balances' => $pairs->values()->all(),
            'entries' => $entries->all(),
            'settlements_history' => $settlementsHistory,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'can_manage' => $user->role === 'super_admin' || in_array($user->role, ['company_admin', 'manager'], true) || $user->hasPermission('view_expenses'),
            'is_super_admin' => $user->role === 'super_admin',
        ];
    }

    public function canViewReceipt(SharedExpense $expense, User $user): bool
    {
        if ($user->role === 'super_admin') {
            return true;
        }

        return $user->company_id && ($expense->payer_company_id === (int) $user->company_id
            || $expense->allocations()->where('company_id', $user->company_id)->where(fn ($q) => $q->where('share_amount', '!=', 0)->orWhere('amount_paid', '!=', 0))->exists());
    }

    private function resolvePayers(array $data, Collection $companies): array
    {
        $amount = (float) $data['amount'];
        $amountCents = $this->moneyCents($amount);
        $payersMap = [];

        if (! empty($data['payers']) && is_array($data['payers'])) {
            $totalPaidCents = 0;
            $maxPaidCents = -1;
            $primaryPayerId = null;

            foreach ($data['payers'] as $p) {
                $cid = (int) $p['company_id'];
                $paidCents = $this->moneyCents($p['amount_paid'] ?? 0);
                if ($paidCents > 0) {
                    $payersMap[$cid] = $paidCents / 100;
                    $totalPaidCents += $paidCents;
                    if ($paidCents > $maxPaidCents) {
                        $maxPaidCents = $paidCents;
                        $primaryPayerId = $cid;
                    }
                }
            }

            if (abs($totalPaidCents - $amountCents) > 1) {
                throw ValidationException::withMessages(['payers' => 'Total paid by companies must equal the total expense amount.']);
            }

            $primaryPayerId ??= $data['payer_company_id'] ?? $companies->first()->id;
            return [(int) $primaryPayerId, $payersMap];
        }

        $singlePayerId = (int) ($data['payer_company_id'] ?? $companies->first()->id);
        abort_unless($companies->contains('id', $singlePayerId), 422, 'Paying company must be active.');
        $payersMap[$singlePayerId] = $amount;

        return [$singlePayerId, $payersMap];
    }

    private function resolveAllocationsConfig(array $data, Collection $companies, ?SharedExpense $existing = null): Collection
    {
        // 1. Custom allocations explicitly passed
        if (! empty($data['custom_allocations']) && is_array($data['custom_allocations'])) {
            return collect($data['custom_allocations'])->map(fn ($r) => [
                'company_id' => (int) $r['company_id'],
                'percentage' => (float) ($r['percentage'] ?? 0),
            ]);
        }

        $scope = $data['allocation_scope'] ?? 'all';
        $beneficiaries = collect($data['beneficiary_company_ids'] ?? [])->map(fn ($id) => (int) $id)->filter()->values();

        // 2. Single Company 100% Direct Allocation
        if ($scope === 'single' || $beneficiaries->count() === 1) {
            $targetId = $beneficiaries->first() ?? (int) ($data['beneficiary_company_id'] ?? $companies->first()->id);
            return $companies->map(fn (Company $c) => [
                'company_id' => $c->id,
                'percentage' => $c->id === $targetId ? 100.0 : 0.0,
            ]);
        }

        // 3. Two Companies Re-proportioned Allocation
        if ($scope === 'two' || $beneficiaries->count() === 2) {
            $selected = $companies->whereIn('id', $beneficiaries);
            $sumMaster = $selected->sum(fn (Company $c) => (float) $c->expense_percentage);

            return $companies->map(function (Company $c) use ($beneficiaries, $selected, $sumMaster) {
                if (! $beneficiaries->contains($c->id)) {
                    return ['company_id' => $c->id, 'percentage' => 0.0];
                }
                if ($sumMaster > 0) {
                    $pct = round(((float) $c->expense_percentage / $sumMaster) * 100, 2);
                    return ['company_id' => $c->id, 'percentage' => $pct];
                }
                return ['company_id' => $c->id, 'percentage' => 50.0];
            });
        }

        // 4. All active companies (Default Master %)
        return $companies->map(fn (Company $c) => [
            'company_id' => $c->id,
            'percentage' => (float) $c->expense_percentage,
        ]);
    }

    private function replaceAllocationsWithPayers(SharedExpense $expense, float $amount, Collection $percentages, array $payersMap): void
    {
        $expense->allocations()->delete();
        $allocatedRows = $this->allocate($amount, $percentages);

        // Ensure all active companies have a record (even if 0%) so amounts paid are tracked accurately
        $allCompanies = Company::where('active', true)->pluck('id');
        $allocatedCompanyIds = collect($allocatedRows)->pluck('company_id');

        foreach ($allocatedRows as $row) {
            $cid = $row['company_id'];
            $paid = $payersMap[$cid] ?? 0.0;
            SharedExpenseAllocation::create([
                'shared_expense_id' => $expense->id,
                'company_id' => $cid,
                'percentage' => $row['percentage'],
                'share_amount' => $row['share_amount'],
                'amount_paid' => $paid,
            ]);
        }

        foreach ($allCompanies->diff($allocatedCompanyIds) as $missingCid) {
            $paid = $payersMap[$missingCid] ?? 0.0;
            if ($paid > 0) {
                SharedExpenseAllocation::create([
                    'shared_expense_id' => $expense->id,
                    'company_id' => $missingCid,
                    'percentage' => 0,
                    'share_amount' => 0,
                    'amount_paid' => $paid,
                ]);
            }
        }
    }

    private function allocate(float $amount, Collection $percentages): array
    {
        $rows = $percentages
            ->map(fn (array $row) => [
                'company_id' => (int) $row['company_id'],
                'percentage' => $this->percentageBasisPoints($row['percentage']) / 100,
                'basis_points' => $this->percentageBasisPoints($row['percentage']),
            ])
            ->filter(fn (array $row) => $row['basis_points'] > 0)
            ->values();

        if ($rows->isEmpty()) {
            return [];
        }

        $totalBasis = $rows->sum('basis_points');
        $amountCents = $this->moneyCents($amount);

        $allocated = $rows->map(fn (array $row) => [
            ...$row,
            'share_cents' => (int) round($amountCents * $row['basis_points'] / $totalBasis, 0, PHP_ROUND_HALF_UP),
        ]);

        $residual = $amountCents - $allocated->sum('share_cents');
        $target = $allocated->sortBy(fn (array $row) => [-$row['basis_points'], $row['company_id']])->keys()->first();
        if ($target !== null) {
            $allocated[$target] = [...$allocated[$target], 'share_cents' => $allocated[$target]['share_cents'] + $residual];
        }

        return $allocated->map(fn (array $row) => [
            'company_id' => $row['company_id'],
            'percentage' => $row['percentage'],
            'share_amount' => $row['share_cents'] / 100,
        ])->all();
    }

    private function pairBalances(Collection $expenses, Collection $settlements): array
    {
        $companies = Company::all(['id', 'name'])->keyBy('id');
        $balances = [];

        foreach ($expenses as $expense) {
            $allocations = $expense->allocations;
            if ($allocations->isEmpty()) {
                continue;
            }

            // Calculate each company's net position in this expense
            $netPositions = [];
            foreach ($allocations as $allocation) {
                $cid = $allocation->company_id;
                $share = (float) $allocation->share_amount;
                // If amount_paid is stored on allocation, use it; otherwise fallback to legacy single payer
                $paid = isset($allocation->amount_paid) && $allocation->amount_paid > 0
                    ? (float) $allocation->amount_paid
                    : ($cid === $expense->payer_company_id ? (float) $expense->amount : 0.0);

                $netPositions[$cid] = $this->moneyCents($paid) - $this->moneyCents($share);
            }

            $creditors = []; // Companies that paid more than their share (Net > 0)
            $debtors = [];   // Companies that paid less than their share (Net < 0)

            foreach ($netPositions as $cid => $netCents) {
                if ($netCents > 0) {
                    $creditors[$cid] = $netCents;
                } elseif ($netCents < 0) {
                    $debtors[$cid] = -$netCents; // positive deficit amount
                }
            }

            $totalSurplus = array_sum($creditors);
            if ($totalSurplus > 0) {
                foreach ($debtors as $debtorId => $deficitCents) {
                    foreach ($creditors as $creditorId => $surplusCents) {
                        $debtPortionCents = (int) round($deficitCents * $surplusCents / $totalSurplus, 0, PHP_ROUND_HALF_UP);
                        if ($debtPortionCents > 0) {
                            $this->applyPairAmount($balances, $debtorId, $creditorId, $debtPortionCents);
                        }
                    }
                }
            }
        }

        foreach ($settlements as $settlement) {
            $this->applyPairAmount($balances, $settlement->from_company_id, $settlement->to_company_id, -$this->moneyCents($settlement->amount));
        }

        return collect($balances)->map(function (array $pair) use ($companies) {
            $amount = $pair['cents'];
            $cleared = $amount === 0;
            $debtorId = $cleared ? null : ($amount > 0 ? $pair['first_id'] : $pair['second_id']);
            $creditorId = $cleared ? null : ($amount > 0 ? $pair['second_id'] : $pair['first_id']);

            return [
                'key' => $pair['first_id'].'-'.$pair['second_id'],
                'company_ids' => [$pair['first_id'], $pair['second_id']],
                'first_company' => ['id' => $pair['first_id'], 'name' => $companies[$pair['first_id']]?->name],
                'second_company' => ['id' => $pair['second_id'], 'name' => $companies[$pair['second_id']]?->name],
                'debtor_company_id' => $debtorId,
                'debtor_company' => $debtorId ? ['id' => $debtorId, 'name' => $companies[$debtorId]?->name] : null,
                'creditor_company_id' => $creditorId,
                'creditor_company' => $creditorId ? ['id' => $creditorId, 'name' => $companies[$creditorId]?->name] : null,
                'amount' => abs($amount) / 100,
                'status' => $cleared ? 'cleared' : 'open',
            ];
        })->sortBy(fn (array $pair) => ($pair['first_company']['name'] ?? '').($pair['second_company']['name'] ?? ''))->values()->all();
    }

    private function pairBalanceAsOf(int $firstCompanyId, int $secondCompanyId, Carbon $date): ?array
    {
        $expenses = SharedExpense::with('allocations')
            ->where('status', '!=', 'cancelled')
            ->whereDate('expense_date', '<=', $date)
            ->get();
        $settlements = ExpenseSettlement::whereDate('settled_on', '<=', $date)->get();

        return collect($this->pairBalances($expenses, $settlements))
            ->first(fn (array $pair) => $pair['company_ids'] === collect([$firstCompanyId, $secondCompanyId])->sort()->values()->all());
    }

    private function settlementStatuses(Collection $expenses, Collection $settlements): array
    {
        $events = collect();

        foreach ($expenses as $expense) {
            $allocations = $expense->allocations;
            $netPositions = [];
            foreach ($allocations as $allocation) {
                $cid = $allocation->company_id;
                $share = (float) $allocation->share_amount;
                $paid = isset($allocation->amount_paid) && $allocation->amount_paid > 0
                    ? (float) $allocation->amount_paid
                    : ($cid === $expense->payer_company_id ? (float) $expense->amount : 0.0);
                $netPositions[$cid] = $this->moneyCents($paid) - $this->moneyCents($share);
            }

            $creditors = [];
            $debtors = [];
            foreach ($netPositions as $cid => $netCents) {
                if ($netCents > 0) $creditors[$cid] = $netCents;
                elseif ($netCents < 0) $debtors[$cid] = -$netCents;
            }

            $totalSurplus = array_sum($creditors);
            if ($totalSurplus > 0) {
                foreach ($debtors as $debtorId => $deficitCents) {
                    foreach ($creditors as $creditorId => $surplusCents) {
                        $debtPortionCents = (int) round($deficitCents * $surplusCents / $totalSurplus, 0, PHP_ROUND_HALF_UP);
                        if ($debtPortionCents > 0) {
                            $events->push([
                                'date' => $expense->expense_date->toDateString(),
                                'created_at' => $expense->created_at?->format('Y-m-d H:i:s.u') ?? '',
                                'type' => 'expense',
                                'id' => $expense->id,
                                'from' => $debtorId,
                                'to' => $creditorId,
                                'cents' => $debtPortionCents,
                            ]);
                        }
                    }
                }
            }
        }

        foreach ($settlements as $settlement) {
            $events->push([
                'date' => $settlement->settled_on->toDateString(),
                'created_at' => $settlement->created_at?->format('Y-m-d H:i:s.u') ?? '',
                'type' => 'settlement',
                'id' => $settlement->id,
                'from' => $settlement->from_company_id,
                'to' => $settlement->to_company_id,
                'cents' => -$this->moneyCents($settlement->amount),
            ]);
        }

        $balances = [];
        $statuses = [];
        foreach ($events->sortBy(fn (array $event) => $event['date'].' '.$event['created_at'].' '.($event['type'] === 'expense' ? '0' : '1').' '.str_pad((string) $event['id'], 12, '0', STR_PAD_LEFT)) as $event) {
            $this->applyPairAmount($balances, $event['from'], $event['to'], $event['cents']);
            if ($event['type'] === 'settlement') {
                $key = $this->pairKey($event['from'], $event['to']);
                $statuses[$event['id']] = ($balances[$key]['cents'] ?? 0) === 0 ? 'cleared' : 'partial';
            }
        }

        return $statuses;
    }

    private function expensePayload(SharedExpense $expense, User $user): array
    {
        $payersList = $expense->allocations->filter(fn ($a) => (float) ($a->amount_paid ?? 0) > 0)->map(fn ($a) => [
            'company_id' => $a->company_id,
            'company_name' => $a->company?->name,
            'amount_paid' => (float) $a->amount_paid,
        ])->values()->all();

        // If no explicit payers, fallback to single payer
        if (empty($payersList) && $expense->payerCompany) {
            $payersList = [[
                'company_id' => $expense->payer_company_id,
                'company_name' => $expense->payerCompany->name,
                'amount_paid' => (float) $expense->amount,
            ]];
        }

        return [
            'type' => $expense->entry_type,
            'id' => $expense->id,
            'date' => $expense->expense_date->toDateString(),
            'payer_company' => $expense->payerCompany,
            'payers' => $payersList,
            'allocation_scope' => $expense->allocation_scope ?? 'all',
            'purchaser_name' => $expense->purchaser_name,
            'description' => $expense->description,
            'amount' => (float) $expense->amount,
            'notes' => $expense->notes,
            'status' => $expense->status,
            'locked' => (bool) $expense->locked_at,
            'editable' => $user->role === 'super_admin' && $expense->entry_type === 'expense' && $expense->status === 'active' && ! $expense->locked_at,
            'reversible' => $user->role === 'super_admin' && $expense->entry_type === 'expense' && $expense->status === 'active' && (bool) $expense->locked_at,
            'receipt_url' => $expense->receipt_path ? '/api/expenses/'.$expense->id.'/receipt' : null,
            'allocations' => $expense->allocations->map(fn (SharedExpenseAllocation $allocation) => [
                'company' => $allocation->company,
                'percentage' => (float) $allocation->percentage,
                'amount' => (float) $allocation->share_amount,
                'amount_paid' => (float) ($allocation->amount_paid ?? 0),
                'net_effect' => (float) (($allocation->amount_paid ?? 0) - $allocation->share_amount),
                'is_payer' => (float) ($allocation->amount_paid ?? 0) > 0 || $allocation->company_id === $expense->payer_company_id,
            ])->values(),
            'created_by' => $expense->creator,
        ];
    }

    private function settlementPayload(ExpenseSettlement $settlement, string $status): array
    {
        return [
            'type' => 'settlement',
            'id' => $settlement->id,
            'date' => $settlement->settled_on->toDateString(),
            'settled_at' => $settlement->settled_at?->format('d M Y, h:i A') ?? $settlement->created_at?->format('d M Y, h:i A'),
            'from_company' => $settlement->fromCompany,
            'to_company' => $settlement->toCompany,
            'amount' => (float) $settlement->amount,
            'settlement_type' => $settlement->settlement_type ?? 'full',
            'remaining_balance' => (float) ($settlement->remaining_balance ?? 0),
            'payment_mode' => $settlement->payment_mode ?? 'bank_transfer',
            'notes' => $settlement->notes,
            'status' => $status,
            'created_by' => $settlement->creator,
        ];
    }

    private function summary(Collection $pairs, ?int $companyId, Collection $entries): array
    {
        if (! $companyId) {
            return [
                'total_outstanding' => round($pairs->where('status', 'open')->sum('amount'), 2),
                'open_pairs' => $pairs->where('status', 'open')->count(),
                'cleared_pairs' => $pairs->where('status', 'cleared')->count(),
                'entries' => $entries->count(),
            ];
        }

        $payable = round($pairs->where('debtor_company_id', $companyId)->sum('amount'), 2);
        $receivable = round($pairs->where('creditor_company_id', $companyId)->sum('amount'), 2);

        return [
            'payable' => $payable,
            'receivable' => $receivable,
            'net' => round($receivable - $payable, 2),
            'open_pairs' => $pairs->where('status', 'open')->count(),
        ];
    }

    private function lockAffectedExpenses(ExpenseSettlement $settlement): void
    {
        SharedExpense::query()
            ->where('entry_type', 'expense')
            ->where('status', 'active')
            ->whereNull('locked_at')
            ->whereDate('expense_date', '<=', $settlement->settled_on)
            ->where(function ($query) use ($settlement) {
                $query->where(function ($query) use ($settlement) {
                    $query->where('payer_company_id', $settlement->to_company_id)
                        ->whereHas('allocations', fn ($query) => $query->where('company_id', $settlement->from_company_id)->where('share_amount', '!=', 0));
                })->orWhere(function ($query) use ($settlement) {
                    $query->where('payer_company_id', $settlement->from_company_id)
                        ->whereHas('allocations', fn ($query) => $query->where('company_id', $settlement->to_company_id)->where('share_amount', '!=', 0));
                });
            })
            ->update(['locked_at' => now()]);
    }

    private function applyPairAmount(array &$balances, int $fromCompanyId, int $toCompanyId, int $cents): void
    {
        $key = $this->pairKey($fromCompanyId, $toCompanyId);
        $firstId = min($fromCompanyId, $toCompanyId);
        $secondId = max($fromCompanyId, $toCompanyId);
        $balances[$key] ??= ['first_id' => $firstId, 'second_id' => $secondId, 'cents' => 0];
        $balances[$key]['cents'] += $fromCompanyId === $firstId ? $cents : -$cents;
    }

    private function pairKey(int $firstCompanyId, int $secondCompanyId): string
    {
        return min($firstCompanyId, $secondCompanyId).':'.max($firstCompanyId, $secondCompanyId);
    }

    private function assertConfigured(Collection $companies): void
    {
        abort_if($companies->isEmpty(), 422, 'Add active companies before entering expenses.');
        abort_unless($companies->sum(fn (Company $company) => $this->percentageBasisPoints($company->expense_percentage)) === 10000, 422, 'Configure active company expense percentages to total 100% first.');
    }

    private function assertEditable(SharedExpense $expense): void
    {
        abort_unless($expense->entry_type === 'expense' && $expense->status === 'active' && ! $expense->locked_at, 422, 'This expense is locked. Reverse it to make a correction.');
    }

    private function percentageBasisPoints(float|string $percentage): int
    {
        return (int) round((float) $percentage * 100, 0, PHP_ROUND_HALF_UP);
    }

    private function moneyCents(float|string $amount): int
    {
        return (int) round((float) $amount * 100, 0, PHP_ROUND_HALF_UP);
    }
}
