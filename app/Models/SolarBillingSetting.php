<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SolarBillingSetting extends Model
{
    protected $guarded = [];

    public static function getMap(): array
    {
        return static::pluck('value', 'key')->toArray();
    }

    public static function getVal(string $key, $default = null)
    {
        $rec = static::where('key', $key)->first();
        return $rec ? $rec->value : $default;
    }

    public static function setVal(string $key, $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => (string) $value]);
    }
}
