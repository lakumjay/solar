<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RnskExpenseSettlement extends Model
{
    use HasFactory;

    protected $table = 'rnsk_expense_settlements';

    protected $fillable = [
        'settled_on',
        'settled_at',
        'from_company_id',
        'to_company_id',
        'amount',
        'settlement_type',
        'remaining_balance',
        'payment_mode',
        'payment_reference',
        'receipt_path',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'settled_on' => 'date',
        'settled_at' => 'datetime',
        'amount' => 'float',
        'remaining_balance' => 'float',
    ];

    public function fromCompany(): BelongsTo
    {
        return $this->belongsTo(RnskCompany::class, 'from_company_id');
    }

    public function toCompany(): BelongsTo
    {
        return $this->belongsTo(RnskCompany::class, 'to_company_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
