<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Shared Expenses & Settlement Report</title>
    <style>
        @page {
            margin: 24px 28px;
            size: A4 portrait;
        }
        body {
            font-family: DejaVu Sans, Helvetica, Arial, sans-serif;
            color: #1e293b;
            font-size: 9px;
            line-height: 1.35;
            margin: 0;
            padding: 0;
        }
        .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            border-bottom: 2px solid #0f766e;
            padding-bottom: 10px;
        }
        .header-table td {
            vertical-align: top;
            padding: 0;
        }
        .brand-title {
            font-size: 16px;
            font-weight: bold;
            color: #0f766e;
            letter-spacing: 0.5px;
            margin: 0 0 3px 0;
        }
        .doc-title {
            font-size: 12px;
            font-weight: bold;
            color: #334155;
            margin: 0 0 3px 0;
        }
        .meta-text {
            color: #64748b;
            font-size: 8.5px;
        }
        .meta-right {
            text-align: right;
            font-size: 8.5px;
            color: #475569;
        }
        .badge {
            display: inline-block;
            padding: 2px 7px;
            border-radius: 4px;
            font-size: 8px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .badge-teal { background: #ccfbf1; color: #0f766e; }
        .badge-amber { background: #fef3c7; color: #92400e; }
        .badge-green { background: #dcfce7; color: #166534; }
        .badge-red { background: #fee2e2; color: #991b1b; }
        .badge-blue { background: #e0f2fe; color: #0369a1; }
        .badge-gray { background: #f1f5f9; color: #475569; }

        /* KPI Summary Grid */
        .kpi-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
        }
        .kpi-table td {
            width: 25%;
            padding: 8px 10px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 5px;
            vertical-align: top;
        }
        .kpi-title {
            font-size: 8px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: bold;
            margin-bottom: 3px;
        }
        .kpi-value {
            font-size: 13px;
            font-weight: bold;
            color: #0f172a;
        }
        .kpi-sub {
            font-size: 7.5px;
            color: #94a3b8;
            margin-top: 2px;
        }

        /* Section Headings */
        .section-heading {
            font-size: 10.5px;
            font-weight: bold;
            color: #0f766e;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 4px;
            margin: 12px 0 6px 0;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        /* Tables */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            page-break-inside: auto;
        }
        .data-table th, .data-table td {
            border: 1px solid #e2e8f0;
            padding: 5px 6px;
            text-align: left;
            font-size: 8.5px;
        }
        .data-table th {
            background: #0f766e;
            color: #ffffff;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 8px;
            letter-spacing: 0.2px;
        }
        .data-table tr:nth-child(even) td {
            background: #f8fafc;
        }
        .data-table tr.total-row td {
            background: #e2e8f0;
            font-weight: bold;
            border-top: 2px solid #0f766e;
            color: #0f172a;
        }
        .num {
            text-align: right;
            white-space: nowrap;
        }
        .center {
            text-align: center;
        }
        .bold {
            font-weight: bold;
        }
        .text-green { color: #166534; font-weight: bold; }
        .text-red { color: #991b1b; font-weight: bold; }
        .text-muted { color: #64748b; font-size: 7.5px; }

        /* Signatures */
        .signatures-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 28px;
            page-break-inside: avoid;
        }
        .signatures-table td {
            width: 33.33%;
            text-align: center;
            vertical-align: bottom;
            padding: 0 15px;
        }
        .sign-line {
            border-top: 1px dashed #94a3b8;
            margin-top: 36px;
            padding-top: 4px;
            font-size: 8.5px;
            font-weight: bold;
            color: #475569;
        }
        .sign-title {
            font-size: 7.5px;
            color: #94a3b8;
        }
    </style>
</head>
<body>

    <!-- Header -->
    <table class="header-table">
        <tr>
            <td>
                <div class="brand-title">SOLARFLOW</div>
                <div class="doc-title">Shared Expenses & Settlement Audit Report</div>
                <div class="meta-text">
                    Period: <b>{{ \Carbon\Carbon::parse($report['from'])->format('d M Y') }}</b> to <b>{{ \Carbon\Carbon::parse($report['to'])->format('d M Y') }}</b>
                    &nbsp;|&nbsp; Company Scope: <span class="badge badge-teal">{{ $selectedCompany ? $selectedCompany->name : 'All Partner Companies' }}</span>
                </div>
            </td>
            <td class="meta-right">
                <div>Generated: <b>{{ now()->format('d M Y, h:i A') }}</b></div>
                <div>User: <b>{{ $user->name }}</b> ({{ ucfirst(str_replace('_', ' ', $user->role)) }})</div>
                <div class="text-muted">Status: Official Financial Record</div>
            </td>
        </tr>
    </table>

    <!-- KPI Summary Row -->
    @php
        $sum = $report['summary'] ?? [];
        $totalOutstanding = (float)($sum['total_outstanding'] ?? 0);
        $openPairs = (int)($sum['open_pairs'] ?? 0);
        $clearedPairs = (int)($sum['cleared_pairs'] ?? 0);
        $entryCount = (int)($sum['entries'] ?? count($report['entries'] ?? []));
        $totalPeriodExpense = collect($report['entries'] ?? [])->where('type', 'expense')->sum('amount');
    @endphp
    <table class="kpi-table">
        <tr>
            <td>
                <div class="kpi-title">Period Expenses</div>
                <div class="kpi-value">₹{{ number_format($totalPeriodExpense, 2) }}</div>
                <div class="kpi-sub">{{ $entryCount }} Ledger Entries</div>
            </td>
            <td>
                <div class="kpi-title">Total Outstanding</div>
                <div class="kpi-value" style="color: {{ $totalOutstanding > 0 ? '#b91c1c' : '#166534' }};">
                    ₹{{ number_format($totalOutstanding, 2) }}
                </div>
                <div class="kpi-sub">{{ $openPairs }} Open Balances</div>
            </td>
            <td>
                <div class="kpi-title">Cleared Balances</div>
                <div class="kpi-value text-green">{{ $clearedPairs }} Pairs</div>
                <div class="kpi-sub">100% Fully Settled</div>
            </td>
            <td>
                <div class="kpi-title">Active Scope</div>
                <div class="kpi-value" style="font-size: 11px;">
                    {{ $selectedCompany ? $selectedCompany->name : 'Multi-Company Master' }}
                </div>
                <div class="kpi-sub">{{ count($report['settings']['companies'] ?? []) }} Partner Companies</div>
            </td>
        </tr>
    </table>

    <!-- 1. Inter-Company Balances & Current Positions -->
    @if(!empty($report['balances']))
    <div class="section-heading">Inter-Company Outstanding Balances & Settlement Status</div>
    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 28%;">Company Pair</th>
                <th style="width: 38%;">Current Net Obligation</th>
                <th style="width: 18%;" class="num">Pending Amount</th>
                <th style="width: 16%;" class="center">Status</th>
            </tr>
        </thead>
        <tbody>
            @foreach($report['balances'] as $pair)
            <tr>
                <td class="bold">{{ $pair['first_company']['name'] }} ↔ {{ $pair['second_company']['name'] }}</td>
                <td>
                    @if($pair['status'] === 'cleared')
                        <span class="text-green">✓ No amount pending (Accounts are settled)</span>
                    @else
                        <b>{{ $pair['debtor_company']['name'] }}</b> pays <b>{{ $pair['creditor_company']['name'] }}</b>
                    @endif
                </td>
                <td class="num bold" style="color: {{ $pair['status'] === 'cleared' ? '#64748b' : '#b91c1c' }};">
                    ₹{{ number_format($pair['amount'], 2) }}
                </td>
                <td class="center">
                    @if($pair['status'] === 'cleared')
                        <span class="badge badge-green">Cleared</span>
                    @else
                        <span class="badge badge-amber">Open Balance</span>
                    @endif
                </td>
            </tr>
            @endforeach
        </tbody>
    </table>
    @endif

    <!-- 2. Gujarati / Company-wise Financial Position Breakdown -->
    @if(!empty($report['gujarati_summary']['companies']))
    <div class="section-heading">Company Investment & Fair-Share Equity Breakdown</div>
    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 25%;">Company Name</th>
                <th style="width: 12%;" class="num">Equity %</th>
                <th style="width: 18%;" class="num">Total Paid (ખર્ચ કર્યો)</th>
                <th style="width: 18%;" class="num">Fair Share (હિસ્સો)</th>
                <th style="width: 27%;">Net Position (સ્થિતિ)</th>
            </tr>
        </thead>
        <tbody>
            @php
                $totPaid = 0;
                $totFair = 0;
            @endphp
            @foreach($report['gujarati_summary']['companies'] as $comp)
            @php
                $totPaid += $comp['total_paid'];
                $totFair += $comp['fair_share'];
            @endphp
            <tr>
                <td class="bold">{{ $comp['name'] }}</td>
                <td class="num">{{ number_format($comp['percentage'], 1) }}%</td>
                <td class="num">₹{{ number_format($comp['total_paid'], 2) }}</td>
                <td class="num">₹{{ number_format($comp['fair_share'], 2) }}</td>
                <td>
                    @if($comp['net_balance'] > 0.01)
                        <span class="text-green">+₹{{ number_format($comp['net_balance'], 2) }} (લેવાના / Receivable)</span>
                    @elseif($comp['net_balance'] < -0.01)
                        <span class="text-red">-₹{{ number_format(abs($comp['net_balance']), 2) }} (દેવાના / Payable)</span>
                    @else
                        <span style="color: #64748b;">₹0.00 (સરભર / Settled)</span>
                    @endif
                </td>
            </tr>
            @endforeach
            <tr class="total-row">
                <td>Total</td>
                <td class="num">100.0%</td>
                <td class="num">₹{{ number_format($totPaid, 2) }}</td>
                <td class="num">₹{{ number_format($totFair, 2) }}</td>
                <td>—</td>
            </tr>
        </tbody>
    </table>
    @endif

    <!-- 3. Daily Expense Ledger -->
    <div class="section-heading">Detailed Transaction Ledger</div>
    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 11%;">Date</th>
                <th style="width: 22%;">Description & Purchaser</th>
                <th style="width: 14%;">Paid By</th>
                <th style="width: 13%;">Scope</th>
                <th style="width: 24%;">Split Details & Net Effect</th>
                <th style="width: 10%;" class="num">Amount (₹)</th>
                <th style="width: 6%;" class="center">Status</th>
            </tr>
        </thead>
        <tbody>
            @forelse($report['entries'] as $entry)
            @php
                $isSettlement = ($entry['type'] ?? '') === 'settlement';
            @endphp
            <tr>
                <td>{{ \Carbon\Carbon::parse($entry['date'])->format('d M Y') }}</td>
                <td>
                    <b>{{ $isSettlement ? 'Inter-Company Settlement' : $entry['description'] }}</b>
                    @if(!$isSettlement && !empty($entry['purchaser_name']))
                        <div class="text-muted">By: {{ $entry['purchaser_name'] }}</div>
                    @endif
                    @if(!empty($entry['notes']))
                        <div class="text-muted">Note: {{ $entry['notes'] }}</div>
                    @endif
                </td>
                <td>
                    @if($isSettlement)
                        <span class="bold">{{ $entry['from_company']['name'] ?? '—' }}</span>
                        <div class="text-muted">➜ {{ $entry['to_company']['name'] ?? '—' }}</div>
                    @else
                        @if(!empty($entry['payers']))
                            @foreach($entry['payers'] as $p)
                                <div>{{ $p['company_name'] }}: <b>₹{{ number_format($p['amount_paid'], 2) }}</b></div>
                            @endforeach
                        @else
                            {{ $entry['payer_company']['name'] ?? '—' }}
                        @endif
                    @endif
                </td>
                <td>
                    @if($isSettlement)
                        <span class="badge badge-green">Settlement</span>
                    @else
                        @php
                            $scope = $entry['allocation_scope'] ?? 'all';
                        @endphp
                        @if($scope === 'single')
                            <span class="badge badge-gray">1 Co Direct</span>
                        @elseif($scope === 'two')
                            <span class="badge badge-blue">2 Co Split</span>
                        @else
                            <span class="badge badge-teal">All Master</span>
                        @endif
                    @endif
                </td>
                <td>
                    @if($isSettlement)
                        <span class="text-green">Direct Transfer of ₹{{ number_format($entry['amount'], 2) }}</span>
                    @else
                        @php
                            $allocs = collect($entry['allocations'] ?? [])->filter(fn($a) => (float)($a['percentage'] ?? 0) > 0 || (float)($a['amount'] ?? 0) > 0 || (float)($a['amount_paid'] ?? 0) > 0);
                        @endphp
                        @foreach($allocs as $a)
                            @php
                                $net = (float)($a['net_effect'] ?? (($a['amount_paid'] ?? 0) - ($a['amount'] ?? 0)));
                            @endphp
                            <div>
                                <b>{{ $a['company']['name'] }}</b> ({{ number_format($a['percentage'], 1) }}%): ₹{{ number_format($a['amount'], 2) }}
                                @if($net > 0.01)
                                    <span class="text-green">[+₹{{ number_format($net, 2) }} Rec]</span>
                                @elseif($net < -0.01)
                                    <span class="text-red">[-₹{{ number_format(abs($net), 2) }} Pay]</span>
                                @endif
                            </div>
                        @endforeach
                    @endif
                </td>
                <td class="num bold" style="color: {{ $isSettlement ? '#0f766e' : '#0f172a' }};">
                    ₹{{ number_format($entry['amount'], 2) }}
                </td>
                <td class="center">
                    @if(($entry['status'] ?? '') === 'active')
                        <span class="badge badge-green">Active</span>
                    @elseif(($entry['status'] ?? '') === 'cleared')
                        <span class="badge badge-green">Full</span>
                    @elseif(($entry['status'] ?? '') === 'partial')
                        <span class="badge badge-amber">Partial</span>
                    @elseif(($entry['status'] ?? '') === 'cancelled')
                        <span class="badge badge-red">Cancelled</span>
                    @else
                        <span class="badge badge-gray">{{ ucfirst($entry['status'] ?? 'Active') }}</span>
                    @endif
                </td>
            </tr>
            @empty
            <tr>
                <td colspan="7" class="center text-muted" style="padding: 16px;">No shared expenses or settlements recorded in this period.</td>
            </tr>
            @endforelse
            <tr class="total-row">
                <td colspan="5">Grand Total Entries Amount</td>
                <td class="num">₹{{ number_format(collect($report['entries'] ?? [])->sum('amount'), 2) }}</td>
                <td></td>
            </tr>
        </tbody>
    </table>

    <!-- Signatures -->
    <table class="signatures-table">
        <tr>
            <td>
                <div class="sign-line">Prepared By</div>
                <div class="sign-title">Accountant / Data Operator</div>
            </td>
            <td>
                <div class="sign-line">Verified By</div>
                <div class="sign-title">Internal Auditor / Manager</div>
            </td>
            <td>
                <div class="sign-line">Partner Authorization</div>
                <div class="sign-title">Authorized Signatory / Director</div>
            </td>
        </tr>
    </table>

</body>
</html>
