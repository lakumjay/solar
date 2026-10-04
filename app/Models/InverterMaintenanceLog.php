<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InverterMaintenanceLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'inverter_id',
        'user_id',
        'maintenance_type',
        'cleaned_at',
        'next_due_date',
        'performed_by_name',
        'notes',
    ];

    protected $casts = [
        'cleaned_at' => 'datetime',
        'next_due_date' => 'date',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function inverter(): BelongsTo
    {
        return $this->belongsTo(Inverter::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
