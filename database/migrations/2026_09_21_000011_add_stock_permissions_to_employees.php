<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $stockPermissions = ['view_stock', 'manage_stock', 'issue_stock', 'return_stock'];

        DB::table('users')->where('role', 'employee')->get(['id', 'permissions'])->each(function ($user) use ($stockPermissions) {
            $permissions = $user->permissions
                ? json_decode($user->permissions, true)
                : ['clock_attendance', 'enter_readings'];

            DB::table('users')->where('id', $user->id)->update([
                'permissions' => json_encode(array_values(array_unique([...($permissions ?: []), ...$stockPermissions]))),
            ]);
        });
    }

    public function down(): void
    {
        $stockPermissions = ['view_stock', 'manage_stock', 'issue_stock', 'return_stock'];

        DB::table('users')->where('role', 'employee')->whereNotNull('permissions')->get(['id', 'permissions'])->each(function ($user) use ($stockPermissions) {
            $permissions = json_decode($user->permissions, true) ?: [];

            DB::table('users')->where('id', $user->id)->update([
                'permissions' => json_encode(array_values(array_diff($permissions, $stockPermissions))),
            ]);
        });
    }
};
