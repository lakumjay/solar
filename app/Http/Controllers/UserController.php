<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveUserRequest;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\SolarAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly ActivityLogger $activity,
    ) {}

    public function index(Request $request)
    {
        $this->access->requireUserManagement($request);
        $query = User::with('company:id,name')->where('role', '!=', 'employee')->orderBy('name');
        if ($request->user()->role !== 'super_admin') {
            $query->where('company_id', $request->user()->company_id)->where('role', '!=', 'super_admin');
        }

        return $query->get(['id', 'company_id', 'name', 'email', 'role', 'permissions', 'active', 'created_at'])
            ->each(fn (User $user) => $user->setAttribute('permissions', $this->access->effectivePermissions($user)));
    }

    public function store(SaveUserRequest $request)
    {
        $this->access->requireUserManagement($request);
        $data = $request->validated();

        if ($request->user()->role !== 'super_admin') {
            abort_if(($data['id'] ?? null) == $request->user()->id, 422, 'You cannot edit your own access.');
            if (! empty($data['id'])) {
                abort_unless(
                    User::whereKey($data['id'])
                        ->where('company_id', $request->user()->company_id)
                        ->where('role', '!=', 'super_admin')
                        ->exists(),
                    403,
                );
            }
            $data['company_id'] = $request->user()->company_id;
            abort_if($data['role'] === 'super_admin', 403);
        }

        if ($data['role'] === 'super_admin') {
            $data['company_id'] = null;
        } else {
            abort_if(empty($data['company_id']), 422, 'Company is required for company users.');
        }

        if (! empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }

        $user = User::updateOrCreate(['id' => $data['id'] ?? null], $data);
        $this->activity->log($request->user(), $user->company_id, $user->wasRecentlyCreated ? 'created' : 'updated', 'user', $user->id, "User {$user->name} saved", collect($data)->except('password')->all());

        return $user->only('id', 'company_id', 'name', 'email', 'role', 'permissions', 'active');
    }
}
