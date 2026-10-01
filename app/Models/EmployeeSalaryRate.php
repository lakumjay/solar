<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmployeeSalaryRate extends Model
{
    protected $fillable = ['employee_id', 'effective_month', 'monthly_salary', 'created_by'];

    protected function casts(): array
    {
        return ['effective_month' => 'date:Y-m-d', 'monthly_salary' => 'decimal:2'];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
