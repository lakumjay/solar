<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>RNSK Expenses & Settlement Report</title>
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
            border-bottom: 2px solid #0284c7;
            padding-bottom: 10px;
        }
        .header-table td {
            vertical-align: top;
            padding: 0;
        }
        .brand-title {
            font-size: 16px;
            font-weight: bold;
            color: #0284c7;
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
        .badge-blue { background: #e0f2fe; color: #0369a1; }
        .badge-amber { background: #fef3c7; color: #92400e; }
        .badge-green { background: #dcfce7; color: #166534; }
        .badge-red { background: #fee2e2; color: #991b1b; }
        .badge-gray { background: #f1f5f9; color: #475569; }

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

        .section-heading {
            font-size: 11px;
            font-weight: bold;
            color: #0f172a;
            margin: 14px 0 6px 0;
            border-left: 3px solid #0284c7;
            padding-left: 6px;
        }

        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            font-size: 8.5px;
        }
        .data-table th {
            background: #f1f5f9;
            color: #475569;
            font-weight: bold;
            text-align: left;
            padding: 6px 8px;
            border: 1px solid #cbd5e1;
            text-transform: uppercase;
            font-size: 7.5px;
        }
        .data-table td {
            padding: 5px 8px;
            border: 1px solid #e2e8f0;
            vertical-align: middle;
        }
        .data-table tr:nth-child(even) {
            background: #f8fafc;
        }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
    </style>
</head>
<body>

    <table class="header-table">
        <tr>
            <td>
                <div class="brand-title">RNSK EXPENSE MANAGEMENT</div>
                <div class="doc-title">Statement of RNSK Expenses, Allocations & Settlements</div>
                <div class="meta-text">
                    Period: <b>{{ $report['from'] }}</b> to <b>{{ $report['to'] }}</b>
                </div>
            </td>
            <td class="meta-right">
                <div>Generated: <b>{{ now()->format('d M Y, h:i A') }}</b></div>
                <div>Status: <span class="badge badge-blue">RNSK Pool</span></div>
            </td>
        </tr>
    </table>

    <table class="kpi-table">
        <tr>
            <td>
                <div class="kpi-title">Total RNSK Pool</div>
                <div class="kpi-value">₹{{ $report['gujarati_summary']['total_spent_formatted'] ?? '0.00' }}</div>
            </td>
            <td>
                <div class="kpi-title">Total Outstanding</div>
                <div class="kpi-value" style="color: #b91c1c;">₹{{ number_format($report['summary']['total_outstanding'] ?? 0, 2) }}</div>
            </td>
            <td>
                <div class="kpi-title">Open Settlement Pairs</div>
                <div class="kpi-value">{{ $report['summary']['open_pairs'] ?? 0 }}</div>
            </td>
            <td>
                <div class="kpi-title">Total Transactions</div>
                <div class="kpi-value">{{ count($report['entries'] ?? []) }}</div>
            </td>
        </tr>
    </table>

    <!-- RNSK Dynamic Company Breakdown -->
    <div class="section-heading">RNSK Company-wise Summary & Fair Share (%)</div>
    <table class="data-table">
        <thead>
            <tr>
                <th>Company Name</th>
                <th class="text-center">Share %</th>
                <th class="text-right">Total Paid (₹)</th>
                <th class="text-right">Fair Share Obligation (₹)</th>
                <th class="text-right">Net Position (₹)</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            @foreach($report['gujarati_summary']['companies'] ?? [] as $comp)
                <tr>
                    <td class="font-bold">{{ $comp['name'] }}</td>
                    <td class="text-center">{{ number_format($comp['percentage'], 2) }}%</td>
                    <td class="text-right font-bold">₹{{ $comp['total_paid_formatted'] }}</td>
                    <td class="text-right">₹{{ $comp['fair_share_formatted'] }}</td>
                    <td class="text-right font-bold" style="color: {{ $comp['status_type'] === 'receivable' ? '#166534' : ($comp['status_type'] === 'payable' ? '#991b1b' : '#475569') }}">
                        ₹{{ number_format(abs($comp['net_balance']), 2) }}
                    </td>
                    <td>
                        <span class="badge {{ $comp['status_type'] === 'receivable' ? 'badge-green' : ($comp['status_type'] === 'payable' ? 'badge-red' : 'badge-gray') }}">
                            {{ $comp['status_type'] === 'receivable' ? 'Receivable (લેવાના)' : ($comp['status_type'] === 'payable' ? 'Payable (આપવાના)' : 'Settled (સરભર)') }}
                        </span>
                    </td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <!-- Company Balances -->
    <div class="section-heading">Outstanding Company Balances (Who Pays Whom)</div>
    <table class="data-table">
        <thead>
            <tr>
                <th>Company Pair</th>
                <th>Payment Direction</th>
                <th class="text-right">Amount (₹)</th>
                <th class="text-center">Status</th>
            </tr>
        </thead>
        <tbody>
            @forelse($report['balances'] ?? [] as $pair)
                <tr>
                    <td class="font-bold">{{ $pair['first_company']['name'] ?? 'N/A' }} ↔ {{ $pair['second_company']['name'] ?? 'N/A' }}</td>
                    <td>
                        @if($pair['status'] === 'cleared')
                            <span style="color: #64748b;">No pending balance (Cleared / સરભર)</span>
                        @else
                            <b>{{ $pair['debtor_company']['name'] ?? '' }}</b> pays <b>{{ $pair['creditor_company']['name'] ?? '' }}</b>
                        @endif
                    </td>
                    <td class="text-right font-bold" style="color: {{ $pair['status'] === 'cleared' ? '#64748b' : '#b91c1c' }}">
                        ₹{{ number_format($pair['amount'], 2) }}
                    </td>
                    <td class="text-center">
                        <span class="badge {{ $pair['status'] === 'cleared' ? 'badge-gray' : 'badge-amber' }}">
                            {{ strtoupper($pair['status']) }}
                        </span>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="4" class="text-center" style="padding: 10px; color: #64748b;">No company balances recorded.</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <!-- Ledger Entries -->
    <div class="section-heading">RNSK Expense & Settlement Ledger</div>
    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 65px;">Date</th>
                <th>Type</th>
                <th>Details</th>
                <th>Paying / From Company</th>
                <th class="text-right">Total Amount (₹)</th>
                <th>Allocations / Target</th>
            </tr>
        </thead>
        <tbody>
            @forelse($report['entries'] ?? [] as $entry)
                <tr>
                    <td>{{ $entry['date'] }}</td>
                    <td>
                        @if($entry['type'] === 'expense')
                            <span class="badge badge-blue">Expense</span>
                        @else
                            <span class="badge badge-green">Settlement</span>
                        @endif
                    </td>
                    <td>
                        <b>{{ $entry['description'] ?? 'Settlement Payment' }}</b>
                        @if(!empty($entry['purchaser_name']))
                            <div style="font-size: 7.5px; color: #64748b;">By: {{ $entry['purchaser_name'] }}</div>
                        @endif
                        @if(!empty($entry['notes']))
                            <div style="font-size: 7.5px; color: #94a3b8;">{{ $entry['notes'] }}</div>
                        @endif
                    </td>
                    <td>
                        <b>{{ $entry['payer_company']['name'] ?? ($entry['from_company']['name'] ?? 'N/A') }}</b>
                    </td>
                    <td class="text-right font-bold" style="color: {{ $entry['type'] === 'expense' ? '#0f172a' : '#166534' }}">
                        ₹{{ number_format($entry['amount'], 2) }}
                    </td>
                    <td>
                        @if($entry['type'] === 'expense' && !empty($entry['allocations']))
                            @foreach($entry['allocations'] as $alloc)
                                <div style="font-size: 7.5px;">
                                    {{ $alloc['company']['name'] ?? '' }}: ₹{{ number_format($alloc['amount'], 2) }} ({{ $alloc['percentage'] }}%)
                                </div>
                            @endforeach
                        @elseif($entry['type'] === 'settlement')
                            <div>To: <b>{{ $entry['to_company']['name'] ?? 'N/A' }}</b></div>
                            <div style="font-size: 7.5px; color: #64748b;">Mode: {{ ucfirst(str_replace('_', ' ', $entry['payment_mode'] ?? 'bank_transfer')) }}</div>
                        @endif
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="6" class="text-center" style="padding: 10px; color: #64748b;">No transactions found in this period.</td>
                </tr>
            @endforelse
        </tbody>
    </table>

</body>
</html>
