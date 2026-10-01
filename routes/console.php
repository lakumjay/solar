<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('isolarcloud:auto-save-daily')
    ->dailyAt('20:00')
    ->timezone('Asia/Kolkata')
    ->withoutOverlapping()
    ->appendOutputTo(storage_path('logs/isolarcloud-cron.log'));
