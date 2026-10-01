<?php

namespace App\Http\Requests;

use App\Models\Employee;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveEmployeeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $employeeId = $this->integer('id') ?: null;
        $userId = $employeeId ? Employee::find($employeeId)?->user_id : null;

        return [
            'id' => ['nullable', 'integer', 'exists:employees,id'],
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:150', Rule::unique('users')->ignore($userId)],
            'password' => [$employeeId ? 'nullable' : 'required', 'nullable', 'string', 'min:8'],
            'employee_code' => ['required', 'string', 'max:50', Rule::unique('employees')->ignore($employeeId)],
            'mobile' => ['nullable', 'string', 'max:30'],
            'designation' => ['nullable', 'string', 'max:100'],
            'department' => ['nullable', 'string', 'max:100'],
            'joining_date' => ['nullable', 'date'],
            'active' => ['required', 'boolean'],
            'manager_attendance_only' => ['sometimes', 'boolean'],
            'shift_start' => ['required', 'date_format:H:i'],
            'shift_end' => ['required', 'date_format:H:i', 'after:shift_start'],
            'working_minutes' => ['required', 'integer', 'min:1', 'max:1440'],
            'half_day_minutes' => ['required', 'integer', 'min:1', 'lte:working_minutes'],
            'grace_minutes' => ['required', 'integer', 'min:0', 'max:180'],
            'weekly_offs' => ['nullable', 'array'],
            'weekly_offs.*' => ['integer', 'between:0,6'],
            'profile_photo' => ['nullable', 'image', 'max:5120'],
        ];
    }
}
