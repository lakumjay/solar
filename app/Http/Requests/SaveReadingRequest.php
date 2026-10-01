<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SaveReadingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['required', 'exists:companies,id'],
            'reading_date' => ['required', 'date'],
            'plant_import_reading' => ['required', 'numeric', 'decimal:0,2', 'min:0'],
            'plant_export_reading' => ['required', 'numeric', 'decimal:0,2', 'min:0'],
            'sub_import_reading' => ['required', 'numeric', 'decimal:0,2', 'min:0'],
            'sub_export_reading' => ['required', 'numeric', 'decimal:0,2', 'min:0'],
            'outputs' => ['required', 'array', 'min:1'],
            'outputs.*.inverter_id' => ['required', 'exists:inverters,id'],
            'outputs.*.generation' => ['required', 'numeric', 'decimal:0,2', 'min:0'],
        ];
    }
}
