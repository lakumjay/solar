<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Holiday extends Model
{
    protected $fillable = ['name', 'holiday_date', 'type', 'active', 'created_by'];

    protected function casts(): array
    {
        return ['holiday_date' => 'date:Y-m-d', 'active' => 'boolean'];
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
