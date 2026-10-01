<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Request;

class SolarAccessService
{
    public const PERMISSIONS = [
        'view_dashboard',
        'enter_readings',
        'edit_readings',
        'view_reports',
        'manage_company_users',
    ];

    public function requirePermission(Request $request, string $permission): void
    {
        abort_unless($request->user()?->hasPermission($permission), 403);
    }

    public function requireUserManagement(Request $request): void
    {
        abort_unless($request->user()?->role === 'super_admin' || $request->user()?->hasPermission('manage_company_users'), 403);
    }

    public function requireSuperAdmin(Request $request): void
    {
        abort_unless($request->user()?->role === 'super_admin', 403);
    }

    public function requestedCompany(Request $request, bool $allowCombined = false): ?int
    {
        if ($request->user()->role !== 'super_admin') {
            return (int) $request->user()->company_id;
        }

        if ($allowCombined && (! $request->filled('company_id') || $request->string('company_id')->toString() === 'all')) {
            return null;
        }

        abort_unless($request->filled('company_id'), 422, 'Company is required.');

        return (int) $request->input('company_id');
    }

    public function requireCompany(Request $request, int $companyId): void
    {
        abort_unless($request->user()->role === 'super_admin' || (int) $request->user()->company_id === $companyId, 403);
    }

    public function effectivePermissions(User $user): array
    {
        return array_values(array_filter(self::PERMISSIONS, fn (string $permission) => $user->hasPermission($permission)));
    }
}
