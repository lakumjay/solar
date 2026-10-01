<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Services\ISolarCloudService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SyncISolarCloudCommand extends Command
{
    protected $signature = 'isolarcloud:sync {company_id? : Optional company ID to sync} {date? : Date to sync (YYYY-MM-DD), defaults to today}';

    protected $description = 'Sync daily solar inverter generation from iSolarCloud into Daily Readings';

    public function handle(ISolarCloudService $solarCloud): int
    {
        $date = $this->argument('date') ?: Carbon::today()->toDateString();
        $companyId = $this->argument('company_id');

        $this->info("Starting iSolarCloud generation sync for date: {$date}");

        $companies = $companyId
            ? Company::whereKey($companyId)->get()
            : Company::where('active', true)->get();

        if ($companies->isEmpty()) {
            $this->warn('No active companies found.');
            return self::FAILURE;
        }

        $totalSynced = 0;

        foreach ($companies as $company) {
            $this->line("Processing company: {$company->name} (ID: {$company->id})...");

            try {
                $result = $solarCloud->syncDailyGeneration($company->id, $date);

                if (! empty($result['outputs'])) {
                    $this->info("✔ Synced {$result['synced_count']} inverters for {$company->name}:");
                    foreach ($result['devices'] as $dev) {
                        $this->line("   - {$dev['inverter_name']} (SN: {$dev['serial_number']}): {$dev['generation']} kWh");
                    }
                    $totalSynced += $result['synced_count'];
                } else {
                    $this->warn("⚠ No inverters matched for {$company->name}.");
                }
            } catch (\Exception $e) {
                $this->error("✖ Error syncing {$company->name}: " . $e->getMessage());
            }
        }

        $this->info("Sync finished. Total inverters updated: {$totalSynced}");
        return self::SUCCESS;
    }
}
