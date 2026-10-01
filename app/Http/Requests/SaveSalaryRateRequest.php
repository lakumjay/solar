<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SaveSalaryRateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'effective_month' => ['required', 'date_format:Y-m'],
            'monthly_salary' => ['required', 'numeric', 'min:0.01', 'max:9999999999.99'],
        ];
    }
}
