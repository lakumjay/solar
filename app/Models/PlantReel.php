<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlantReel extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'employee_id',
        'company_id',
        'title',
        'caption',
        'video_path',
        'thumbnail_path',
        'template_name',
        'music_title',
        'duration_seconds',
        'likes_count',
        'views_count',
    ];

    protected $casts = [
        'duration_seconds' => 'integer',
        'likes_count' => 'integer',
        'views_count' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
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
