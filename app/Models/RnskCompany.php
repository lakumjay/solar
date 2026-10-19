<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RnskCompany extends Model
{
    use HasFactory;

    protected $table = 'rnsk_companies';

    protected $fillable = [
        'name',
        'expense_percentage',
        'active',
        'display_order',
    ];

    protected $casts = [
        'expense_percentage' => 'float',
        'active' => 'boolean',
        'display_order' => 'integer',
    ];

    public function expenses(): HasMany
    {
        return $this->hasMany(RnskExpense::class, 'payer_company_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(RnskExpenseAllocation::class, 'rnsk_company_id');
    }

    public function outgoingSettlements(): HasMany
    {
        return $this->hasMany(RnskExpenseSettlement::class, 'from_company_id');
    }

    public function incomingSettlements(): HasMany
    {
        return $this->hasMany(RnskExpenseSettlement::class, 'to_company_id');
    }
}
