<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SolarBillingCompany extends Model
{
    protected $guarded = [];

    protected $casts = [
        'active' => 'boolean',
        'discount' => 'decimal:2',
        'last_seq' => 'integer',
        'due_days' => 'integer',
        'interest_pct' => 'decimal:2',
        'loss_pct' => 'decimal:2',
        'wheel_rate' => 'decimal:4',
        'bank_rate' => 'decimal:4',
        'cross_pct' => 'decimal:2',
    ];

    public function bills()
    {
        return $this->hasMany(SolarBill::class, 'company_id');
    }
}
