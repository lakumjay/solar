<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Weather & Issue Report</title>
    <style>
        @page { margin: 20px; }
        body { font-family: DejaVu Sans, sans-serif; color: #1e293b; font-size: 9.5px; line-height: 1.35; }
        .header { margin-bottom: 15px; border-bottom: 2px solid #0f766e; padding-bottom: 8px; }
        .title { font-size: 18px; font-weight: bold; color: #0f766e; margin: 0; }
        .subtitle { color: #64748b; font-size: 10px; margin-top: 3px; }
        
        .summary-cards { width: 100%; border-collapse: separate; border-spacing: 6px 0; margin-bottom: 14px; }
        .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 7px 9px; text-align: left; }
        .card-label { font-size: 7.5px; text-transform: uppercase; color: #64748b; font-weight: bold; margin-bottom: 2px; }
        .card-val { font-size: 13px; font-weight: bold; color: #0f172a; }
        .card-normal { border-left: 3px solid #16a34a; }
        .card-low { border-left: 3px solid #ea580c; }
        .card-total { border-left: 3px solid #0f766e; }

        table.report-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        .report-table th { background: #0f766e; color: #ffffff; padding: 7px 6px; text-align: left; font-size: 9px; }
        .report-table td { padding: 6px; border-bottom: 1px solid #e2e8f0; font-size: 8.5px; vertical-align: top; }
        .report-table tr:nth-child(even) td { background: #f8fafc; }

        .badge-normal { display: inline-block; padding: 2px 6px; border-radius: 3px; background: #dcfce7; color: #166534; font-weight: bold; font-size: 8px; }
        .badge-low { display: inline-block; padding: 2px 6px; border-radius: 3px; background: #ffedd5; color: #9a3412; font-weight: bold; font-size: 8px; }
        .badge-missing { display: inline-block; padding: 2px 6px; border-radius: 3px; background: #f1f5f9; color: #475569; font-size: 8px; }
        
        .reason-box { font-weight: bold; color: #0f172a; margin-bottom: 2px; }
        .details-text { color: #475569; font-size: 8px; }
        .inverter-tags { margin-top: 3px; color: #64748b; font-size: 7.5px; }
        .footer { position: fixed; bottom: -10px; left: 0; right: 0; text-align: center; color: #94a3b8; font-size: 8px; }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">SolarFlow - Weather & Issue Report</h1>
        <div class="subtitle">
            Company: <b>{{ $report['company_name'] }}</b> | 
            Period: <b>{{ $report['from_formatted'] }} to {{ $report['to_formatted'] }}</b> | 
            Capacity: <b>{{ $report['total_capacity_kw'] }} kW</b> | 
            Expected Daily Gen: <b>{{ number_format($report['expected_daily_units'], 1) }} kWh</b>
        </div>
    </div>

    <table class="summary-cards">
        <tr>
            <td class="card card-total">
                <div class="card-label">Total Generation</div>
                <div class="card-val">{{ number_format($report['total_generation'], 1) }} kWh</div>
            </td>
            <td class="card card-normal">
                <div class="card-label">Normal Days</div>
                <div class="card-val">{{ $report['normal_days'] }} Days ({{ $report['total_days'] > 0 ? round(($report['normal_days'] / $report['total_days']) * 100) : 0 }}%)</div>
            </td>
            <td class="card card-low">
                <div class="card-label">Low Generation Days</div>
                <div class="card-val">{{ $report['low_days'] }} Days ({{ $report['total_days'] > 0 ? round(($report['low_days'] / $report['total_days']) * 100) : 0 }}%)</div>
            </td>
            <td class="card">
                <div class="card-label">Low Threshold</div>
                <div class="card-val">&lt; {{ number_format($report['low_threshold_units'], 0) }} kWh</div>
            </td>
        </tr>
    </table>

    <table class="report-table">
        <thead>
            <tr>
                <th style="width: 13%;">Date</th>
                <th style="width: 14%;">Units (kWh)</th>
                <th style="width: 11%;">Status</th>
                <th style="width: 32%;">Issue / Reason (કારણ)</th>
                <th style="width: 30%;">Details / Analysis (વિગત)</th>
            </tr>
        </thead>
        <tbody>
            @forelse($report['rows'] as $row)
                <tr>
                    <td>
                        <b>{{ $row['date_formatted'] }}</b><br>
                        <span style="color: #64748b; font-size: 7.5px;">{{ $row['day_name'] }}</span>
                    </td>
                    <td>
                        <b style="font-size: 10px; color: {{ $row['status'] === 'low' ? '#ea580c' : ($row['status'] === 'normal' ? '#16a34a' : '#64748b') }};">
                            {{ number_format($row['generation'], 1) }}
                        </b><br>
                        <span style="color: #64748b; font-size: 7.5px;">
                            ({{ $row['pct_of_expected'] }}% of exp.)
                        </span>
                    </td>
                    <td>
                        @if($row['status'] === 'normal')
                            <span class="badge-normal">NORMAL</span>
                        @elseif($row['status'] === 'low')
                            <span class="badge-low">LOW UNITS</span>
                        @else
                            <span class="badge-missing">NO DATA</span>
                        @endif
                    </td>
                    <td>
                        <div class="reason-box">{{ $row['reason'] }}</div>
                        @if(!empty($row['inverters']) && count($row['inverters']) > 0)
                            <div class="inverter-tags">
                                @foreach(array_slice($row['inverters'], 0, 4) as $inv)
                                    {{ $inv['name'] }}: {{ number_format($inv['generation'], 0) }}k |
                                @endforeach
                            </div>
                        @endif
                    </td>
                    <td>
                        <div class="details-text">{{ $row['details'] }}</div>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="5" style="text-align: center; padding: 15px;">No records found for this period.</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <div class="footer">
        SolarFlow Energy Monitor System - Generated on {{ now()->format('d M Y, h:i A') }}
    </div>
</body>
</html>
