<?php

namespace App\Services;

use App\Models\RnskCompany;
use App\Models\RnskExpense;
use App\Models\RnskExpenseAllocation;
use App\Models\RnskExpenseSettlement;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class RnskExpenseService
{
    public function __construct(private readonly ActivityLogger $activity) {}

    /**
     * Get or set dynamic Rnsk Companies and their % allocation
     */
    public function saveCompaniesAndPercentages(array $companiesData, User $actor): array
    {
        return DB::transaction(function () use ($companiesData, $actor) {
            $existing = RnskCompany::all()->keyBy('id');
            $submittedIds = [];
            $totalBasisPoints = 0;

            foreach ($companiesData as $item) {
                $pct = (float) ($item['percentage'] ?? $item['expense_percentage'] ?? 0);
                $basisPoints = $this->percentageBasisPoints($pct);
                $active = isset($item['active']) ? (bool) $item['active'] : true;

                if ($active) {
                    $totalBasisPoints += $basisPoints;
                }

                if (! empty($item['id']) && isset($existing[$item['id']])) {
                    $company = $existing[$item['id']];
                    $company->update([
                        'name' => trim($item['name']),
                        'expense_percentage' => $basisPoints / 100,
                        'active' => $active,
                    ]);
                    $submittedIds[] = $company->id;
                } else {
                    $created = RnskCompany::create([
                        'name' => trim($item['name']),
                        'expense_percentage' => $basisPoints / 100,
                        'active' => $active,
                        'display_order' => count($submittedIds) + 1,
                    ]);
                    $submittedIds[] = $created->id;
                }
            }

            $activeCount = RnskCompany::where('active', true)->count();
            if ($activeCount > 0 && $totalBasisPoints !== 10000) {
                throw ValidationException::withMessages([
                    'percentages' => "Active company percentages must total exactly 100%. Current sum: " . ($totalBasisPoints / 100) . "%",
                ]);
            }

            $this->activity->log($actor, null, 'updated', 'rnsk_percentages', null, 'RNSK company configurations and percentages updated');

            return $this->settings();
        });
    }

    public function settings(): array
    {
        $companies = RnskCompany::orderBy('id')->get();
        $active = $companies->where('active', true);
        $totalBasisPoints = $active->sum(fn (RnskCompany $c) => $this->percentageBasisPoints($c->expense_percentage));

        return [
            'configured' => $active->isNotEmpty() && $totalBasisPoints === 10000,
            'total_percentage' => $totalBasisPoints / 100,
            'companies' => $companies->map(fn (RnskCompany $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'expense_percentage' => (float) $c->expense_percentage,
                'active' => (bool) $c->active,
            ])->values()->all(),
        ];
    }

    public function createExpense(array $data, ?UploadedFile $receipt, User $actor): RnskExpense
    {
        $receiptPath = $receipt?->store('rnsk-receipts', 'local');

        try {
            return DB::transaction(function () use ($data, $receiptPath, $actor) {
                $companies = RnskCompany::where('active', true)->orderBy('id')->lockForUpdate()->get();
                $this->assertConfigured($companies);
                abort_unless($companies->contains('id', (int) $data['payer_company_id']), 422, 'Paying company must be active in RNSK.');

                $expense = RnskExpense::create([
                    ...collect($data)->only(['expense_date', 'payer_company_id', 'purchaser_name', 'description', 'amount', 'notes'])->all(),
                    'receipt_path' => $receiptPath,
                    'entry_type' => 'expense',
                    'status' => 'active',
                    'created_by' => $actor->id,
                    'updated_by' => $actor->id,
                ]);

                $percentages = $companies->map(fn (RnskCompany $c) => [
                    'company_id' => $c->id,
                    'percentage' => (float) $c->expense_percentage,
                ]);

                $this->replaceAllocations($expense, (float) $data['amount'], $percentages, $data['payers'] ?? []);
                $this->activity->log($actor, null, 'created', 'rnsk_expense', $expense->id, "RNSK expense {$expense->description} created", ['amount' => (float) $expense->amount]);

                return $expense->load(['payerCompany:id,name', 'allocations.company:id,name', 'creator:id,name']);
            });
        } catch (Throwable $error) {
            if ($receiptPath) {
                Storage::disk('local')->delete($receiptPath);
            }
            throw $error;
        }
    }

    public function updateExpense(RnskExpense $expense, array $data, ?UploadedFile $receipt, User $actor): RnskExpense
    {
        $newReceiptPath = $receipt?->store('rnsk-receipts', 'local');
        $oldReceiptPath = $expense->receipt_path;

        try {
            $updated = DB::transaction(function () use ($expense, $data, $newReceiptPath, $actor) {
                $expense = RnskExpense::with('allocations')->lockForUpdate()->findOrFail($expense->id);
                $this->assertEditable($expense);
                abort_unless(RnskCompany::whereKey($data['payer_company_id'])->where('active', true)->exists(), 422, 'Paying company must be active in RNSK.');

                $expense->fill(collect($data)->only(['expense_date', 'payer_company_id', 'purchaser_name', 'description', 'amount', 'notes'])->all());
                if ($newReceiptPath) {
                    $expense->receipt_path = $newReceiptPath;
                } elseif (! empty($data['remove_receipt'])) {
                    $expense->receipt_path = null;
                }
                $expense->updated_by = $actor->id;
                $expense->save();

                $companies = RnskCompany::where('active', true)->orderBy('id')->get();
                $percentages = $companies->map(fn (RnskCompany $c) => [
                    'company_id' => $c->id,
                    'percentage' => (float) $c->expense_percentage,
                ]);
                $this->replaceAllocations($expense, (float) $expense->amount, $percentages, $data['payers'] ?? []);
                $this->activity->log($actor, null, 'updated', 'rnsk_expense', $expense->id, "RNSK expense {$expense->description} updated", ['amount' => (float) $expense->amount]);

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

    public function cancelExpense(RnskExpense $expense, User $actor): RnskExpense
    {
        return DB::transaction(function () use ($expense, $actor) {
            $expense = RnskExpense::lockForUpdate()->findOrFail($expense->id);
            $this->assertEditable($expense);
            $expense->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'cancelled_by' => $actor->id,
            ]);
            $this->activity->log($actor, null, 'cancelled', 'rnsk_expense', $expense->id, "RNSK expense {$expense->description} cancelled", ['amount' => (float) $expense->amount]);

            return $expense->fresh()->load(['payerCompany:id,name', 'allocations.company:id,name', 'canceller:id,name']);
        });
    }

    public function reverseExpense(RnskExpense $expense, User $actor): RnskExpense
    {
        return DB::transaction(function () use ($expense, $actor) {
            $expense = RnskExpense::with('allocations')->lockForUpdate()->findOrFail($expense->id);
            abort_unless($expense->entry_type === 'expense' && $expense->status === 'active', 422, 'Only active RNSK expenses can be reversed.');
            abort_if(RnskExpense::where('reverses_expense_id', $expense->id)->where('status', 'active')->exists(), 422, 'This RNSK expense has already been reversed.');

            $reversal = RnskExpense::create([
                'expense_date' => today(),
                'payer_company_id' => $expense->payer_company_id,
                'purchaser_name' => $expense->purchaser_name,
                'description' => "Reversal: {$expense->description}",
                'amount' => -$expense->amount,
                'notes' => "Automatic reversal of RNSK expense #{$expense->id}",
                'entry_type' => 'reversal',
                'status' => 'active',
                'reverses_expense_id' => $expense->id,
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);

            foreach ($expense->allocations as $allocation) {
                RnskExpenseAllocation::create([
                    'rnsk_expense_id' => $reversal->id,
                    'rnsk_company_id' => $allocation->rnsk_company_id,
                    'percentage' => $allocation->percentage,
                    'share_amount' => -$allocation->share_amount,
                    'amount_paid' => -$allocation->amount_paid,
                ]);
            }

            $this->activity->log($actor, null, 'reversed', 'rnsk_expense', $reversal->id, "RNSK expense {$expense->description} reversed", ['original_id' => $expense->id, 'amount' => (float) $reversal->amount]);

            return $reversal->load(['payerCompany:id,name', 'allocations.company:id,name', 'creator:id,name']);
        });
    }

    public function createSettlement(array $data, ?UploadedFile $receipt, User $actor): RnskExpenseSettlement
    {
        $receiptPath = $receipt?->store('rnsk-settlements', 'local');

        return DB::transaction(function () use ($data, $receiptPath, $actor) {
            abort_if((int) $data['from_company_id'] === (int) $data['to_company_id'], 422, 'Payer and recipient company must be different.');
            $pair = $this->pairBalanceAsOf((int) $data['from_company_id'], (int) $data['to_company_id'], Carbon::parse($data['settled_on']));
            abort_unless($pair && $pair['status'] === 'open', 422, 'There is no open balance between these RNSK companies.');
            abort_unless((int) $pair['debtor_company_id'] === (int) $data['from_company_id'], 422, 'The selected paying company does not owe money to the recipient.');

            $amount = (float) $data['amount'];
            abort_if($amount <= 0, 422, 'Settlement amount must be greater than zero.');
            abort_if($this->moneyCents($amount) > $this->moneyCents($pair['amount']), 422, 'Settlement cannot exceed open balance.');

            $isFull = $this->moneyCents($amount) === $this->moneyCents($pair['amount']);
            $remaining = round($pair['amount'] - $amount, 2);

            $settlement = RnskExpenseSettlement::create([
                'settled_on' => $data['settled_on'],
                'settled_at' => now(),
                'from_company_id' => (int) $data['from_company_id'],
                'to_company_id' => (int) $data['to_company_id'],
                'amount' => $amount,
                'settlement_type' => $isFull ? 'full' : 'partial',
                'remaining_balance' => $remaining,
                'payment_mode' => $data['payment_mode'] ?? 'bank_transfer',
                'payment_reference' => $data['payment_reference'] ?? null,
                'receipt_path' => $receiptPath,
                'notes' => $data['notes'] ?? null,
                'created_by' => $actor->id,
            ]);

            $this->lockAffectedExpenses($settlement);
            $this->activity->log($actor, null, 'settled', 'rnsk_settlement', $settlement->id, "RNSK Settlement created", ['amount' => (float) $settlement->amount]);

            return $settlement->load(['fromCompany:id,name', 'toCompany:id,name', 'creator:id,name']);
        });
    }

    public function dashboard(User $user, Carbon $from, Carbon $to, ?int $selectedCompanyId = null): array
    {
        $allExpenses = RnskExpense::with(['payerCompany:id,name', 'allocations.company:id,name', 'creator:id,name'])
            ->whereDate('expense_date', '<=', today())
            ->orderBy('expense_date')
            ->orderBy('id')
            ->get();
        $expenses = $allExpenses->where('status', '!=', 'cancelled')->values();
        $settlements = RnskExpenseSettlement::with(['fromCompany:id,name', 'toCompany:id,name', 'creator:id,name'])
            ->whereDate('settled_on', '<=', today())
            ->orderBy('settled_on')
            ->orderBy('id')
            ->get();

        $allPairs = collect($this->pairBalances($expenses, $settlements));
        $pairs = $allPairs;
        $companyId = $selectedCompanyId ?: null;
        if ($companyId) {
            $pairs = $pairs->filter(fn (array $pair) => in_array($companyId, $pair['company_ids'], true))->values();
        }

        $settlementStatuses = $this->settlementStatuses($expenses, $settlements);
        $visibleExpenses = $allExpenses->filter(fn (RnskExpense $expense) => $expense->expense_date->betweenIncluded($from, $to))
            ->filter(fn (RnskExpense $expense) => ! $companyId || $expense->payer_company_id === $companyId || $expense->allocations->contains(fn ($allocation) => $allocation->rnsk_company_id === $companyId && (abs((float) $allocation->share_amount) > 0.0001 || (float) ($allocation->amount_paid ?? 0) > 0.0001)));
        $visibleSettlements = $settlements->filter(fn (RnskExpenseSettlement $settlement) => $settlement->settled_on->betweenIncluded($from, $to))
            ->filter(fn (RnskExpenseSettlement $settlement) => ! $companyId || in_array($companyId, [$settlement->from_company_id, $settlement->to_company_id], true));

        $entries = $visibleExpenses->map(fn (RnskExpense $expense) => $this->expensePayload($expense, $user))
            ->concat($visibleSettlements->map(fn (RnskExpenseSettlement $settlement) => $this->settlementPayload($settlement, $settlementStatuses[$settlement->id] ?? 'partial')))
            ->sortByDesc(fn (array $entry) => $entry['date'].' '.str_pad((string) $entry['id'], 12, '0', STR_PAD_LEFT))
            ->values();

        $minExpenseDate = $allExpenses->where('status', '!=', 'cancelled')->min('expense_date')?->toDateString() ?? '2026-08-01';
        $maxExpenseDate = $allExpenses->where('status', '!=', 'cancelled')->max('expense_date')?->toDateString() ?? today()->toDateString();

        return [
            'settings' => $this->settings(),
            'summary' => $this->summary($pairs, $companyId, $entries),
            'gujarati_summary' => $this->gujaratiCompanySummary($expenses, $allPairs, $companyId),
            'balances' => $pairs->values()->all(),
            'entries' => $entries->all(),
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'min_date' => $minExpenseDate,
            'max_date' => $maxExpenseDate,
            'selected_company_id' => $companyId,
            'can_manage' => $user->role === 'super_admin' || (is_array($user->permissions) && in_array('manage_expenses', $user->permissions)),
        ];
    }

    private function replaceAllocations(RnskExpense $expense, float $amount, Collection $percentages, array $payers = []): void
    {
        $expense->allocations()->delete();
        $payerMap = collect($payers)->pluck('amount_paid', 'company_id')->all();
        $allocated = $this->allocate($amount, $percentages);

        foreach ($allocated as $row) {
            $companyId = (int) $row['company_id'];
            $amountPaid = 0.0;
            if (! empty($payerMap)) {
                $amountPaid = (float) ($payerMap[$companyId] ?? 0);
            } else {
                $amountPaid = $companyId === (int) $expense->payer_company_id ? $amount : 0.0;
            }

            RnskExpenseAllocation::create([
                'rnsk_expense_id' => $expense->id,
                'rnsk_company_id' => $companyId,
                'percentage' => $row['percentage'],
                'share_amount' => $row['share_amount'],
                'amount_paid' => $amountPaid,
            ]);
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
        abort_if($rows->isEmpty(), 422, 'At least one company must have an expense percentage.');
        abort_unless($rows->sum('basis_points') === 10000, 422, 'Expense percentages must total exactly 100%.');

        $amountCents = $this->moneyCents($amount);
        $allocated = $rows->map(fn (array $row) => [
            ...$row,
            'share_cents' => (int) round($amountCents * $row['basis_points'] / 10000, 0, PHP_ROUND_HALF_UP),
        ]);
        $residual = $amountCents - $allocated->sum('share_cents');
        $target = $allocated->sortBy(fn (array $row) => [-$row['basis_points'], $row['company_id']])->keys()->first();
        $allocated[$target] = [...$allocated[$target], 'share_cents' => $allocated[$target]['share_cents'] + $residual];

        return $allocated->map(fn (array $row) => [
            'company_id' => $row['company_id'],
            'percentage' => $row['percentage'],
            'share_amount' => $row['share_cents'] / 100,
        ])->all();
    }

    private function pairBalances(Collection $expenses, Collection $settlements): array
    {
        $companies = RnskCompany::all(['id', 'name'])->keyBy('id');
        $balances = [];
        foreach ($expenses as $expense) {
            foreach ($expense->allocations as $allocation) {
                if ($allocation->rnsk_company_id === $expense->payer_company_id || abs((float) $allocation->share_amount) < 0.0001) {
                    continue;
                }
                $this->applyPairAmount($balances, $allocation->rnsk_company_id, $expense->payer_company_id, $this->moneyCents($allocation->share_amount));
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
                'first_company' => ['id' => $pair['first_id'], 'name' => $companies[$pair['first_id']]?->name ?? 'Company #'.$pair['first_id']],
                'second_company' => ['id' => $pair['second_id'], 'name' => $companies[$pair['second_id']]?->name ?? 'Company #'.$pair['second_id']],
                'debtor_company_id' => $debtorId,
                'debtor_company' => $debtorId ? ['id' => $debtorId, 'name' => $companies[$debtorId]?->name ?? 'Company #'.$debtorId] : null,
                'creditor_company_id' => $creditorId,
                'creditor_company' => $creditorId ? ['id' => $creditorId, 'name' => $companies[$creditorId]?->name ?? 'Company #'.$creditorId] : null,
                'amount' => abs($amount) / 100,
                'status' => $cleared ? 'cleared' : 'open',
            ];
        })->sortBy(fn (array $pair) => ($pair['first_company']['name'] ?? '').($pair['second_company']['name'] ?? ''))->values()->all();
    }

    private function pairBalanceAsOf(int $firstCompanyId, int $secondCompanyId, Carbon $date): ?array
    {
        $expenses = RnskExpense::with('allocations')
            ->where('status', '!=', 'cancelled')
            ->whereDate('expense_date', '<=', $date)
            ->get();
        $settlements = RnskExpenseSettlement::whereDate('settled_on', '<=', $date)->get();

        return collect($this->pairBalances($expenses, $settlements))
            ->first(fn (array $pair) => $pair['company_ids'] === collect([$firstCompanyId, $secondCompanyId])->sort()->values()->all());
    }

    private function settlementStatuses(Collection $expenses, Collection $settlements): array
    {
        $events = collect();
        foreach ($expenses as $expense) {
            foreach ($expense->allocations as $allocation) {
                if ($allocation->rnsk_company_id !== $expense->payer_company_id && abs((float) $allocation->share_amount) > 0.0001) {
                    $events->push([
                        'date' => $expense->expense_date->toDateString(),
                        'created_at' => $expense->created_at?->format('Y-m-d H:i:s.u') ?? '',
                        'type' => 'expense',
                        'id' => $expense->id,
                        'from' => $allocation->rnsk_company_id,
                        'to' => $expense->payer_company_id,
                        'cents' => $this->moneyCents($allocation->share_amount),
                    ]);
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
                'cents' => $this->moneyCents($settlement->amount),
            ]);
        }

        $sorted = $events->sortBy(fn (array $event) => $event['date'].' '.$event['created_at'].' '.str_pad((string) $event['id'], 12, '0', STR_PAD_LEFT));
        $pairStates = [];
        $statuses = [];

        foreach ($sorted as $event) {
            $key = $this->pairKey($event['from'], $event['to']);
            $first = min($event['from'], $event['to']);
            $direction = $event['from'] === $first ? 1 : -1;
            $pairStates[$key] ??= 0;

            if ($event['type'] === 'expense') {
                $pairStates[$key] += $direction * $event['cents'];
            } else {
                $balanceBefore = abs($pairStates[$key]);
                $pairStates[$key] -= $direction * $event['cents'];
                $statuses[$event['id']] = $event['cents'] >= $balanceBefore ? 'full' : 'partial';
            }
        }

        return $statuses;
    }

    private function expensePayload(RnskExpense $expense, User $user): array
    {
        return [
            'type' => 'expense',
            'id' => $expense->id,
            'date' => $expense->expense_date->toDateString(),
            'purchaser_name' => $expense->purchaser_name,
            'description' => $expense->description,
            'amount' => (float) $expense->amount,
            'notes' => $expense->notes,
            'status' => $expense->status,
            'entry_type' => $expense->entry_type,
            'payer_company' => $expense->payerCompany,
            'allocations' => $expense->allocations->map(fn (RnskExpenseAllocation $allocation) => [
                'id' => $allocation->id,
                'company' => $allocation->company,
                'percentage' => (float) $allocation->percentage,
                'amount' => (float) $allocation->share_amount,
                'amount_paid' => (float) $allocation->amount_paid,
            ])->values()->all(),
            'has_receipt' => (bool) $expense->receipt_path,
            'can_view_receipt' => true,
            'can_edit' => $expense->entry_type === 'expense' && $expense->status === 'active' && ! $expense->locked_at,
            'can_reverse' => $expense->entry_type === 'expense' && $expense->status === 'active' && ! RnskExpense::where('reverses_expense_id', $expense->id)->where('status', 'active')->exists(),
            'can_cancel' => $expense->entry_type === 'expense' && $expense->status === 'active' && ! $expense->locked_at,
            'locked' => (bool) $expense->locked_at,
            'created_by' => $expense->creator,
        ];
    }

    private function settlementPayload(RnskExpenseSettlement $settlement, string $status): array
    {
        return [
            'type' => 'settlement',
            'id' => $settlement->id,
            'date' => $settlement->settled_on->toDateString(),
            'from_company' => $settlement->fromCompany,
            'to_company' => $settlement->toCompany,
            'amount' => (float) $settlement->amount,
            'payment_mode' => $settlement->payment_mode,
            'payment_reference' => $settlement->payment_reference,
            'has_receipt' => (bool) $settlement->receipt_path,
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

    private function lockAffectedExpenses(RnskExpenseSettlement $settlement): void
    {
        RnskExpense::query()
            ->where('entry_type', 'expense')
            ->where('status', 'active')
            ->whereNull('locked_at')
            ->whereDate('expense_date', '<=', $settlement->settled_on)
            ->where(function ($query) use ($settlement) {
                $query->where(function ($query) use ($settlement) {
                    $query->where('payer_company_id', $settlement->to_company_id)
                        ->whereHas('allocations', fn ($query) => $query->where('rnsk_company_id', $settlement->from_company_id)->where('share_amount', '!=', 0));
                })->orWhere(function ($query) use ($settlement) {
                    $query->where('payer_company_id', $settlement->from_company_id)
                        ->whereHas('allocations', fn ($query) => $query->where('rnsk_company_id', $settlement->to_company_id)->where('share_amount', '!=', 0));
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
        abort_if($companies->isEmpty(), 422, 'Add active RNSK companies before entering expenses.');
        abort_unless($companies->sum(fn (RnskCompany $c) => $this->percentageBasisPoints($c->expense_percentage)) === 10000, 422, 'Configure active RNSK company expense percentages to total 100% first.');
    }

    private function assertEditable(RnskExpense $expense): void
    {
        abort_unless($expense->entry_type === 'expense' && $expense->status === 'active' && ! $expense->locked_at, 422, 'This RNSK expense is locked. Reverse it to make a correction.');
    }

    private function percentageBasisPoints(float|string $percentage): int
    {
        return (int) round((float) $percentage * 100, 0, PHP_ROUND_HALF_UP);
    }

    public function gujaratiCompanySummary(Collection $expenses, Collection $pairs, ?int $userCompanyId = null): array
    {
        $activeCompanies = RnskCompany::where('active', true)->orderBy('id')->get();
        $totalSpent = (float) $expenses->sum('amount');

        $companyBreakdown = $activeCompanies->map(function (RnskCompany $company) use ($expenses, $pairs, $totalSpent, $userCompanyId) {
            $paid = (float) $expenses->where('payer_company_id', $company->id)->sum('amount');
            $pct = (float) $company->expense_percentage;
            $fairShare = round($totalSpent * ($pct / 100.0), 2);
            $receivable = (float) $pairs->where('creditor_company_id', $company->id)->where('status', 'open')->sum('amount');
            $payable = (float) $pairs->where('debtor_company_id', $company->id)->where('status', 'open')->sum('amount');
            $netOpen = round($receivable - $payable, 2);

            $statusText = '';
            $statusType = 'settled';
            if ($netOpen > 0) {
                $statusType = 'receivable';
                $statusText = '₹' . number_format($netOpen, 2) . ' લેવાના બાકી છે';
            } elseif ($netOpen < 0) {
                $statusType = 'payable';
                $statusText = '₹' . number_format(abs($netOpen), 2) . ' આપવાના બાકી છે';
            } else {
                $statusType = 'settled';
                $statusText = 'હિસાબ સરભર છે (0 બાકી)';
            }

            return [
                'company_id' => $company->id,
                'name' => $company->name,
                'percentage' => $pct,
                'total_paid' => $paid,
                'total_paid_formatted' => number_format($paid, 2),
                'fair_share' => $fairShare,
                'fair_share_formatted' => number_format($fairShare, 2),
                'receivable' => $receivable,
                'payable' => $payable,
                'net_balance' => $netOpen,
                'status_type' => $statusType,
                'status_text' => $statusText,
                'is_current_company' => $userCompanyId && (int)$userCompanyId === (int)$company->id,
            ];
        })->values()->all();

        $openPairs = $pairs->where('status', 'open')->values()->map(function (array $pair) {
            $debtor = $pair['debtor_company']['name'] ?? 'કંપની';
            $creditor = $pair['creditor_company']['name'] ?? 'કંપની';
            $amt = number_format((float) $pair['amount'], 2);
            return [
                'debtor_name' => $debtor,
                'creditor_name' => $creditor,
                'amount' => (float) $pair['amount'],
                'sentence_gu' => "{$debtor} પાસેથી {$creditor} ને ₹{$amt} લેવાના પેન્ડિંગ છે.",
            ];
        })->all();

        return [
            'total_spent' => $totalSpent,
            'total_spent_formatted' => number_format($totalSpent, 2),
            'companies' => $companyBreakdown,
            'pending_settlements' => $openPairs,
        ];
    }

    private function moneyCents(float|string $amount): int
    {
        return (int) round((float) $amount * 100, 0, PHP_ROUND_HALF_UP);
    }
}
