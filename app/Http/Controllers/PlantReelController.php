<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Employee;
use App\Models\PlantReel;
use App\Services\ActivityLogger;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PlantReelController extends Controller
{
    public function __construct(protected ActivityLogger $activity)
    {
    }

    /**
     * Get all reels with pagination/latest order.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $companyId = $request->query('company_id');

        $query = PlantReel::with(['user', 'employee.user', 'company'])
            ->orderBy('created_at', 'desc');

        if ($companyId && $companyId !== 'all') {
            $query->where('company_id', (int) $companyId);
        }

        $reels = $query->limit(50)->get();

        return response()->json([
            'success' => true,
            'reels' => $reels->map(function (PlantReel $r) {
                return [
                    'id' => $r->id,
                    'title' => $r->title,
                    'caption' => $r->caption,
                    'template_name' => $r->template_name,
                    'music_title' => $r->music_title,
                    'duration_seconds' => $r->duration_seconds,
                    'likes_count' => (int) $r->likes_count,
                    'views_count' => (int) $r->views_count,
                    'created_at' => $r->created_at ? $r->created_at->format('d M Y, h:i A') : '',
                    'time_ago' => $r->created_at ? $r->created_at->diffForHumans() : '',
                    'video_url' => route('plant-reels.video', $r->id),
                    'thumbnail_url' => $r->thumbnail_path ? route('plant-reels.thumbnail', $r->id) : null,
                    'user_id' => $r->user_id,
                    'author_name' => $r->employee?->user?->name ?: ($r->user?->name ?: 'Solar Team Member'),
                    'author_role' => $r->user?->role ?: 'Employee',
                    'company_id' => $r->company_id,
                    'company_name' => $r->company?->name ?: 'Solar Plant',
                ];
            })->all(),
        ]);
    }

    /**
     * Create and upload a new Reel (Employees, Company Admins, and Super Admin).
     */
    public function store(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'video' => ['required'], // file or base64
            'title' => ['nullable', 'string', 'max:150'],
            'caption' => ['nullable', 'string', 'max:500'],
            'template_name' => ['nullable', 'string', 'max:50'],
            'music_title' => ['nullable', 'string', 'max:100'],
            'duration_seconds' => ['nullable', 'integer', 'min:3', 'max:120'],
            'company_id' => ['nullable'],
        ]);

        $employee = Employee::where('user_id', $user->id)->first();
        $companyId = $request->input('company_id');
        if (! $companyId || $companyId === 'all') {
            $companyId = $user->company_id ?: Company::where('active', true)->value('id');
        }

        try {
            $dir = storage_path('app/public/reels');
            if (! file_exists($dir)) {
                @mkdir($dir, 0777, true);
            }

            $videoFileName = 'reel_' . date('Ymd_His') . '_' . Str::random(8) . '.mp4';
            $fullVideoPath = $dir . '/' . $videoFileName;

            if ($request->hasFile('video')) {
                $request->file('video')->move($dir, $videoFileName);
            } else {
                // Base64 video data URL or binary
                $rawVideoData = $request->input('video');
                if (str_contains($rawVideoData, 'base64,')) {
                    $rawVideoData = explode('base64,', $rawVideoData, 2)[1];
                }
                $decoded = base64_decode($rawVideoData);
                if (! $decoded) {
                    throw new Exception('Invalid video binary or base64 stream.');
                }
                file_put_contents($fullVideoPath, $decoded);
            }

            // Optional thumbnail
            $thumbFileName = null;
            if ($request->filled('thumbnail')) {
                $rawThumbData = $request->input('thumbnail');
                if (str_contains($rawThumbData, 'base64,')) {
                    $rawThumbData = explode('base64,', $rawThumbData, 2)[1];
                }
                $decodedThumb = base64_decode($rawThumbData);
                if ($decodedThumb) {
                    $thumbFileName = 'thumb_' . date('Ymd_His') . '_' . Str::random(8) . '.jpg';
                    file_put_contents($dir . '/' . $thumbFileName, $decodedThumb);
                }
            }

            $reel = PlantReel::create([
                'user_id' => $user->id,
                'employee_id' => $employee?->id,
                'company_id' => $companyId ? (int) $companyId : null,
                'title' => $request->input('title') ?: 'Plant Solar Reel',
                'caption' => $request->input('caption'),
                'video_path' => $videoFileName,
                'thumbnail_path' => $thumbFileName,
                'template_name' => $request->input('template_name') ?: 'solar_hero',
                'music_title' => $request->input('music_title') ?: 'Trending Beats',
                'duration_seconds' => (int) ($request->input('duration_seconds') ?: 15),
                'likes_count' => 0,
                'views_count' => 0,
            ]);

            $this->activity->log(
                $user,
                $companyId,
                'created',
                'plant_reel',
                $reel->id,
                "Created plant reel '{$reel->title}' with template {$reel->template_name}"
            );

            return response()->json([
                'success' => true,
                'message' => 'Reel uploaded and published successfully!',
                'reel' => $reel,
            ]);
        } catch (Exception $e) {
            Log::error('Reel upload error: ' . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * Delete Reel (Super Admin or Author).
     */
    public function destroy(PlantReel $reel, Request $request)
    {
        $user = $request->user();

        $canDelete = $user->role === 'super_admin'
            || $reel->user_id === $user->id
            || ($user->role === 'company_admin' && $reel->company_id === $user->company_id);

        if (! $canDelete) {
            return response()->json(['error' => 'Unauthorized to delete this reel.'], 403);
        }

        try {
            $dir = storage_path('app/public/reels/');
            if ($reel->video_path && file_exists($dir . $reel->video_path)) {
                @unlink($dir . $reel->video_path);
            }
            if ($reel->thumbnail_path && file_exists($dir . $reel->thumbnail_path)) {
                @unlink($dir . $reel->thumbnail_path);
            }

            $title = $reel->title;
            $reel->delete();

            $this->activity->log(
                $user,
                $reel->company_id,
                'deleted',
                'plant_reel',
                0,
                "Deleted plant reel '{$title}'"
            );

            return response()->json([
                'success' => true,
                'message' => 'Reel deleted successfully.',
            ]);
        } catch (Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * Stream video binary with HTTP Byte-Range support for smooth mobile and web playback.
     */
    public function video(PlantReel $reel)
    {
        $possiblePaths = [
            storage_path('app/public/reels/' . $reel->video_path),
            storage_path('app/reels/' . $reel->video_path),
            public_path('storage/reels/' . $reel->video_path),
            public_path('reels/' . $reel->video_path),
        ];

        $fullPath = null;
        foreach ($possiblePaths as $p) {
            if (file_exists($p) && is_file($p)) {
                $fullPath = $p;
                break;
            }
        }

        if (! $fullPath) {
            return response()->json(['error' => 'Video file not found on disk'], 404);
        }

        $size = filesize($fullPath);
        $file = @fopen($fullPath, 'rb');
        if (! $file) {
            return response()->json(['error' => 'Cannot open video file'], 500);
        }

        $start = 0;
        $end = $size - 1;
        $status = 200;

        $range = request()->header('Range');
        if ($range && preg_match('/bytes=(\d+)-(\d*)/i', $range, $matches)) {
            $start = (int) $matches[1];
            if (! empty($matches[2])) {
                $end = (int) $matches[2];
            }
            $status = 206;
        }

        $length = $end - $start + 1;
        fseek($file, $start);

        $headers = [
            'Content-Type' => 'video/mp4',
            'Content-Length' => $length,
            'Accept-Ranges' => 'bytes',
            'Content-Range' => "bytes {$start}-{$end}/{$size}",
            'Cache-Control' => 'public, max-age=86400',
        ];

        return response()->stream(function () use ($file, $length) {
            $bufferSize = 1024 * 64; // 64KB chunks
            $bytesSent = 0;
            while (! feof($file) && $bytesSent < $length) {
                $readLength = min($bufferSize, $length - $bytesSent);
                echo fread($file, $readLength);
                flush();
                $bytesSent += $readLength;
            }
            fclose($file);
        }, $status, $headers);
    }

    /**
     * Serve thumbnail image.
     */
    public function thumbnail(PlantReel $reel)
    {
        $path = storage_path('app/public/reels/' . $reel->thumbnail_path);
        if (! file_exists($path)) {
            return response()->json(['error' => 'Thumbnail not found'], 404);
        }

        return response()->file($path, [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }

    /**
     * Like a Reel.
     */
    public function like(PlantReel $reel)
    {
        $reel->increment('likes_count');
        return response()->json([
            'success' => true,
            'likes_count' => (int) $reel->likes_count,
        ]);
    }

    /**
     * Track Reel View.
     */
    public function view(PlantReel $reel)
    {
        $reel->increment('views_count');
        return response()->json([
            'success' => true,
            'views_count' => (int) $reel->views_count,
        ]);
    }
}
