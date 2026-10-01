<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveStockBorrowingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('issue_stock');
    }

    public function rules(): array
    {
        return [
            'stock_item_id' => ['required', 'integer', 'exists:stock_items,id'],
            'borrower_name' => ['required', 'string', 'max:150'],
            'borrower_mobile' => ['nullable', 'string', 'max:30'],
            'quantity' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
            'borrowed_on' => ['required', 'date'],
            'expected_return_date' => ['nullable', 'date', 'after_or_equal:borrowed_on'],
            'given_by_user_id' => [
                'required', 'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query->where('active', true)->whereIn('role', ['super_admin', 'company_admin', 'manager', 'employee'])),
            ],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
