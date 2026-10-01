<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Company extends Model
{
    protected $guarded = [];

    protected $casts = [
        'active' => 'boolean',
        'is_ss_reference' => 'boolean',
        'plant_import_multiplier' => 'decimal:2',
        'plant_export_multiplier' => 'decimal:2',
        'sub_import_multiplier' => 'decimal:2',
        'sub_export_multiplier' => 'decimal:2',
        'expense_percentage' => 'decimal:2',
    ];

    public function inverters()
    {
        return $this->hasMany(Inverter::class);
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function primaryAdmin()
    {
        return $this->hasOne(User::class)
            ->where('role', 'company_admin')
            ->orderBy('id');
    }
}
