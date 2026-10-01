<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SaveExpenseSettlementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'super_admin';
    }

    public function rules(): array
    {
        return [
            'settled_on' => ['required', 'date', 'before_or_equal:today'],
            'from_company_id' => ['required', 'integer', 'exists:companies,id', 'different:to_company_id'],
            'to_company_id' => ['required', 'integer', 'exists:companies,id'],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'min:0.01', 'max:9999999999999.99'],
            'settlement_type' => ['nullable', 'string', 'in:full,partial'],
            'payment_mode' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }
}

