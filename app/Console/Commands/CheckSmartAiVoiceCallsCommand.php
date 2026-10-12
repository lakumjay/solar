<?php

namespace App\Console\Commands;

use App\Services\ISolarCloudService;
use App\Services\SmartVoiceCallAlertService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

class CheckSmartAiVoiceCallsCommand extends Command
{
    protected $signature = 'solar:check-ai-voice-calls';

    protected $description = 'Evaluate live plant inverter shutdowns, employee clock-in, 4 PM attendance, and 6:30/7:00 PM logout AI voice calls';

    public function handle(SmartVoiceCallAlertService $alertService, ISolarCloudService $solarService): int
    {
        $overview = Cache::get('dashboard_solar_overview_all');
        if (empty($overview)) {
            try {
                $overview = $solarService->getDashboardSolarOverview('all');
                if ($overview) {
                    Cache::put('dashboard_solar_overview_all', $overview, 120);
                }
            } catch (\Throwable $e) {
                $overview = null;
            }
        }

        Cache::forget('smart_voice_call_rules_evaluated_lock');
        $alertService->evaluateAllRules($overview);

        $this->info('Smart AI Voice Call rules evaluated successfully.');
        return self::SUCCESS;
    }
}
