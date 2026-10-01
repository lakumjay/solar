<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockItem extends Model
{
    protected $fillable = [
        'name', 'image_path', 'unit_price', 'total_quantity', 'low_stock_threshold', 'notes', 'active', 'created_by', 'updated_by',
    ];

    protected $hidden = ['image_path'];

    protected $appends = ['image_url'];

    protected function casts(): array
    {
        return [
            'unit_price' => 'decimal:2',
            'total_quantity' => 'decimal:2',
            'low_stock_threshold' => 'decimal:2',
            'active' => 'boolean',
        ];
    }

    public function movements()
    {
        return $this->hasMany(StockMovement::class);
    }

    public function borrowings()
    {
        return $this->hasMany(StockBorrowing::class);
    }

    public function getImageUrlAttribute(): string
    {
        return "/api/stock/items/{$this->id}/image?v=".($this->updated_at?->timestamp ?? 0);
    }
}
