<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceBreak extends Model
{
    protected $fillable = [
        'attendance_record_id',
        'break_type',
        'out_reason',
        'out_selfie_path',
        'started_at',
        'ended_at',
        'return_selfie_path',
        'duration_minutes',
        'deduction_amount',
        'is_deducted',
        'admin_waived',
        'waive_reason',
    ];

    protected $hidden = ['return_selfie_path', 'out_selfie_path'];

    protected $appends = ['return_selfie_url', 'out_selfie_url'];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'is_deducted' => 'boolean',
            'admin_waived' => 'boolean',
            'deduction_amount' => 'decimal:2',
        ];
    }

    public function attendanceRecord()
    {
        return $this->belongsTo(AttendanceRecord::class);
    }

    public function getReturnSelfieUrlAttribute(): ?string
    {
        return $this->return_selfie_path ? "/api/attendance/breaks/{$this->id}/selfie" : null;
    }

    public function getOutSelfieUrlAttribute(): ?string
    {
        return $this->out_selfie_path ? "/api/attendance/breaks/{$this->id}/out-selfie" : null;
    }
}
