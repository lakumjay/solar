<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlantPhotoTask extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'start_time',
        'end_time',
        'required_photos',
        'description',
        'company_id',
        'active',
        'sort_order',
    ];

    protected $casts = [
        'required_photos' => 'integer',
        'active' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function photos(): HasMany
    {
        return $this->hasMany(PlantPhoto::class, 'task_id');
    }
}
