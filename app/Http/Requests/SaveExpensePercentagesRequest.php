<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SaveExpensePercentagesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'super_admin';
    }

    public function rules(): array
    {
        return [
            'percentages' => ['required', 'array', 'min:1'],
            'percentages.*.company_id' => ['required', 'integer', 'distinct', 'exists:companies,id'],
            'percentages.*.percentage' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:100'],
        ];
    }
}
