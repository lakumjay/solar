<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockReturn extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['quantity' => 'decimal:2', 'returned_on' => 'date:Y-m-d'];
    }

    public function borrowing()
    {
        return $this->belongsTo(StockBorrowing::class, 'stock_borrowing_id');
    }

    public function receivedBy()
    {
        return $this->belongsTo(User::class, 'received_by_user_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
