<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlantPhoto extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'employee_id',
        'company_id',
        'photo_path',
        'captured_at',
        'latitude',
        'longitude',
        'address',
        'notes',
    ];

    protected $casts = [
        'captured_at' => 'datetime',
        'latitude' => 'float',
        'longitude' => 'float',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(PlantPhotoTask::class, 'task_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
