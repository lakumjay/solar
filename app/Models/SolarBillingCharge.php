<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SolarBillingCharge extends Model
{
    use HasFactory;

    protected $table = 'solar_billing_charges';

    protected $fillable = [
        'name',
        'code',
        'type',
        'calc_basis',
        'value',
        'company_id',
        'effective_from',
        'effective_to',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'value' => 'decimal:4',
        'is_active' => 'boolean',
        'effective_from' => 'date:Y-m-d',
        'effective_to' => 'date:Y-m-d',
        'sort_order' => 'integer',
    ];

    public function company()
    {
        return $this->belongsTo(SolarBillingCompany::class, 'company_id');
    }
}
