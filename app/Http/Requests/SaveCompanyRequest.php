<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveCompanyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'super_admin';
    }

    public function rules(): array
    {
        $companyId = $this->integer('id') ?: null;
        $adminId = $companyId
            ? User::where('company_id', $companyId)->where('role', 'company_admin')->oldest('id')->value('id')
            : null;

        return [
            'id' => ['nullable', 'integer', 'exists:companies,id'],
            'name' => ['required', 'string', 'max:120', Rule::unique('companies')->ignore($this->input('id'))],
            'admin_email' => ['required', 'email', 'max:150', Rule::unique('users', 'email')->ignore($adminId)],
            'password' => [$adminId ? 'nullable' : 'required', 'nullable', 'string', 'min:8'],
            'logo' => [$companyId ? 'nullable' : 'required', 'image', 'mimes:jpeg,png,webp', 'max:4096'],
            'active' => ['required', 'boolean'],
            'plant_import_multiplier' => ['required', 'numeric', 'decimal:0,2', 'min:0'],
            'plant_export_multiplier' => ['required', 'numeric', 'decimal:0,2', 'min:0'],
            'sub_import_multiplier' => ['required', 'numeric', 'decimal:0,2', 'min:0'],
            'sub_export_multiplier' => ['required', 'numeric', 'decimal:0,2', 'min:0'],
        ];
    }
}
