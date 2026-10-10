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

    protected function prepareForValidation(): void
    {
        if ($this->has('company_id') && ($this->company_id === '' || $this->company_id === null)) {
            $this->merge(['company_id' => null]);
        }
        if ($this->has('work_date') && empty($this->work_date)) {
            $this->merge(['work_date' => null]);
        }
    }

    public function rules(): array
    {
        return [
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'salary_month' => ['required', 'date_format:Y-m'],
            'type' => ['required', Rule::in(['addition', 'deduction'])],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:9999999999.99'],
            'reason' => ['required', 'string', 'max:1000'],
            'work_date' => ['nullable', 'date'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'add_to_shared_expenses' => ['nullable', 'boolean'],
        ];
    }
}
