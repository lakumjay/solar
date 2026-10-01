<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeaveType extends Model
{
    protected $fillable = ['name', 'paid', 'active'];

    protected function casts(): array
    {
        return ['paid' => 'boolean', 'active' => 'boolean'];
    }

    public function leaveRequests()
    {
        return $this->hasMany(LeaveRequest::class);
    }
}
