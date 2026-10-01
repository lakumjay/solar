<?php

namespace App\Console\Commands;

use App\Services\PlantPhotoService;
use Illuminate\Console\Command;

class PrunePlantPhotosCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'plant-photos:prune {--days=10 : Number of days to keep photos}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Automatically prune plant photos older than 10 days to conserve server disk storage';

    /**
     * Execute the console command.
     */
    public function handle(PlantPhotoService $photoService): int
    {
        $days = (int) $this->option('days') ?: 10;
        $this->info("Pruning plant photos older than {$days} days...");

        $deletedCount = $photoService->pruneExpiredPhotos($days);

        $this->info("Successfully deleted {$deletedCount} expired plant photos.");
        return self::SUCCESS;
    }
}
