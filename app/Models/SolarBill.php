<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;

class SolarBill extends Model
{
    protected $guarded = [];

    protected $casts = [
        'invoice_date' => 'date:Y-m-d',
        'due_date' => 'date:Y-m-d',
        'stmt_inputs' => 'array',
        'rates_derived' => 'array',
        'extra_params' => 'array',
        'breakdown' => 'array',
        'units_credited' => 'decimal:2',
        'units_peak' => 'decimal:2',
        'units_banking' => 'decimal:2',
        'units_generated' => 'decimal:2',
        'sub_total' => 'decimal:2',
        'discount_rate' => 'decimal:2',
        'discount_amt' => 'decimal:2',
        'prev_balance' => 'decimal:2',
        'interest_amt' => 'decimal:2',
        'round_off' => 'decimal:2',
        'current_grand_total' => 'decimal:2',
        'total_outstanding' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'paid_at' => 'datetime',
        'voided_at' => 'datetime',
    ];

    public function company()
    {
        return $this->belongsTo(SolarBillingCompany::class, 'company_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function voidedBy()
    {
        return $this->belongsTo(User::class, 'voided_by');
    }

    /**
     * Live accrued interest calculation for ledger & pending display.
     * Supports both pending and partial payment status.
     */
    public function getLiveLedgerMetrics(float $interestPct = 18.0): array
    {
        if ($this->status !== 'pending' && $this->status !== 'partial') {
            return [
                'is_overdue' => false,
                'overdue_days' => 0,
                'live_accrued_interest' => 0.00,
                'current_total_due' => 0.00,
            ];
        }

        $now = Carbon::now()->startOfDay();
        $coDueDays = (int) ($this->company?->due_days ?: 15);
        $due = $this->due_date
            ? Carbon::parse($this->due_date)->startOfDay()
            : Carbon::parse($this->invoice_date)->addDays($coDueDays)->startOfDay();
        $days = $now->greaterThan($due) ? $due->diffInDays($now) : 0;

        $paid = (float) ($this->paid_amount ?? 0);
        $unpaidPrincipal = max(0.0, (float) ($this->current_grand_total ?: $this->total_outstanding) - $paid);
        $unpaidTotal = max(0.0, (float) $this->total_outstanding - $paid);

        $accrued = 0.00;
        if ($days > 0 && $interestPct > 0 && $unpaidPrincipal > 0) {
            $accrued = round($unpaidPrincipal * ($interestPct / 100) * ($days / 365), 2);
        }

        return [
            'is_overdue' => $days > 0,
            'overdue_days' => (int) $days,
            'unpaid_principal' => round($unpaidPrincipal, 2),
            'live_accrued_interest' => $accrued,
            'current_total_due' => round($unpaidTotal + $accrued, 2),
        ];
    }
}
