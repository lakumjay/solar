<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceAdjustment extends Model
{
    public $timestamps = false;

    protected $fillable = ['attendance_record_id', 'user_id', 'old_values', 'new_values', 'reason', 'created_at'];

    protected function casts(): array
    {
        return ['old_values' => 'array', 'new_values' => 'array', 'created_at' => 'datetime'];
    }

    public function attendanceRecord()
    {
        return $this->belongsTo(AttendanceRecord::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
