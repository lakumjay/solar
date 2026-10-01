<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Models\DailyInverterOutput;
use App\Models\DailyReading;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\ISolarCloudService;
use App\Services\ReadingCalculationService;
use Carbon\Carbon;
use Exception;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AutoSaveDailySolarReadings extends Command
{
    protected $signature = 'isolarcloud:auto-save-daily {date? : Date in YYYY-MM-DD format (defaults to today)}';

    protected $description = 'Automatically fetch and save end-of-day (8:00 PM) inverter readings from iSolarCloud for all companies';

    public function handle(
        ISolarCloudService $solarCloud,
        ReadingCalculationService $calculator,
        ActivityLogger $activity
    ): int {
        $date = $this->argument('date') ?: Carbon::today()->toDateString();
        $this->info("=== Starting 8:00 PM Auto-Save Daily Solar Readings for [{$date}] ===");

        $systemUser = User::where('role', 'super_admin')->first() ?: User::first();
        $companies = Company::where('active', true)->with(['inverters' => fn ($q) => $q->where('active', true)])->get();

        if ($companies->isEmpty()) {
            $this->warn('No active companies found.');
            return self::FAILURE;
        }

        $totalSavedInverters = 0;

        foreach ($companies as $company) {
            $this->line("Processing company: {$company->name} (ID: {$company->id})...");

            try {
                $syncResult = $solarCloud->syncDailyGeneration($company->id, $date);

                if (empty($syncResult['outputs'])) {
                    $this->warn("No inverter outputs received for {$company->name}. Skipping.");
                    continue;
                }

                DB::transaction(function () use ($company, $date, $syncResult, $systemUser, $calculator, $activity, &$totalSavedInverters) {
                    $readingDate = Carbon::parse($date)->startOfDay();

                    $existing = DailyReading::where('company_id', $company->id)
                        ->where('reading_date', $readingDate)
                        ->first();

                    $reading = DailyReading::updateOrCreate(
                        [
                            'company_id' => $company->id,
                            'reading_date' => $readingDate,
                        ],
                        [
                            'created_by' => $existing?->created_by ?? $systemUser?->id ?? 1,
                            'updated_by' => $systemUser?->id ?? 1,
                        ]
                    );

                    // Update or insert each inverter's output
                    foreach ($syncResult['outputs'] as $inverterId => $generation) {
                        DailyInverterOutput::updateOrCreate(
                            [
                                'daily_reading_id' => $reading->id,
                                'inverter_id' => (int) $inverterId,
                            ],
                            [
                                'generation' => (float) $generation,
                            ]
                        );
                        $totalSavedInverters++;
                    }

                    // Recalculate company unit formulas forward
                    $calculator->recalculate($company->id);

                    $activity->log(
                        $systemUser,
                        $company->id,
                        $existing ? 'updated' : 'created',
                        'daily_reading',
                        $reading->id,
                        "Automatic 8:00 PM end-of-day reading auto-saved from iSolarCloud for {$date}",
                        ['synced_inverters' => count($syncResult['outputs'])]
                    );
                });

                $this->info("✔ Successfully saved {$company->name} daily inverter generation ({$syncResult['synced_count']} inverters).");
            } catch (Exception $e) {
                $this->error("✖ Error processing {$company->name}: " . $e->getMessage());
                Log::error("isolarcloud:auto-save-daily error for {$company->name}", ['exception' => $e]);
            }
        }

        $this->info("=== End-of-Day Sync Complete! Total Inverter Outputs saved: {$totalSavedInverters} ===");
        return self::SUCCESS;
    }
}
