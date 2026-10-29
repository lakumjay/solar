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
    ];

    public function bills()
    {
        return $this->hasMany(SolarBill::class, 'company_id');
    }
}
