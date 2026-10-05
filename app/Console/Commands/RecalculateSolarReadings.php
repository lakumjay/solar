<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Services\ReadingCalculationService;
use Illuminate\Console\Command;

class RecalculateSolarReadings extends Command
{
    protected $signature = 'solar:recalculate-readings {company_id? : Optional specific company ID to recalculate}';

    protected $description = 'Recalculate meter unit differences and totals for all companies with anti-negative protection';

    public function handle(ReadingCalculationService $calculator): int
    {
        $companyId = $this->argument('company_id');

        if ($companyId) {
            $companies = Company::where('id', $companyId)->get();
            if ($companies->isEmpty()) {
                $this->error("Company with ID {$companyId} not found.");
                return self::FAILURE;
            }
        } else {
            $companies = Company::all();
        }

        $this->info("Starting recalculation for {$companies->count()} company/companies...");

        foreach ($companies as $company) {
            $this->line("Recalculating readings for: [{$company->id}] {$company->name}...");
            $calculator->recalculate($company->id);
        }

        $this->info("All readings recalculated successfully with zero negative units!");

        return self::SUCCESS;
    }
}
