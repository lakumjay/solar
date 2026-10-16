<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ClockOutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'record_id' => ['nullable', 'integer', 'exists:attendance_records,id'],
            'attendance_date' => ['nullable', 'date_format:Y-m-d'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'work_done' => ['required', 'string', 'max:4000'],
            'learned' => ['required', 'string', 'max:4000'],
        ];
    }
}
