<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReturnStockRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('return_stock');
    }

    public function rules(): array
    {
        return [
            'quantity' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
            'returned_on' => ['required', 'date'],
            'received_by_user_id' => [
                'required', 'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query->where('active', true)->whereIn('role', ['super_admin', 'company_admin', 'manager', 'employee'])),
            ],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
