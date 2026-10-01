<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveStockItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('manage_stock');
    }

    public function rules(): array
    {
        $itemId = $this->integer('id') ?: null;

        return [
            'id' => ['nullable', 'integer', 'exists:stock_items,id'],
            'name' => ['required', 'string', 'max:150', Rule::unique('stock_items')->ignore($itemId)],
            'image' => [$itemId ? 'nullable' : 'required', 'image', 'mimes:jpeg,png,webp', 'max:5120'],
            'unit_price' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999999.99'],
            'opening_quantity' => [$itemId ? 'nullable' : 'required', 'nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999999.99'],
            'low_stock_threshold' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999999.99'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'active' => ['required', 'boolean'],
        ];
    }
}
