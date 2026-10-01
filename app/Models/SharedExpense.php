<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SharedExpense extends Model
{
    protected $guarded = [];

    protected $casts = [
        'expense_date' => 'date',
        'amount' => 'decimal:2',
        'locked_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function payerCompany()
    {
        return $this->belongsTo(Company::class, 'payer_company_id');
    }

    public function allocations()
    {
        return $this->hasMany(SharedExpenseAllocation::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function reversesExpense()
    {
        return $this->belongsTo(self::class, 'reverses_expense_id');
    }
}
