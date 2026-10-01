<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    protected $fillable = [
        'user_id', 'employee_code', 'mobile', 'designation', 'department', 'joining_date', 'active',
        'manager_attendance_only', 'shift_start', 'shift_end', 'working_minutes', 'half_day_minutes', 'grace_minutes', 'weekly_offs', 'profile_photo_path',
    ];

    protected function casts(): array
    {
        return ['joining_date' => 'date:Y-m-d', 'active' => 'boolean', 'manager_attendance_only' => 'boolean', 'weekly_offs' => 'array'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function attendanceRecords()
    {
        return $this->hasMany(AttendanceRecord::class);
    }

    public function leaveRequests()
    {
        return $this->hasMany(LeaveRequest::class);
    }

    public function salaryRates()
    {
        return $this->hasMany(EmployeeSalaryRate::class)->orderByDesc('effective_month');
    }

    public function salaryAdjustments()
    {
        return $this->hasMany(SalaryAdjustment::class);
    }
}
