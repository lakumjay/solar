<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DailyReading extends Model
{
    protected $guarded = [];

    protected $casts = [
        'reading_date' => 'date',
        'plant_import_reading' => 'decimal:2',
        'plant_import_unit' => 'decimal:2',
        'plant_export_reading' => 'decimal:2',
        'plant_export_unit' => 'decimal:2',
        'sub_import_reading' => 'decimal:2',
        'sub_import_unit' => 'decimal:2',
        'sub_export_reading' => 'decimal:2',
        'sub_export_unit' => 'decimal:2',
    ];

    public function outputs()
    {
        return $this->hasMany(DailyInverterOutput::class);
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function editor()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
