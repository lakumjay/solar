<?php

namespace App\Console\Commands;

use App\Services\SharedExpenseService;
use Illuminate\Console\Command;

class RecalculateSharedExpensesCommand extends Command
{
    protected $signature = 'expenses:recalculate-historical';
    protected $description = 'Recalculate allocations and balances for all historical shared expenses using current active company percentages';

    public function handle(SharedExpenseService $expenseService): int
    {
        $this->info('Starting historical shared expenses recalculation...');
        $count = $expenseService->recalculateAllHistoricalExpenses();
        $this->info("Successfully recalculated {$count} historical shared expenses.");

        return Command::SUCCESS;
    }
}
