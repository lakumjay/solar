<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;

class ISolarCloudToken extends Model
{
    protected $table = 'isolarcloud_tokens';

    protected $guarded = [];

    protected $casts = [
        'expires_at' => 'datetime',
        'auth_ps_list' => 'array',
        'raw_response' => 'array',
    ];

    public function isExpired(): bool
    {
        if (! $this->expires_at) {
            return false;
        }

        // Buffer by 5 minutes before actual expiry
        return Carbon::now()->addMinutes(5)->gte($this->expires_at);
    }
}
