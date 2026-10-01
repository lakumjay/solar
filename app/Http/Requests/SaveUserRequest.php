<?php

namespace App\Http\Requests;

use App\Services\SolarAccessService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'id' => ['nullable', 'integer', 'exists:users,id'],
            'company_id' => ['nullable', 'exists:companies,id'],
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:150', Rule::unique('users')->ignore($this->input('id'))],
            'password' => [$this->filled('id') ? 'nullable' : 'required', 'nullable', 'string', 'min:8'],
            'role' => ['required', Rule::in(['super_admin', 'company_admin', 'manager', 'data_entry', 'viewer', 'employee'])],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => [Rule::in(SolarAccessService::PERMISSIONS)],
            'active' => ['required', 'boolean'],
        ];
    }
}
