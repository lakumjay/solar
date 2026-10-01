<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AddStockRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('manage_stock');
    }

    public function rules(): array
    {
        return [
            'quantity' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
            'unit_price' => ['nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999999.99'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
