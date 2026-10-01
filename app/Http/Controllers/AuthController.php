<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Models\User;
use App\Services\SolarAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function __construct(private readonly SolarAccessService $access) {}

    public function login(LoginRequest $request)
    {
        $credentials = $request->validated();
        $user = User::with('company:id,active')->where('email', $credentials['email'])->first();
        $companyInactive = $user?->company_id && ! $user->company?->active;

        if (! $user || ! $user->active || $companyInactive || ! Auth::attempt($credentials)) {
            return response()->json(['message' => 'Invalid email or password.'], 422);
        }

        $request->session()->regenerate();

        return $this->me($request);
    }

    public function logout(Request $request)
    {
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
