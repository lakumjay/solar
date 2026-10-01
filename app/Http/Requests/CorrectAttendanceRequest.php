<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CorrectAttendanceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'clock_out_at' => ['required', 'date'],
            'clock_out_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'clock_out_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'clock_out_accuracy' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'work_done' => ['required', 'string', 'max:4000'],
            'learned' => ['required', 'string', 'max:4000'],
            'correction_reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
