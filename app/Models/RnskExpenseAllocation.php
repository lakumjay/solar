<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RnskExpenseAllocation extends Model
{
    use HasFactory;

    protected $table = 'rnsk_expense_allocations';

    protected $fillable = [
        'rnsk_expense_id',
        'rnsk_company_id',
        'percentage',
        'share_amount',
        'amount_paid',
    ];

    protected $casts = [
        'percentage' => 'float',
        'share_amount' => 'float',
        'amount_paid' => 'float',
    ];

    public function expense(): BelongsTo
    {
        return $this->belongsTo(RnskExpense::class, 'rnsk_expense_id');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(RnskCompany::class, 'rnsk_company_id');
    }
}
