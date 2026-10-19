<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RnskExpense extends Model
{
    use HasFactory;

    protected $table = 'rnsk_expenses';

    protected $fillable = [
        'expense_date',
        'payer_company_id',
        'purchaser_name',
        'description',
        'amount',
        'notes',
        'receipt_path',
        'entry_type',
        'status',
        'reverses_expense_id',
        'locked_at',
        'cancelled_at',
        'cancelled_by',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'expense_date' => 'date',
        'amount' => 'float',
        'locked_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function payerCompany(): BelongsTo
    {
        return $this->belongsTo(RnskCompany::class, 'payer_company_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(RnskExpenseAllocation::class, 'rnsk_expense_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function reversedExpense(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reverses_expense_id');
    }
}
