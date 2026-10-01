<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockBorrowing extends Model
{
    protected $guarded = [];

    protected $appends = ['pending_quantity'];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:2',
            'returned_quantity' => 'decimal:2',
            'borrowed_on' => 'date:Y-m-d',
            'expected_return_date' => 'date:Y-m-d',
        ];
    }

    public function item()
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }

    public function givenBy()
    {
        return $this->belongsTo(User::class, 'given_by_user_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function returns()
    {
        return $this->hasMany(StockReturn::class);
    }

    public function getPendingQuantityAttribute(): float
    {
        return round(max(0, (float) $this->quantity - (float) $this->returned_quantity), 2);
    }
}
