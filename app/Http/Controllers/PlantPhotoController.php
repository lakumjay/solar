<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\Employee;
use App\Models\PlantPhoto;
use App\Models\PlantPhotoTask;
use App\Services\ActivityLogger;
use App\Services\PlantPhotoService;
use App\Services\SolarAccessService;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Response;

class PlantPhotoController extends Controller
{
    public function __construct(
        private readonly PlantPhotoService $photoService,
        private readonly SolarAccessService $access,
        private readonly ActivityLogger $activity,
    ) {}

    /**
     * Get today's tasks and employee completion progress.
     */
    public function tasks(Request $request)
    {
        $user = $request->user();
        $employee = Employee::where('user_id', $user->id)->first();
        $companyId = $user->company_id ?: ($request->input('company_id') ?: Company::where('active', true)->value('id'));

        $data = $this->photoService->getTodayTasksWithProgress($employee?->id, $companyId);
        return response()->json($data);
    }

    /**
     * Super admin create or update photo task.
     */
    public function saveTask(Request $request)
    {
        $this->access->requireSuperAdmin($request);

        $request->validate([
            'id' => ['nullable', 'integer', 'exists:plant_photo_tasks,id'],
            'title' => ['required', 'string', 'max:150'],
            'start_time' => ['required', 'string'],
            'end_time' => ['required', 'string'],
            'required_photos' => ['required', 'integer', 'min:1', 'max:50'],
            'description' => ['nullable', 'string', 'max:500'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $task = PlantPhotoTask::updateOrCreate(
            ['id' => $request->input('id')],
            [
                'title' => $request->input('title'),
                'start_time' => $request->input('start_time'),
                'end_time' => $request->input('end_time'),
                'required_photos' => (int) $request->input('required_photos'),
                'description' => $request->input('description'),
                'company_id' => $request->input('company_id') ?: null,
                'sort_order' => (int) ($request->input('sort_order') ?? 0),
                'active' => true,
            ]
        );

        $this->activity->log(
            $request->user(),
            $task->company_id,
            $request->filled('id') ? 'updated' : 'created',
            'plant_photo_task',
            $task->id,
            "Photo schedule task '{$task->title}' ({$task->start_time}-{$task->end_time}) saved with {$task->required_photos} required photos."
        );

        return response()->json([
            'success' => true,
            'message' => 'Plant photo schedule task saved successfully.',
            'task' => $task,
        ]);
    }

    /**
     * Super admin delete a task.
     */
    public function deleteTask(PlantPhotoTask $task, Request $request)
    {
        $this->access->requireSuperAdmin($request);

        $title = $task->title;
        $task->delete();

        $this->activity->log(
            $request->user(),
            null,
            'deleted',
            'plant_photo_task',
            0,
            "Deleted plant photo task '{$title}'"
        );

        return response()->json([
            'success' => true,
            'message' => 'Plant photo task deleted successfully.',
        ]);
    }

    /**
     * Employee and Admin upload live back camera photo with GPS.
     */
    public function upload(Request $request)
    {
        $user = $request->user();
        $employee = Employee::where('user_id', $user->id)->first();

        // If admin or user without separate employee row, fallback gracefully
        if (! $employee) {
            $employee = Employee::first();
        }

        $request->validate([
            'photo' => ['required'], // file or base64 data url
            'task_id' => ['nullable', 'integer', 'exists:plant_photo_tasks,id'],
            'latitude' => ['nullable'],
            'longitude' => ['nullable'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $taskId = $request->filled('task_id') ? (int) $request->input('task_id') : null;
        $task = $taskId ? PlantPhotoTask::find($taskId) : null;

        $companyId = $request->input('company_id')
            ?: ($task?->company_id
            ?: ($user->company_id
            ?: Company::where('active', true)->value('id')));

        $company = Company::find($companyId) ?: Company::where('active', true)->first();
        $companyId = $company ? $company->id : 1;
        $employeeId = $employee ? $employee->id : 1;

        try {
            $photo = $this->photoService->uploadPhoto(
                employeeId: (int) $employeeId,
                companyId: (int) $companyId,
                taskId: $request->filled('task_id') ? (int) $request->input('task_id') : null,
                imageFileOrBase64: $request->file('photo') ?: $request->input('photo'),
                latitude: $request->filled('latitude') ? (float) $request->input('latitude') : null,
                longitude: $request->filled('longitude') ? (float) $request->input('longitude') : null,
                notes: $request->input('notes')
            );

            $this->activity->log(
                $user,
                $companyId,
                'uploaded',
                'plant_photo',
                $photo->id,
                "Captured plant photo for task ID {$photo->task_id} at {$photo->address}"
            );

            return response()->json([
                'success' => true,
                'message' => 'Plant photo captured and uploaded successfully.',
                'photo' => [
                    'id' => $photo->id,
                    'photo_url' => route('plant-photos.image', $photo->id),
                    'captured_at' => $photo->captured_at->format('h:i:s A'),
                    'address' => $photo->address,
                ],
            ]);
        } catch (Exception $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * View gallery photos for Super Admin & Company Admin.
     */
    public function gallery(Request $request)
    {
        $user = $request->user();
        $date = $request->query('date');
        $taskId = $request->query('task_id') ? (int) $request->query('task_id') : null;

        // Role scoping
        $companyId = ($user->role === 'super_admin' || empty($user->company_id))
            ? ($request->query('company_id') ? (int) $request->query('company_id') : null)
            : (int) $user->company_id;

        $data = $this->photoService->getGalleryData($date, $companyId, $taskId);
        return response()->json($data);
    }

    /**
     * Stream compressed photo binary with multi-path fallback and resilient caching.
     */
    public function image(PlantPhoto $photo)
    {
        $possiblePaths = [
            storage_path('app/private/' . $photo->photo_path),
            storage_path('app/' . $photo->photo_path),
            storage_path('app/public/' . $photo->photo_path),
            public_path('storage/' . $photo->photo_path),
            public_path($photo->photo_path),
        ];

        $fullPath = null;
        foreach ($possiblePaths as $p) {
            if ($p && file_exists($p)) {
                $fullPath = $p;
                break;
            }
        }

        if (! $fullPath) {
            // Return an inline SVG placeholder so client image doesn't break with a hard 404
            $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="#f1f5f9" width="400" height="300"/><text fill="#94a3b8" font-family="sans-serif" font-size="13" font-weight="bold" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">📸 Photo Syncing or Archived</text></svg>';
            return response($svg, 200, [
                'Content-Type' => 'image/svg+xml',
                'Cache-Control' => 'no-cache',
            ]);
        }

        $mime = @mime_content_type($fullPath) ?: 'image/jpeg';

        return Response::file($fullPath, [
            'Content-Type' => $mime,
            'Cache-Control' => 'public, max-age=604800, immutable',
            'ETag' => md5_file($fullPath),
        ]);
    }

    /**
     * Delete a single plant photo (Super Admin or Company Admin or the uploader).
     */
    public function deletePhoto(PlantPhoto $photo, Request $request)
    {
        $user = $request->user();

        // Check permission
        if ($user->role !== 'super_admin' && $user->role !== 'company_admin' && $user->id !== $photo->employee?->user_id) {
            abort(403, 'You do not have permission to delete this inspection photo.');
        }

        $photoId = $photo->id;
        $taskTitle = $photo->task?->title ?: 'Plant Photo';

        $this->photoService->deletePhoto($photo);

        $this->activity->log(
            $user,
            $photo->company_id,
            'deleted',
            'plant_photo',
            $photoId,
            "Deleted inspection photo for '{$taskTitle}'"
        );

        return response()->json([
            'success' => true,
            'message' => 'Plant photo deleted successfully.',
        ]);
    }
}
