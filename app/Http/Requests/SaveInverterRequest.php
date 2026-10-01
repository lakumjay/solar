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
            'serial_number' => ['nullable', 'string', 'max:100'],
            'device_type' => ['nullable', 'string', 'max:20'],
            'point_id' => ['nullable', 'string', 'max:50'],
            'active' => ['required', 'boolean'],
        ];
    }
}
