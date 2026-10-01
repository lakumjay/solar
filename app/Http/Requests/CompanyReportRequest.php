<?php

namespace App\Http\Requests;

use App\Services\CompanyWiseReportService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CompanyReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'company_id' => ['required', 'integer', 'exists:companies,id'],
            'date_from' => ['required', 'date'],
            'date_to' => ['required', 'date', 'after_or_equal:date_from'],
            'inverter_ids' => ['nullable', 'array'],
            'inverter_ids.*' => ['integer', 'distinct', 'exists:inverters,id'],
            'columns' => ['nullable', 'array'],
            'columns.*' => ['string', 'distinct', Rule::in(array_keys(CompanyWiseReportService::METER_COLUMNS))],
        ];
    }
}
