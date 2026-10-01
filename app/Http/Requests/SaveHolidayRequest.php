<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveHolidayRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'id' => ['nullable', 'integer', 'exists:holidays,id'],
            'name' => ['required', 'string', 'max:150'],
            'holiday_date' => ['required', 'date', Rule::unique('holidays')->ignore($this->input('id'))],
            'type' => ['required', Rule::in(['full_day', 'first_half', 'second_half'])],
            'active' => ['required', 'boolean'],
        ];
    }
}
