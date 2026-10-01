<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SharedExpenseAllocation extends Model
{
    protected $guarded = [];

    protected $casts = [
        'percentage' => 'decimal:2',
        'share_amount' => 'decimal:2',
        'amount_paid' => 'decimal:2',
    ];

    public function expense()
    {
        return $this->belongsTo(SharedExpense::class, 'shared_expense_id');
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }
}
