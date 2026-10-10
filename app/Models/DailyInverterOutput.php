<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DailyInverterOutput extends Model
{
    protected $guarded = [];

    protected $casts = ['generation' => 'decimal:2'];

    public function dailyReading()
    {
        return $this->belongsTo(DailyReading::class);
    }
}
