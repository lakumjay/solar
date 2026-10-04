<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name', 'email', 'password', 'company_id', 'role', 'permissions', 'active',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'permissions' => 'array',
            'active' => 'boolean',
        ];
    }

    public function hasPermission(string $permission): bool
    {
        if ($this->role === 'super_admin' || $permission === 'view_dashboard') {
            return true;
        }
        $defaults = [
            'company_admin' => ['view_dashboard', 'enter_readings', 'edit_readings', 'view_reports', 'manage_company_users', 'view_employees', 'manage_employees', 'view_attendance', 'approve_leaves', 'manage_attendance_settings', 'view_attendance_reports', 'record_employee_attendance', 'view_stock', 'manage_stock', 'issue_stock', 'return_stock', 'view_expenses'],
            'manager' => ['view_dashboard', 'view_employees', 'view_attendance', 'approve_leaves', 'view_attendance_reports', 'record_employee_attendance', 'view_stock', 'manage_stock', 'issue_stock', 'return_stock', 'view_expenses'],
            'employee' => ['view_dashboard', 'clock_attendance', 'enter_readings', 'edit_readings', 'view_reports', 'view_stock', 'manage_stock', 'issue_stock', 'return_stock'],
            'data_entry' => ['view_dashboard', 'enter_readings', 'edit_readings', 'view_reports', 'view_expenses'],
            'viewer' => ['view_dashboard', 'view_reports', 'view_expenses'],
        ];

        return in_array($permission, $this->permissions ?? ($defaults[$this->role] ?? []), true);
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function employee()
    {
        return $this->hasOne(Employee::class);
    }
}
