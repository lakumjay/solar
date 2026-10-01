<?php

namespace App\Console\Commands;

use App\Models\DailyReading;
use App\Models\User;
use App\Services\ReplaceSolarReadingsService;
use Illuminate\Console\Command;
use Throwable;

class ReplaceSolarReadings extends Command
{
    protected $signature = 'solar:replace-readings
        {file : Path to the authoritative XLSX workbook}
        {--commit : Back up and replace the local solar readings}';

    protected $description = 'Validate and optionally replace local solar readings from the authoritative workbook';

    public function handle(ReplaceSolarReadingsService $service): int
    {
        if (app()->environment('production')) {
            $this->error('Refused: solar reading replacement is disabled in production.');

            return self::FAILURE;
        }

        try {
            $path = (string) $this->argument('file');
            $summary = $service->preview($path);

            $this->info('Workbook validation passed.');
            $this->line("SHA-256: {$summary['workbook_sha256']}");
            $this->line("Date range: {$summary['date_start']} to {$summary['date_end']}");
            $this->line("Validated rows: {$summary['reading_count']} readings, {$summary['inverter_output_count']} inverter outputs");
            foreach ($summary['companies'] as $company) {
                $this->line("- {$company['company_name']}: {$company['reading_count']} readings, {$company['inverter_output_count']} inverter outputs");
            }

            if (! $this->option('commit')) {
                $companyIds = collect($summary['companies'])->pluck('company_id');
                $existingReadings = DailyReading::whereIn('company_id', $companyIds)->count();
                $existingOutputs = DailyReading::whereIn('company_id', $companyIds)->withCount('outputs')->get()->sum('outputs_count');
                $this->newLine();
                $this->warn("DRY RUN: {$existingReadings} existing readings and {$existingOutputs} inverter outputs would be backed up and replaced.");
                $this->comment('No database records were changed. Run again with --commit to apply.');

                return self::SUCCESS;
            }

            $actor = User::query()
                ->where('role', 'super_admin')
                ->where('active', true)
                ->orderBy('id')
                ->first();
            if (! $actor) {
                $this->error('No active super-admin account exists. Nothing was changed.');

                return self::FAILURE;
            }

            $result = $service->replace($path, $actor);
            $this->newLine();
            $this->info("Replacement complete: {$result['reading_count']} readings and {$result['inverter_output_count']} inverter outputs imported.");
            $this->line("Private backup: storage/app/private/{$result['backup_path']}");

            return self::SUCCESS;
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }
}
