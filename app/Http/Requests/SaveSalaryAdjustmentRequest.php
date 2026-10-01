<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveSalaryAdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'salary_month' => ['required', 'date_format:Y-m'],
            'work_date' => ['nullable', 'date'],
            'type' => ['required', Rule::in(['addition', 'deduction', 'bonus', 'advance', 'overtime'])],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:9999999999.99'],
            'reason' => ['required', 'string', 'max:1000'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'add_to_shared_expenses' => ['nullable', 'boolean'],
        ];
    }
}

