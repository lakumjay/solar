<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SolarCurtailment extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'user_id',
        'percentage',
        'status',
        'inverter_ids',
        'pv_strings',
        'step_history',
        'started_at',
        'ended_at',
        'duration_minutes',
        'total_lost_kwh',
        'total_lost_revenue_rs',
        'notes',
    ];

    protected $casts = [
        'inverter_ids' => 'array',
        'pv_strings' => 'array',
        'step_history' => 'array',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
        'percentage' => 'integer',
        'duration_minutes' => 'integer',
        'total_lost_kwh' => 'decimal:2',
        'total_lost_revenue_rs' => 'decimal:2',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
