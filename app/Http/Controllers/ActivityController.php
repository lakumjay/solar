<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\SolarAccessService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ActivityController extends Controller
{
    public function __construct(private readonly SolarAccessService $access) {}

    public function index(Request $request)
    {
        $this->access->requireUserManagement($request);

        $query = ActivityLog::with([
            'user:id,name,email,role,company_id',
            'company:id,name'
        ])->latest();

        if ($request->user()->role !== 'super_admin') {
            $query->where('company_id', $request->user()->company_id);
        } elseif ($request->filled('company_id') && $request->get('company_id') !== 'all') {
            $query->where('company_id', $request->integer('company_id'));
        }

        if ($request->filled('user_id') && $request->get('user_id') !== 'all') {
            $query->where('user_id', $request->integer('user_id'));
        }

        if ($request->filled('action') && $request->get('action') !== 'all') {
            $query->where('action', $request->string('action'));
        }

        if ($request->filled('start_date')) {
            $query->whereDate('created_at', '>=', $request->string('start_date'));
        }

        if ($request->filled('end_date')) {
            $query->whereDate('created_at', '<=', $request->string('end_date'));
        }

        if ($request->filled('search')) {
            $term = '%' . $request->string('search') . '%';
            $query->where(function ($q) use ($term) {
                $q->where('description', 'like', $term)
                  ->orWhere('ip_address', 'like', $term)
                  ->orWhere('device', 'like', $term)
                  ->orWhere('browser', 'like', $term)
                  ->orWhereHas('user', fn($u) => $u->where('name', 'like', $term)->orWhere('email', 'like', $term));
            });
        }

        $perPage = min(100, max(5, $request->integer('per_page', 15)));

        return $query->paginate($perPage);
    }

    public function activeSessions(Request $request)
    {
        $this->access->requireUserManagement($request);

        // Fetch sessions with a user_id from the last 7 days
        $cutoff = Carbon::now()->subDays(7)->getTimestamp();
        $currentSessionId = $request->hasSession() ? $request->session()->getId() : null;

        $sessionsQuery = DB::table('sessions')
            ->whereNotNull('user_id')
            ->where('last_activity', '>=', $cutoff)
            ->orderBy('last_activity', 'desc');

        if ($request->user()->role !== 'super_admin') {
            $sessionsQuery->where('user_id', $request->user()->id);
        }

        $sessions = $sessionsQuery->get();
        $userIds = $sessions->pluck('user_id')->unique()->filter();
        $users = User::with('company:id,name')->whereIn('id', $userIds)->get()->keyBy('id');

        $result = $sessions->map(function ($s) use ($users, $currentSessionId) {
            $user = $users->get($s->user_id);
            $parsed = ActivityLogger::parseUserAgent($s->user_agent);
            $lastActive = Carbon::createFromTimestamp($s->last_activity);

            return [
                'id' => $s->id,
                'user_id' => $s->user_id,
                'user_name' => $user?->name ?? 'Unknown User',
                'user_email' => $user?->email ?? '',
                'user_role' => $user?->role ?? 'user',
                'company_name' => $user?->company?->name ?? 'Global',
                'ip_address' => $s->ip_address ?: '127.0.0.1',
                'device' => $parsed['device'] ?? 'Unknown Device',
                'platform' => $parsed['platform'] ?? 'Unknown OS',
                'browser' => $parsed['browser'] ?? 'Unknown Browser',
                'device_type' => $parsed['type'] ?? 'desktop',
                'last_active_at' => $lastActive->toIso8601String(),
                'last_active_human' => $lastActive->diffForHumans(),
                'is_current' => $s->id === $currentSessionId,
            ];
        });

        return response()->json([
            'sessions' => $result,
            'total' => $result->count(),
        ]);
    }

    public function revokeSession(Request $request)
    {
        $this->access->requireUserManagement($request);

        $sessionId = $request->input('session_id');
        if (! $sessionId) {
            return response()->json(['message' => 'Session ID required.'], 422);
        }

        $currentSessionId = $request->hasSession() ? $request->session()->getId() : null;
        if ($currentSessionId && $sessionId === $currentSessionId) {
            return response()->json(['message' => 'Cannot revoke current active session.'], 422);
        }

        $session = DB::table('sessions')->where('id', $sessionId)->first();
        if ($session) {
            DB::table('sessions')->where('id', $sessionId)->delete();
        }

        return response()->json(['message' => 'Session successfully revoked.']);
    }
}
