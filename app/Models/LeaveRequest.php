<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeaveRequest extends Model
{
    protected $fillable = [
        'employee_id', 'leave_type_id', 'date_from', 'date_to', 'day_part', 'reason', 'attachment_path',
        'status', 'reviewed_by', 'reviewed_at', 'review_remarks',
    ];

    protected function casts(): array
    {
        return ['date_from' => 'date:Y-m-d', 'date_to' => 'date:Y-m-d', 'reviewed_at' => 'datetime'];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function leaveType()
    {
        return $this->belongsTo(LeaveType::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
