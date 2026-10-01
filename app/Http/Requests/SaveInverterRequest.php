<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SaveInverterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'id' => ['nullable', 'integer', 'exists:inverters,id'],
            'company_id' => ['required', 'exists:companies,id'],
            'name' => ['required', 'string', 'max:80'],
            'active' => ['required', 'boolean'],
        ];
    }
}
