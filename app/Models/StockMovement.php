<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['quantity' => 'decimal:2', 'unit_price' => 'decimal:2'];
    }

    public function item()
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
