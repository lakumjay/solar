import React, {useEffect, useState} from 'react';
import {BarChart3, FileSpreadsheet, FileText, Sun} from 'lucide-react';
import {api} from '../api';
import {METERS, monthStart, today} from '../config';
import {number, shortDate} from '../format';
import {DatePicker, Empty, Metric} from '../components/Common';

const COMPANY_REPORT_COLUMNS = [
    ['plant_import_reading', 'Plant Import Reading'],
    ['plant_import_unit', 'Plant Import Unit'],
    ['plant_export_reading', 'Plant Export Reading'],
    ['plant_export_unit', 'Plant Export Unit'],
    ['sub_import_reading', '66kV Sub Import Reading'],
    ['sub_import_unit', '66kV Sub Import Unit'],
    ['sub_export_reading', '66kV Sub Export Reading'],
    ['sub_export_unit', '66kV Sub Export Unit'],
];

const CHART_COLORS = [
    { start: '#10b981', end: '#059669', bg: '#ecfdf5', text: '#065f46' },
    { start: '#3b82f6', end: '#1d4ed8', bg: '#eff6ff', text: '#1e40af' },
    { start: '#f59e0b', end: '#b45309', bg: '#fffbeb', text: '#92400e' },
    { start: '#8b5cf6', end: '#6d28d9', bg: '#f5f3ff', text: '#5b21b6' },
    { start: '#06b6d4', end: '#0e7490', bg: '#ecfeff', text: '#155e75' },
    { start: '#f43f5e', end: '#be123c', bg: '#fff1f2', text: '#9f1239' },
];

export default function ReportsPage({companyId, companies}) {
    const [period, setPeriod] = useState('daily');
    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(today());
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [reportCompanyId, setReportCompanyId] = useState(companyId === 'all' ? String(companies[0]?.id || '') : String(companyId));
    const [meterColumns, setMeterColumns] = useState(COMPANY_REPORT_COLUMNS.map(([key]) => key));
    const selectedReportCompany = companies.find(company => String(company.id) === reportCompanyId);
    const [inverterIds, setInverterIds] = useState((selectedReportCompany?.inverters || []).map(inverter => String(inverter.id)));
    const load = () => {
        setError('');
        api(`report?company_id=${companyId}&period=${period}&date_from=${from}&date_to=${to}`).then(setData).catch(error => setError(error.message));
    };

    useEffect(load, [companyId, period]);
    useEffect(() => {
        setInverterIds((selectedReportCompany?.inverters || []).map(inverter => String(inverter.id)));
    }, [reportCompanyId]);
    const query = new URLSearchParams({company_id: companyId, period, date_from: from, date_to: to}).toString();
    const dailySsQuery = new URLSearchParams({date_from: from, date_to: to}).toString();
    const companyReportQuery = new URLSearchParams({company_id: reportCompanyId, date_from: from, date_to: to});
    inverterIds.forEach(id => companyReportQuery.append('inverter_ids[]', id));
    meterColumns.forEach(column => companyReportQuery.append('columns[]', column));
    const toggle = (values, setValues, key, checked) => setValues(checked ? [...values, key] : values.filter(value => value !== key));

    return <div className="reports-page">
        <section className="panel report-filter"><div className="segment">{[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([key, label]) => <button className={period === key ? 'active' : ''} onClick={() => setPeriod(key)} key={key}>{label}</button>)}</div><DatePicker label="From" value={from} onChange={setFrom}/><DatePicker label="To" value={to} onChange={setTo} align="right"/><button className="primary" onClick={load}>Apply</button></section>
        {error && <div className="error">{error}</div>}
        {data && <>
            <section className="panel daily-ss-panel"><div className="panel-head"><div><h2>Daily SS report</h2><p>Common Daily SS values use only <strong className="report-highlight-pill">{data.ss_reference?.company || 'the configured reference company'}</strong> 66kV Sub Import Unit. Every authorized company login receives the same report.</p></div><div className="export-actions"><a className="secondary daily-ss-download-btn" href={`/api/report/export/daily-ss-excel?${dailySsQuery}`}><FileSpreadsheet size={16}/>Download Excel</a></div></div></section>
            {data.ss_reference?.missing_dates?.length > 0 && <div className="warning-banner"><b>Missing {data.ss_reference.company} entries</b><span>Daily SS and combined 66kV Sub Import count 0.00 on: {data.ss_reference.missing_dates.map(shortDate).join(', ')}. Other companies are not used as a fallback.</span></div>}
            
            <section className="panel company-report-builder">
                <div className="panel-head"><div><h2>Company-wise report</h2><p>Select the company and only the columns required in the Excel file. Date is always included.</p></div><div className="export-actions"><a className={reportCompanyId ? 'secondary generate-excel-btn' : 'secondary disabled generate-excel-btn'} href={reportCompanyId ? `/api/report/export/company-excel?${companyReportQuery}` : undefined}><FileSpreadsheet size={16}/>Generate Excel</a></div></div>
                <label className="company-report-select"><span>Company</span><select value={reportCompanyId} onChange={event => setReportCompanyId(event.target.value)}>{companies.map(company => <option value={company.id} key={company.id}>{company.name}</option>)}</select></label>
                <div className="report-column-groups">
                    <div><h3>Inverter generation</h3><div className="report-column-picker">{(selectedReportCompany?.inverters || []).map(inverter => {
                        const isChecked = inverterIds.includes(String(inverter.id));
                        return <label key={inverter.id} className={`report-picker-pill ${isChecked ? 'active' : ''}`}><input type="checkbox" checked={isChecked} onChange={event => toggle(inverterIds, setInverterIds, String(inverter.id), event.target.checked)}/><span>{inverter.name}</span></label>;
                    })}</div></div>
                    <div><h3>Meter readings and units</h3><div className="report-column-picker">{COMPANY_REPORT_COLUMNS.map(([key, label]) => {
                        const isChecked = meterColumns.includes(key);
                        return <label key={key} className={`report-picker-pill ${isChecked ? 'active' : ''}`}><input type="checkbox" checked={isChecked} onChange={event => toggle(meterColumns, setMeterColumns, key, event.target.checked)}/><span>{label}</span></label>;
                    })}</div></div>
                </div>
            </section>

            {/* Generation Bar Graph */}
            {((data.is_combined && data.company_totals?.length > 0) || (!data.is_combined && data.inverter_totals?.length > 0)) && (
                <ReportBarChart
                    title={data.is_combined ? 'Company-wise report' : 'Inverter generation'}
                    items={data.is_combined
                        ? data.company_totals.map(c => ({ id: c.company_id, label: c.company, value: Number(c.generation || 0) }))
                        : data.inverter_totals.map(inv => ({ id: inv.inverter_id, label: inv.inverter, value: Number(inv.generation || 0) }))
                    }
                />
            )}

            <div className="cards five compact"><Metric icon={Sun} title="All Inverter Total" value={data.grand_total.generation} unit="kWh" color="amber"/>{METERS.map(([key, label]) => <Metric key={key} title={label} value={data.grand_total[key]}/>)}</div>
            <section className="panel"><div className="panel-head"><div><h2>{period[0].toUpperCase() + period.slice(1)} totals</h2><p>{shortDate(data.from)} to {shortDate(data.to)} · {data.is_combined ? 'Combined companies' : 'Selected company'}</p></div><div className="export-actions"><a className="secondary" href={`/api/report/export/excel?${query}`}><FileSpreadsheet size={16}/>Excel</a><a className="secondary" href={`/api/report/export/pdf?${query}`}><FileText size={16}/>PDF</a></div></div>{data.rows.length ? <div className="table-wrap"><table><thead><tr><th>{period === 'weekly' ? 'Week starting' : period === 'monthly' ? 'Month' : 'Date'}</th>{data.is_combined && <th>Companies</th>}<th>All Inverter Total</th>{METERS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.period}><td className="strong">{period === 'monthly' ? row.period : shortDate(row.period)}</td>{data.is_combined && <td>{row.company_count}</td>}<td>{number(row.generation)}</td>{METERS.map(([key]) => <td key={key}>{number(row[key])}</td>)}</tr>)}</tbody></table></div> : <Empty title="No report data" detail="No readings were found in the selected date range."/>}</section>
            {data.is_combined && <ReportTotals title="Company-wise totals" rows={data.company_totals} columns={[['company', 'Company'], ['generation', 'All Inverter Total'], ...METERS]}/>} 
            <ReportTotals title="Inverter-wise generation totals" rows={data.inverter_totals} columns={data.is_combined ? [['company', 'Company'], ['inverter', 'Inverter'], ['generation', 'Generation']] : [['inverter', 'Inverter'], ['generation', 'Generation']]}/>
        </>}
    </div>;
}

function ReportBarChart({title, items}) {
    if (!items || items.length === 0) return null;

    const totalValue = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const maxValue = Math.max(...items.map(item => Number(item.value) || 0), 1);

    const svgWidth = 600;
    const svgHeight = 180;
    const paddingLeft = 45;
    const paddingRight = 20;
    const paddingTop = 25;
    const paddingBottom = 35;
    const plotWidth = svgWidth - paddingLeft - paddingRight;
    const plotHeight = svgHeight - paddingTop - paddingBottom;
    const barSpacing = plotWidth / items.length;
    const barWidth = Math.min(50, barSpacing * 0.6);

    return (
        <section className="panel report-chart-panel">
            <div className="panel-head">
                <div>
                    <h2><BarChart3 size={18} className="chart-icon" />{title}</h2>
                </div>
                <div className="chart-head-metric">
                    <span>{number(totalValue)} <small>kWh</small></span>
                </div>
            </div>

            <div className="report-chart-canvas">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="report-svg-chart" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        {items.map((_, idx) => {
                            const color = CHART_COLORS[idx % CHART_COLORS.length];
                            return (
                                <linearGradient key={idx} id={`bar-grad-${idx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor={color.start} />
                                    <stop offset="100%" stopColor={color.end} />
                                </linearGradient>
                            );
                        })}
                    </defs>

                    {/* Horizontal Grid lines */}
                    {[1, 0.5, 0].map(fraction => {
                        const y = paddingTop + plotHeight * (1 - fraction);
                        const val = Math.round(maxValue * fraction);
                        return (
                            <g key={fraction} className="chart-grid-row">
                                <line x1={paddingLeft} y1={y} x2={svgWidth - paddingRight} y2={y} stroke="#e2e8f0" strokeDasharray={fraction > 0 ? '4 4' : 'none'} strokeWidth="1" />
                                <text x={paddingLeft - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                                    {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                                </text>
                            </g>
                        );
                    })}

                    {/* Bars */}
                    {items.map((item, idx) => {
                        const val = Number(item.value) || 0;
                        const height = Math.max(4, (val / maxValue) * plotHeight);
                        const x = paddingLeft + (idx * barSpacing) + (barSpacing - barWidth) / 2;
                        const y = paddingTop + plotHeight - height;
                        const color = CHART_COLORS[idx % CHART_COLORS.length];

                        return (
                            <g key={item.id || idx} className="chart-bar-group">
                                <rect
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={height}
                                    rx="5"
                                    fill={`url(#bar-grad-${idx})`}
                                    className="chart-bar-rect"
                                />
                                <text
                                    x={x + barWidth / 2}
                                    y={y - 6}
                                    textAnchor="middle"
                                    fontSize="11"
                                    fontWeight="600"
                                    fill={color.text}
                                >
                                    {number(val)}
                                </text>
                                <text
                                    x={x + barWidth / 2}
                                    y={svgHeight - 12}
                                    textAnchor="middle"
                                    fontSize="10"
                                    fontWeight="500"
                                    fill="#475569"
                                >
                                    {item.label.length > 12 ? item.label.slice(0, 10) + '…' : item.label}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Breakdown summary cards */}
            <div className="chart-breakdown-grid">
                {items.map((item, idx) => {
                    const val = Number(item.value) || 0;
                    const pct = totalValue > 0 ? ((val / totalValue) * 100).toFixed(1) : 0;
                    const color = CHART_COLORS[idx % CHART_COLORS.length];
                    return (
                        <div key={item.id || idx} className="chart-breakdown-card">
                            <div className="chart-breakdown-top">
                                <span className="chart-dot" style={{ background: color.start }} />
                                <span className="chart-breakdown-label">{item.label}</span>
                                <span className="chart-breakdown-pct" style={{ background: color.bg, color: color.text }}>{pct}%</span>
                            </div>
                            <div className="chart-track">
                                <div className="chart-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color.start}, ${color.end})` }} />
                            </div>
                            <div className="chart-breakdown-val">
                                <strong>{number(val)}</strong> <small>kWh</small>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function ReportTotals({title, rows, columns}) {
    if (!rows?.length) return null;

    return <section className="panel"><div className="panel-head"><div><h2>{title}</h2><p>Totals for the selected date range.</p></div></div><div className="table-wrap"><table><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.company_id || row.inverter_id || index}>{columns.map(([key]) => <td className={key === 'company' || key === 'inverter' ? 'strong' : ''} key={key}>{key === 'company' || key === 'inverter' ? row[key] : number(row[key])}</td>)}</tr>)}</tbody></table></div></section>;
}
