<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Employee;
use App\Models\PlantPhoto;
use App\Models\PlantPhotoTask;
use Carbon\Carbon;
use Exception;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PlantPhotoService
{
    /**
     * Get today's scheduled tasks and photo completion counts.
     */
    public function getTodayTasksWithProgress(?int $employeeId = null, ?int $companyId = null): array
    {
        // 1. Auto prune photos older than 10 days on request
        $this->pruneExpiredPhotos(10);

        $now = Carbon::now();
        $currentTimeStr = $now->format('H:i:s');
        $todayDate = $now->toDateString();

        $query = PlantPhotoTask::where('active', true)->orderBy('sort_order')->orderBy('start_time');
        if ($companyId) {
            $query->where(function ($q) use ($companyId) {
                $q->whereNull('company_id')->orWhere('company_id', $companyId);
            });
        }
        $tasks = $query->get();

        $todayPhotosQuery = PlantPhoto::whereDate('captured_at', $todayDate);
        if ($companyId) {
            $todayPhotosQuery->where('company_id', $companyId);
        }
        $todayPhotos = $todayPhotosQuery->with(['employee.user', 'task'])->get();

        $totalRequiredToday = $tasks->sum('required_photos');
        $totalCapturedToday = $todayPhotos->count();

        $taskList = [];
        $activeTaskNow = null;

        foreach ($tasks as $task) {
            $startTime = Carbon::createFromTimeString($task->start_time);
            $endTime = Carbon::createFromTimeString($task->end_time);

            $isCurrentWindow = ($now->between($startTime, $endTime) || ($task->start_time <= $currentTimeStr && $currentTimeStr <= $task->end_time));
            $isPastWindow = ($currentTimeStr > $task->end_time);

            $photosForTask = $todayPhotos->where('task_id', $task->id)->values();
            $capturedCount = $photosForTask->count();
            $isCompleted = ($capturedCount >= $task->required_photos);

            $taskItem = [
                'id' => $task->id,
                'title' => $task->title,
                'start_time' => Carbon::createFromTimeString($task->start_time)->format('h:i A'),
                'end_time' => Carbon::createFromTimeString($task->end_time)->format('h:i A'),
                'raw_start' => $task->start_time,
                'raw_end' => $task->end_time,
                'required_photos' => $task->required_photos,
                'captured_count' => $capturedCount,
                'is_completed' => $isCompleted,
                'is_current_window' => $isCurrentWindow,
                'is_past_window' => $isPastWindow,
                'description' => $task->description,
                'company_id' => $task->company_id,
                'photos' => $photosForTask->map(fn ($p) => [
                    'id' => $p->id,
                    'captured_at' => $p->captured_at->format('h:i:s A'),
                    'photo_url' => route('plant-photos.image', $p->id),
                    'latitude' => $p->latitude,
                    'longitude' => $p->longitude,
                    'address' => $p->address,
                ])->all(),
            ];

            if ($isCurrentWindow) {
                $activeTaskNow = $taskItem;
            }

            $taskList[] = $taskItem;
        }

        return [
            'date' => $now->format('d M Y'),
            'total_required' => $totalRequiredToday,
            'total_captured' => $totalCapturedToday,
            'completion_pct' => $totalRequiredToday > 0 ? min(100, round(($totalCapturedToday / $totalRequiredToday) * 100)) : 100,
            'is_all_completed' => $totalCapturedToday >= $totalRequiredToday,
            'active_task_now' => $activeTaskNow,
            'tasks' => $taskList,
        ];
    }

    /**
     * Upload photo, compress automatically, store GPS and return record.
     */
    public function uploadPhoto(
        int $employeeId,
        int $companyId,
        ?int $taskId,
        mixed $imageFileOrBase64,
        ?float $latitude = null,
        ?float $longitude = null,
        ?string $notes = null
    ): PlantPhoto {
        $employee = Employee::findOrFail($employeeId);
        $company = Company::findOrFail($companyId);

        // Compress and save image
        $savedPath = $this->compressAndSaveImage($imageFileOrBase64);

        // Address resolution from Open-Meteo or reverse geocode
        $address = null;
        if ($latitude !== null && $longitude !== null && abs($latitude) > 0.1 && abs($longitude) > 0.1) {
            $address = $this->resolveGpsAddress($latitude, $longitude, $company->plant_location);
        } else {
            $address = $company->plant_location ?: 'Solar Plant Location';
        }

        $photo = PlantPhoto::create([
            'task_id' => $taskId,
            'employee_id' => $employee->id,
            'company_id' => $company->id,
            'photo_path' => $savedPath,
            'captured_at' => Carbon::now(),
            'latitude' => $latitude,
            'longitude' => $longitude,
            'address' => $address,
            'notes' => $notes,
        ]);

        return $photo;
    }

    /**
     * Compress image using GD to max 1280px width/height and 75% quality.
     */
    protected function compressAndSaveImage(mixed $source): string
    {
        $rawImageData = null;

        if ($source instanceof UploadedFile) {
            $rawImageData = file_get_contents($source->getRealPath());
        } elseif (is_string($source)) {
            // Check for base64 data URL
            if (str_contains($source, ';base64,')) {
                [, $base64Data] = explode(';base64,', $source);
                $rawImageData = base64_decode($base64Data);
            } else {
                $rawImageData = base64_decode($source);
            }
        }

        if (! $rawImageData) {
            throw new Exception('Invalid or missing image data for plant photo capture.');
        }

        $srcImg = @imagecreatefromstring($rawImageData);
        if (! $srcImg) {
            throw new Exception('Could not decode photo stream. Ensure valid camera format.');
        }

        $origW = imagesx($srcImg);
        $origH = imagesy($srcImg);

        $maxDim = 1280;
        $targetW = $origW;
        $targetH = $origH;

        if ($origW > $maxDim || $origH > $maxDim) {
            if ($origW > $origH) {
                $targetW = $maxDim;
                $targetH = (int) round($origH * ($maxDim / $origW));
            } else {
                $targetH = $maxDim;
                $targetW = (int) round($origW * ($maxDim / $origH));
            }
        }

        $destImg = imagecreatetruecolor($targetW, $targetH);
        imagecopyresampled($destImg, $srcImg, 0, 0, 0, 0, $targetW, $targetH, $origW, $origH);

        $fileName = 'plant_photos/' . date('Y/m') . '/' . Str::random(24) . '.jpg';
        $fullStoragePath = storage_path('app/private/' . $fileName);

        $dir = dirname($fullStoragePath);
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        // Save compressed JPEG (quality 75 gives 80-140KB per picture with crisp sharpness)
        imagejpeg($destImg, $fullStoragePath, 75);

        imagedestroy($srcImg);
        imagedestroy($destImg);

        return $fileName;
    }

    /**
     * Reverse geocoding helper.
     */
    protected function resolveGpsAddress(float $lat, float $lon, ?string $defaultName = null): string
    {
        try {
            $resp = Http::timeout(2)
                ->withHeaders(['User-Agent' => 'SolarFlow-PlantMonitor/1.0'])
                ->get('https://nominatim.openstreetmap.org/reverse', [
                    'lat' => $lat,
                    'lon' => $lon,
                    'format' => 'json',
                ]);

            if ($resp->successful() && ! empty($resp->json('display_name'))) {
                return (string) $resp->json('display_name');
            }
        } catch (\Throwable $t) {
            // Fallback
        }

        return ($defaultName ?: 'Solar Plant Site') . " ({$lat}, {$lon})";
    }

    /**
     * Auto delete photos older than specified days (Default 10 days).
     */
    public function pruneExpiredPhotos(int $keepDays = 10): int
    {
        $cutoff = Carbon::now()->subDays($keepDays);

        $expiredPhotos = PlantPhoto::where('captured_at', '<', $cutoff)->get();
        $count = 0;

        foreach ($expiredPhotos as $photo) {
            try {
                $fullPath = storage_path('app/private/' . $photo->photo_path);
                if (file_exists($fullPath)) {
                    @unlink($fullPath);
                }
                $photo->delete();
                $count++;
            } catch (\Throwable $e) {
                Log::warning('Plant photo pruning error', ['id' => $photo->id, 'error' => $e->getMessage()]);
            }
        }

        return $count;
    }

    /**
     * Get Gallery Photos with date, company, and task filters.
     */
    public function getGalleryData(?string $date = null, ?int $companyId = null, ?int $taskId = null): array
    {
        $this->pruneExpiredPhotos(10);

        $targetDate = $date ?: Carbon::today()->toDateString();

        $query = PlantPhoto::with(['employee.user', 'company', 'task'])
            ->whereDate('captured_at', $targetDate)
            ->orderBy('captured_at', 'desc');

        if ($companyId) {
            $query->where('company_id', $companyId);
        }

        if ($taskId) {
            $query->where('task_id', $taskId);
        }

        $photos = $query->get();

        $tasks = PlantPhotoTask::where('active', true)->orderBy('sort_order')->get();
        $companies = Company::where('active', true)->orderBy('id')->get();

        return [
            'date' => $targetDate,
            'total_photos' => $photos->count(),
            'photos' => $photos->map(fn ($p) => [
                'id' => $p->id,
                'task_title' => $p->task?->title ?: 'General Plant Capture',
                'task_id' => $p->task_id,
                'employee_name' => $p->employee?->user?->name ?: 'Employee',
                'company_name' => $p->company?->name ?: 'Solar Company',
                'company_id' => $p->company_id,
                'captured_at' => $p->captured_at->format('d M Y, h:i:s A'),
                'time_formatted' => $p->captured_at->format('h:i A'),
                'latitude' => $p->latitude,
                'longitude' => $p->longitude,
                'google_maps_url' => ($p->latitude && $p->longitude) ? "https://maps.google.com/?q={$p->latitude},{$p->longitude}" : null,
                'address' => $p->address,
                'notes' => $p->notes,
                'photo_url' => route('plant-photos.image', $p->id),
            ])->all(),
            'tasks' => $tasks->map(fn ($t) => [
                'id' => $t->id,
                'title' => $t->title,
                'start_time' => Carbon::createFromTimeString($t->start_time)->format('h:i A'),
                'end_time' => Carbon::createFromTimeString($t->end_time)->format('h:i A'),
                'required_photos' => $t->required_photos,
                'company_id' => $t->company_id,
            ])->all(),
            'companies' => $companies->map(fn ($c) => [
                'id' => $c->id,
                'name' => $c->name,
            ])->all(),
        ];
    }
}
