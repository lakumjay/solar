<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceRecord extends Model
{
    protected $hidden = ['selfie_path'];

    protected $fillable = [
        'employee_id', 'attendance_date', 'clock_in_at', 'clock_in_latitude', 'clock_in_longitude', 'clock_in_accuracy',
        'selfie_path', 'entry_source', 'recorded_by', 'entry_reason', 'clock_out_at', 'clock_out_latitude', 'clock_out_longitude', 'clock_out_accuracy', 'work_done',
        'learned', 'status', 'work_minutes', 'break_minutes', 'is_late', 'is_early_out', 'overtime_minutes', 'manual_correction',
        'correction_reason', 'corrected_by', 'corrected_at',
    ];

    protected function casts(): array
    {
        return [
            'attendance_date' => 'date:Y-m-d', 'clock_in_at' => 'datetime', 'clock_out_at' => 'datetime',
            'corrected_at' => 'datetime', 'is_late' => 'boolean', 'is_early_out' => 'boolean', 'manual_correction' => 'boolean',
            'clock_in_latitude' => 'decimal:7', 'clock_in_longitude' => 'decimal:7', 'clock_in_accuracy' => 'decimal:2',
            'clock_out_latitude' => 'decimal:7', 'clock_out_longitude' => 'decimal:7', 'clock_out_accuracy' => 'decimal:2',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function correctedBy()
    {
        return $this->belongsTo(User::class, 'corrected_by');
    }

    public function recordedBy()
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function adjustments()
    {
        return $this->hasMany(AttendanceAdjustment::class);
    }

    public function breaks()
    {
        return $this->hasMany(AttendanceBreak::class)->orderBy('started_at');
    }
}
