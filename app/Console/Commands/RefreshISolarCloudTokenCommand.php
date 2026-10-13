<?php

namespace App\Console\Commands;

use App\Models\ISolarCloudToken;
use App\Services\ISolarCloudService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class RefreshISolarCloudTokenCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'isolarcloud:refresh-token {--force : Force refresh even if more than 36 hours remain}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Automatically refresh the iSolarCloud OAuth token when 36 hours or less remain before expiry';

    public function handle(ISolarCloudService $solarCloud): int
    {
        $token = ISolarCloudToken::latest()->first();
        $force = (bool) $this->option('force');

        if (! $token) {
            $this->info('No iSolarCloud token found. Attempting auto-login fallback...');
            $res = $solarCloud->loginWithCredentials();
            if ($res) {
                $this->info('iSolarCloud token created via auto-login.');
                return self::SUCCESS;
            }
            $this->warn('No token or auto-login credentials available.');
            return self::SUCCESS;
        }

        $hoursRemaining = $token->expires_at
            ? round(Carbon::now()->diffInMinutes($token->expires_at, false) / 60, 1)
            : 0;

        $needsRefresh = $force
            || ! $token->expires_at
            || Carbon::now()->addHours(36)->gte($token->expires_at)
            || $token->isExpired();

        if (! $needsRefresh) {
            $this->info("iSolarCloud token is healthy ({$hoursRemaining}h remaining > 36h threshold). No refresh needed yet.");
            return self::SUCCESS;
        }

        $this->info("Refreshing iSolarCloud token ({$hoursRemaining}h remaining)...");

        $refreshed = $solarCloud->refreshToken();
        if ($refreshed) {
            $newToken = ISolarCloudToken::latest()->first();
            $newExpiry = $newToken?->expires_at?->toDateTimeString() ?? 'unknown';
            $this->info("✅ iSolarCloud token refreshed successfully! New expiry: {$newExpiry}");
            Log::info('iSolarCloud token auto-refreshed via cron command', ['expires_at' => $newExpiry]);
            return self::SUCCESS;
        }

        $this->warn('iSolarCloud token refresh did not return a new token.');
        return self::SUCCESS;
    }
}
