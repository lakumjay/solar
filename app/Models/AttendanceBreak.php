<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceBreak extends Model
{
    protected $fillable = ['attendance_record_id', 'started_at', 'ended_at', 'return_selfie_path', 'duration_minutes'];

    protected $hidden = ['return_selfie_path'];

    protected $appends = ['return_selfie_url'];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'ended_at' => 'datetime'];
    }

    public function attendanceRecord()
    {
        return $this->belongsTo(AttendanceRecord::class);
    }

    public function getReturnSelfieUrlAttribute(): ?string
    {
        return $this->return_selfie_path ? "/api/attendance/breaks/{$this->id}/selfie" : null;
    }
}
