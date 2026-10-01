<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SalaryAdjustment extends Model
{
    protected $fillable = [
        'employee_id', 'salary_month', 'work_date', 'type', 'amount', 'reason',
        'company_id', 'add_to_shared_expenses', 'shared_expense_id',
        'created_by', 'cancelled_at', 'cancelled_by', 'cancellation_reason', 'replaces_adjustment_id',
    ];

    protected function casts(): array
    {
        return [
            'salary_month' => 'date:Y-m-d',
            'work_date' => 'date:Y-m-d',
            'amount' => 'decimal:2',
            'add_to_shared_expenses' => 'boolean',
            'cancelled_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function sharedExpense()
    {
        return $this->belongsTo(SharedExpense::class);
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

