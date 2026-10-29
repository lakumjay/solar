<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SolarBillingCompany extends Model
{
    protected $fillable = [
        'name',
        'gstin',
        'address',
        'phones',
        'bank_name',
        'bank_ac',
        'bank_ifsc',
        'discount',
        'inv_prefix',
        'last_seq',
        'logo_path',
        'signature_path',
        'signature_enabled',
        'letterhead_path',
        'letterhead_mode',
        'due_days',
        'interest_pct',
        'loss_pct',
        'wheel_rate',
        'bank_rate',
        'cross_pct',
        'active',
    ];

    protected $casts = [
        'active' => 'boolean',
        'signature_enabled' => 'boolean',
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
