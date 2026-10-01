<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SalaryAdjustment extends Model
{
    protected $fillable = [
        'employee_id', 'salary_month', 'type', 'amount', 'reason', 'created_by',
        'cancelled_at', 'cancelled_by', 'cancellation_reason', 'replaces_adjustment_id',
    ];

    protected function casts(): array
    {
        return [
            'salary_month' => 'date:Y-m-d',
            'amount' => 'decimal:2',
            'cancelled_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function canceller()
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function replacedAdjustment()
    {
        return $this->belongsTo(self::class, 'replaces_adjustment_id');
    }
}
