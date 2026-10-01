<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Inverter extends Model
{
    protected $guarded = [];

    protected $casts = ['active' => 'boolean'];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }
}
