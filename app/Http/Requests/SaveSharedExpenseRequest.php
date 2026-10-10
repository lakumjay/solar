<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveSharedExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'super_admin';
    }

    public function rules(): array
    {
        return [
            'expense_date' => ['required', 'date', 'before_or_equal:today'],
            'payer_company_id' => [
                'required',
                'integer',
                Rule::exists('companies', 'id')->where('active', true),
            ],
            'purchaser_name' => ['required', 'string', 'max:150'],
            'description' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'min:0.01', 'max:9999999999999.99'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'receipt' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'],
            'remove_receipt' => ['nullable', 'boolean'],
            'allocation_scope' => ['nullable', 'string', 'in:all,two,single'],
            'beneficiary_company_ids' => ['nullable', 'array'],
            'beneficiary_company_ids.*' => ['integer', Rule::exists('companies', 'id')->where('active', true)],
            'payers' => ['nullable', 'array'],
            'payers.*.company_id' => ['required_with:payers', 'integer', Rule::exists('companies', 'id')->where('active', true)],
            'payers.*.amount_paid' => ['required_with:payers', 'numeric', 'min:0'],
        ];
    }
}
