<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('plant-photos:prune --days=10')->dailyAt('02:00');
Schedule::command('isolarcloud:auto-save-daily')->dailyAt('20:05');
Schedule::command('isolarcloud:auto-save-daily')->dailyAt('20:30');
