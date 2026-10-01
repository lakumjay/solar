<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CancelSalaryAdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'correction_reason' => ['required', 'string', 'max:1000'],
            'replacement_type' => ['nullable', Rule::in(['addition', 'deduction'])],
            'replacement_amount' => ['required_with:replacement_type', 'nullable', 'numeric', 'min:0.01', 'max:9999999999.99'],
            'replacement_reason' => ['required_with:replacement_type', 'nullable', 'string', 'max:1000'],
        ];
    }
}
