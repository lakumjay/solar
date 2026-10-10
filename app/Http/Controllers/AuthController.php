<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Models\User;
use App\Services\SolarAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly \App\Services\ActivityLogger $activity
    ) {}

    public function login(LoginRequest $request)
    {
        $credentials = $request->validated();
        $user = User::with('company:id,active')->where('email', $credentials['email'])->first();
        $companyInactive = $user?->company_id && ! $user->company?->active;

        if (! $user || ! $user->active || $companyInactive || ! Auth::attempt($credentials)) {
            return response()->json(['message' => 'Invalid email or password.'], 422);
        }

        $request->session()->regenerate();

        $deviceInfo = \App\Services\ActivityLogger::parseUserAgent($request->userAgent());
        $this->activity->log(
            $user,
            $user->company_id,
            'login',
            'User',
            $user->id,
            "{$user->name} logged in from {$deviceInfo['device']} ({$deviceInfo['platform']})",
            ['event' => 'login', 'device' => $deviceInfo['device'], 'ip' => $request->ip()]
        );

        return $this->me($request);
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user) {
            $deviceInfo = \App\Services\ActivityLogger::parseUserAgent($request->userAgent());
            $this->activity->log(
                $user,
                $user->company_id,
                'logout',
                'User',
                $user->id,
                "{$user->name} logged out from {$deviceInfo['device']}",
                ['event' => 'logout']
            );
        }

        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function me(Request $request)
    {
        $user = $request->user();

        $user?->load('employee:id,user_id,employee_code,designation,department,active');

        return response()->json($user ? [
            ...$user->only('id', 'name', 'email', 'company_id', 'role'),
            'employee' => $user->employee,
            'permissions' => $this->access->effectivePermissions($user),
            'csrf_token' => csrf_token(),
        ] : null);
    }
}
