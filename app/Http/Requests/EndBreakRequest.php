<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class EndBreakRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'selfie' => ['required', 'image', 'max:5120'],
        ];
    }
}
