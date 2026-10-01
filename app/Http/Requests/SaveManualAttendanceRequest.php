<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SaveManualAttendanceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'attendance_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'clock_in_at' => ['required', 'date_format:Y-m-d\TH:i'],
            'clock_out_at' => ['required', 'date_format:Y-m-d\TH:i'],
            'break_minutes' => ['required', 'integer', 'min:0', 'max:1439'],
            'work_done' => ['required', 'string', 'max:4000'],
            'learned' => ['required', 'string', 'max:4000'],
            'entry_reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
