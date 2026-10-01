<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExpenseSettlement extends Model
{
    protected $guarded = [];

    protected $casts = [
        'settled_on' => 'date',
        'amount' => 'decimal:2',
    ];

    public function fromCompany()
    {
        return $this->belongsTo(Company::class, 'from_company_id');
    }

    public function toCompany()
    {
        return $this->belongsTo(Company::class, 'to_company_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
