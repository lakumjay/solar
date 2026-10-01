<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PushSubscription extends Model
{
    protected $fillable = [
        'user_id',
        'endpoint',
        'public_key',
        'auth_token',
        'content_encoding',
        'notify_readings',
        'notify_attendance',
        'notify_expenses',
        'notify_salaries',
    ];

    protected $casts = [
        'notify_readings' => 'boolean',
        'notify_attendance' => 'boolean',
        'notify_expenses' => 'boolean',
        'notify_salaries' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
