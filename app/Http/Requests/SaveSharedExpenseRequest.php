<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveSharedExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }

        return $user->role === 'super_admin'
            || $user->hasPermission('view_expenses')
            || in_array($user->role, ['company_admin', 'manager'], true);
    }

    public function rules(): array
    {
        return [
            'expense_date' => ['required', 'date', 'before_or_equal:today'],
            'payer_company_id' => [
                'nullable',
                'integer',
                Rule::exists('companies', 'id')->where('active', true),
            ],
            'allocation_scope' => ['nullable', 'string', 'in:all,two,single,custom'],
            'beneficiary_company_ids' => ['nullable', 'array'],
            'beneficiary_company_ids.*' => ['integer', Rule::exists('companies', 'id')->where('active', true)],
            'payers' => ['nullable', 'array'],
            'payers.*.company_id' => ['required_with:payers', 'integer', Rule::exists('companies', 'id')->where('active', true)],
            'payers.*.amount_paid' => ['required_with:payers', 'numeric', 'min:0'],
            'custom_allocations' => ['nullable', 'array'],
            'custom_allocations.*.company_id' => ['required_with:custom_allocations', 'integer', Rule::exists('companies', 'id')->where('active', true)],
            'custom_allocations.*.percentage' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'custom_allocations.*.share_amount' => ['nullable', 'numeric', 'min:0'],
            'purchaser_name' => ['required', 'string', 'max:150'],
            'description' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'min:0.01', 'max:9999999999999.99'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'receipt' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'],
            'remove_receipt' => ['nullable', 'boolean'],
        ];
    }
}

