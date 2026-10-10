import React, {useEffect, useState} from 'react';
import {BarChart3, ChevronDown, ChevronUp, CloudRain, FileSpreadsheet, FileText, LayoutGrid, Sun, Table} from 'lucide-react';
import {api} from '../api';
import {METERS, monthStart, today} from '../config';
import {number, shortDate} from '../format';
import {DatePicker, Empty, Metric} from '../components/Common';
import {getLanguage} from '../utils/translations';

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
    const [weatherIssueData, setWeatherIssueData] = useState(null);
    const [weatherIssueLoading, setWeatherIssueLoading] = useState(false);
    const [weatherReportOpen, setWeatherReportOpen] = useState(false);
    const [reportLoading, setReportLoading] = useState(false);
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    const [filterOnlyIssues, setFilterOnlyIssues] = useState(false);
    const [reportCompanyId, setReportCompanyId] = useState(companyId === 'all' ? String(companies[0]?.id || '') : String(companyId));
    const [meterColumns, setMeterColumns] = useState(COMPANY_REPORT_COLUMNS.map(([key]) => key));
    const selectedReportCompany = companies.find(company => String(company.id) === reportCompanyId);
    const [inverterIds, setInverterIds] = useState((selectedReportCompany?.inverters || []).map(inverter => String(inverter.id)));
    const [currentLang, setCurrentLang] = useState(() => getLanguage());
    const [viewMode, setViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= 768 ? 'cards' : 'table'));

    useEffect(() => {
        const handler = (e) => setCurrentLang(e.detail || getLanguage());
        window.addEventListener('solarflow_language_change', handler);
        return () => window.removeEventListener('solarflow_language_change', handler);
    }, []);
    const load = () => {
        setError('');
        setReportLoading(true);
        api(`report?company_id=${companyId}&period=${period}&date_from=${from}&date_to=${to}`)
            .then(setData)
            .catch(error => setError(error.message))
            .finally(() => setReportLoading(false));

        setWeatherIssueLoading(true);
        api(`report/weather-issue?company_id=${companyId}&date_from=${from}&date_to=${to}`)
            .then(setWeatherIssueData)
            .catch(() => {})
            .finally(() => setWeatherIssueLoading(false));
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

    const weatherIssueQuery = new URLSearchParams({company_id: companyId, date_from: from, date_to: to}).toString();

    const handleDownloadPdf = async (e) => {
        if (e) e.preventDefault();
        setDownloadingPdf(true);
        try {
            const response = await fetch(`/api/report/export/weather-issue-pdf?${weatherIssueQuery}`, {
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/pdf',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content,
                }
            });
            if (!response.ok) {
                throw new Error(currentLang === 'en' ? 'PDF download failed (Status: ' + response.status + ')' : 'PDF ડાઉનલોડ નિષ્ફળ થયું (Status: ' + response.status + ')');
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `weather-issue-report-${from}-${to}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        } catch (err) {
            alert((currentLang === 'en' ? 'Error downloading PDF: ' : 'PDF ડાઉનલોડ કરવામાં ભૂલ આવી: ') + (err.message || 'Error'));
        } finally {
            setDownloadingPdf(false);
        }
    };

    return <div className="reports-page">
        <section className="panel report-filter"><div className="segment">{[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([key, label]) => <button className={period === key ? 'active' : ''} onClick={() => setPeriod(key)} key={key}>{label}</button>)}</div><DatePicker label="From" value={from} onChange={setFrom}/><DatePicker label="To" value={to} onChange={setTo} align="right"/><button className="primary" onClick={load}>Apply</button></section>
        {error && <div className="error">{error}</div>}
        {/* 🌧️ ⚡ Weather & Issue Analysis Report Panel with PDF Export */}
        {(weatherIssueData || weatherIssueLoading) && (
            <section className="weather-issue-card">
                <div className="weather-card-top">
                    <div
                        className="weather-card-title-wrap"
                        onClick={() => setWeatherReportOpen(!weatherReportOpen)}
                        title={weatherReportOpen ? 'Click to hide details' : 'Click to view daily details'}
                    >
                        <div className="weather-icon-bubble">
                            <CloudRain size={20}/>
                        </div>
                        <div style={{flex: 1}}>
                            <div className="weather-title-row">
                                <h3 className="weather-title">Weather Report</h3>
                                <span className={`weather-toggle-pill ${weatherReportOpen ? 'open' : ''}`}>
                                    {weatherReportOpen ? (
                                        <><ChevronUp size={12}/> {currentLang === 'en' ? 'Close' : 'બંધ કરો'}</>
                                    ) : (
                                        <><ChevronDown size={12}/> {currentLang === 'en' ? 'View' : 'જુઓ'}</>
                                    )}
                                </span>
                            </div>
                            <p className="weather-subtitle">
                                {currentLang === 'en'
                                    ? 'Date-wise root cause analysis for low generation (Rain 🌧️, Curtailment ⚡, Inverter 🔌, Dust 🧼).'
                                    : 'તારીખવાર ઓછા ઉત્પાદનનું કારણ (વરસાદ 🌧️, PGVCL કટ ⚡, ઇન્વર્ટર 🔌 કે ધૂળ 🧼) અને વિશ્લેષણ.'}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="weather-pdf-btn"
                        disabled={downloadingPdf}
                        onClick={handleDownloadPdf}
                    >
                        <FileText size={14}/>
                        <span>{downloadingPdf ? (currentLang === 'en' ? 'Downloading...' : 'ડાઉનલોડ...') : 'Weather Report'}</span>
                    </button>
                </div>

                {weatherIssueData && (
                    <div className="weather-badges-grid">
                        <span className="weather-badge badge-normal">
                            🟢 {currentLang === 'en' ? 'Normal: ' : 'સામાન્ય: '}<b>{weatherIssueData.normal_days} {currentLang === 'en' ? 'Days' : 'દિવસ'}</b>
                        </span>
                        <span className="weather-badge badge-low">
                            🔴 {currentLang === 'en' ? 'Low: ' : 'ઓછા યુનિટ્સ: '}<b>{weatherIssueData.low_days} {currentLang === 'en' ? 'Days' : 'દિવસ'}</b>
                        </span>
                        {weatherIssueData.missing_days > 0 && (
                            <span className="weather-badge badge-pending">
                                ⏳ {currentLang === 'en' ? 'Pending: ' : 'ચાલુ/બાકી: '}<b>{weatherIssueData.missing_days} {currentLang === 'en' ? 'Days' : 'દિવસ'}</b>
                            </span>
                        )}
                        <span className="weather-badge badge-expected">
                            ⚡ {currentLang === 'en' ? 'Expected: ~' : 'અપેક્ષિત: ~'}<b>{number(weatherIssueData.expected_daily_units)} kWh/{currentLang === 'en' ? 'Day' : 'દિવસ'}</b>
                        </span>
                    </div>
                )}

                {weatherIssueLoading && !weatherIssueData && (
                    <div style={{padding: '12px', textAlign: 'center', color: '#0f766e', fontSize: '11.5px', fontWeight: 600}}>
                        {currentLang === 'en' ? 'Analyzing Weather & Issues...' : 'વિશ્લેષણ ડેટા તૈયાર થઈ રહ્યો છે... (Analyzing Weather & Issues...)'}
                    </div>
                )}

                {/* Table preview with interactive filter (Only rendered when weatherReportOpen is true) */}
                {weatherReportOpen && weatherIssueData?.rows?.length > 0 && (
                    <div style={{marginTop: '12px', background: '#ffffff', borderRadius: '8px', padding: '10px', border: '1px solid #ccfbf1'}}>
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px'}}>
                            <span style={{fontSize: '12px', fontWeight: 700, color: '#0f766e'}}>
                                {currentLang === 'en' ? 'Daily Analysis Sheet' : 'દૈનિક વિશ્લેષણ પત્રક'} ({shortDate(weatherIssueData.from)} {currentLang === 'en' ? 'to' : 'થી'} {shortDate(weatherIssueData.to)}):
                            </span>
                            <div style={{display: 'flex', gap: '4px'}}>
                                <button
                                    type="button"
                                    onClick={() => setFilterOnlyIssues(false)}
                                    style={{
                                        fontSize: '10.5px',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        border: !filterOnlyIssues ? '1.5px solid #0f766e' : '1px solid #cbd5e1',
                                        background: !filterOnlyIssues ? '#ccfbf1' : '#ffffff',
                                        color: !filterOnlyIssues ? '#0f766e' : '#64748b',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {currentLang === 'en' ? 'All Days' : 'બધા દિવસો'} ({weatherIssueData.rows.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFilterOnlyIssues(true)}
                                    style={{
                                        fontSize: '10.5px',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        border: filterOnlyIssues ? '1.5px solid #ea580c' : '1px solid #cbd5e1',
                                        background: filterOnlyIssues ? '#ffedd5' : '#ffffff',
                                        color: filterOnlyIssues ? '#c2410c' : '#64748b',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    ⚠️ {currentLang === 'en' ? 'Low Units Only' : 'માત્ર ઓછા યુનિટ્સ'} ({weatherIssueData.low_days})
                                </button>
                            </div>
                        </div>

                        <div className="table-wrap" style={{maxHeight: '420px', overflowY: 'auto'}}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>{currentLang === 'en' ? 'Date' : 'તારીખ'}</th>
                                        <th>{currentLang === 'en' ? 'Generation (kWh)' : 'ઉત્પાદન (kWh)'}</th>
                                        <th>{currentLang === 'en' ? 'Status' : 'સ્થિતિ'}</th>
                                        <th>{currentLang === 'en' ? 'Issue / Reason & Inverters' : 'ઓછા યુનિટનું કારણ અને ઇન્વર્ટર વિગત'}</th>
                                        <th>{currentLang === 'en' ? 'Analysis' : 'વિગતવાર વિશ્લેષણ (Analysis)'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {weatherIssueData.rows
                                        .filter(r => !filterOnlyIssues || r.status === 'low')
                                        .map(r => (
                                            <tr key={r.date} style={{background: r.status === 'low' ? '#fffaf5' : '#ffffff'}}>
                                                <td className="strong" style={{whiteSpace: 'nowrap'}}>
                                                    {shortDate(r.date)}
                                                    <div style={{fontSize: '10px', color: '#94a3b8', fontWeight: 500}}>{r.day_name}</div>
                                                </td>
                                                <td>
                                                    <b style={{color: r.status === 'low' ? '#ea580c' : '#16a34a', fontSize: '12px'}}>
                                                        {number(r.generation)}
                                                    </b>
                                                    <div style={{fontSize: '9.5px', color: '#64748b'}}>({r.pct_of_expected}%)</div>
                                                </td>
                                                <td>
                                                    {r.status === 'normal' ? (
                                                        <span style={{background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700, whiteSpace: 'nowrap'}}>
                                                            🟢 {currentLang === 'en' ? 'Normal' : 'સામાન્ય'}
                                                        </span>
                                                    ) : r.status === 'low' ? (
                                                        <span style={{background: '#ffedd5', color: '#9a3412', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700, whiteSpace: 'nowrap'}}>
                                                            🔴 Low Units
                                                        </span>
                                                    ) : (
                                                        <span style={{background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 600, whiteSpace: 'nowrap'}}>
                                                            {r.badge || '⚪ No Entry'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{minWidth: '220px'}}>
                                                    <b style={{color: '#1e293b', fontSize: '11.5px', display: 'block'}}>{r.reason}</b>
                                                    {r.inverters?.length > 0 && (
                                                        <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px'}}>
                                                            {r.inverters.map(inv => (
                                                                <span key={inv.name} style={{fontSize: '9.5px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1px 5px', borderRadius: '3px', color: '#475569'}}>
                                                                    {inv.name}: <b>{number(inv.generation)}</b> kWh
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{fontSize: '11px', color: '#475569', minWidth: '180px', lineHeight: 1.4}}>
                                                    {r.details}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </section>
        )}

        {reportLoading && !data && (
            <div className="panel" style={{textAlign: 'center', padding: '16px', color: '#0f766e', fontWeight: 600}}>
                {currentLang === 'en' ? 'Loading Report...' : 'રિપોર્ટ લોડ થઈ રહ્યો છે... (Loading Report...)'}
            </div>
        )}

        {data && <>
                <section className="panel daily-ss-panel"><div className="panel-head"><div><h2>Daily SS report</h2><p>Common Daily SS values use only <strong className="report-highlight-pill">{data.ss_reference?.company || 'the configured reference company'}</strong> 66kV Sub Import Unit. Every authorized company login receives the same report.</p></div><div className="export-actions"><a className="secondary daily-ss-download-btn" href={`/api/report/export/daily-ss-excel?${dailySsQuery}`}><FileSpreadsheet size={16}/>Download Excel</a></div></div></section>
                {data.ss_reference?.missing_dates?.length > 0 && <div className="warning-banner"><b>Missing {data.ss_reference?.company} entries</b><span>Daily SS and combined 66kV Sub Import count 0.00 on: {(data.ss_reference?.missing_dates || []).map(shortDate).join(', ')}. Other companies are not used as a fallback.</span></div>}
            
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
            <section className="panel">
                <div className="panel-head" style={{alignItems: 'center'}}>
                    <div>
                        <h2>{period[0].toUpperCase() + period.slice(1)} totals</h2>
                        <p>{shortDate(data.from)} to {shortDate(data.to)} · {data.is_combined ? 'Combined companies' : 'Selected company'}</p>
                    </div>
                    <div className="export-actions">
                        <button
                            type="button"
                            className="secondary view-toggle-btn"
                            onClick={() => setViewMode(v => v === 'cards' ? 'table' : 'cards')}
                            title="Toggle between Card view and Table view"
                        >
                            {viewMode === 'cards' ? <Table size={15}/> : <LayoutGrid size={15}/>}
                            <span>{viewMode === 'cards' ? 'Table View' : 'Card View'}</span>
                        </button>
                        <a className="secondary" href={`/api/report/export/excel?${query}`}><FileSpreadsheet size={16}/>Excel</a>
                        <a className="secondary" href={`/api/report/export/pdf?${query}`}><FileText size={16}/>PDF</a>
                    </div>
                </div>
                {data.rows.length ? (
                    viewMode === 'cards' ? (
                        <div className="report-cards-grid">
                            {data.rows.map(row => (
                                <div key={row.period} className="report-period-card">
                                    <div className="rp-card-header">
                                        <div>
                                            <b className="rp-date">{period === 'monthly' ? row.period : shortDate(row.period)}</b>
                                            {data.is_combined && <small className="rp-sub">{row.company_count} Companies</small>}
                                        </div>
                                        <div className="rp-gen-badge">
                                            <small>Total Gen</small>
                                            <b>{number(row.generation)} kWh</b>
                                        </div>
                                    </div>
                                    {METERS.some(([key]) => row[key] !== undefined && row[key] !== null) && (
                                        <div className="rp-meters-grid">
                                            {METERS.map(([key, label]) => (
                                                row[key] !== undefined && row[key] !== null ? (
                                                    <div key={key} className="rp-meter-chip">
                                                        <small>{label}</small>
                                                        <b>{number(row[key])}</b>
                                                    </div>
                                                ) : null
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>{period === 'weekly' ? 'Week starting' : period === 'monthly' ? 'Month' : 'Date'}</th>
                                        {data.is_combined && <th>Companies</th>}
                                        <th>All Inverter Total</th>
                                        {METERS.map(([, label]) => <th key={label}>{label}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(row => (
                                        <tr key={row.period}>
                                            <td className="strong">{period === 'monthly' ? row.period : shortDate(row.period)}</td>
                                            {data.is_combined && <td>{row.company_count}</td>}
                                            <td>{number(row.generation)}</td>
                                            {METERS.map(([key]) => <td key={key}>{number(row[key])}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : (
                    <Empty title="No report data" detail="No readings were found in the selected date range."/>
                )}
            </section>
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
    const [totalsMode, setTotalsMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= 768 ? 'cards' : 'table'));

    return (
        <section className="panel">
            <div className="panel-head" style={{alignItems: 'center'}}>
                <div>
                    <h2>{title}</h2>
                    <p>Totals for the selected date range.</p>
                </div>
                <button
                    type="button"
                    className="secondary view-toggle-btn"
                    onClick={() => setTotalsMode(m => m === 'cards' ? 'table' : 'cards')}
                    style={{fontSize: '11px', padding: '5px 10px'}}
                    title="Toggle between Card view and Table view"
                >
                    {totalsMode === 'cards' ? <Table size={14}/> : <LayoutGrid size={14}/>}
                    <span>{totalsMode === 'cards' ? 'Table View' : 'Card View'}</span>
                </button>
            </div>
            {totalsMode === 'cards' ? (
                <div className="report-cards-grid">
                    {rows.map((row, index) => {
                        const nameKey = columns.find(([key]) => key === 'company' || key === 'inverter')?.[0] || columns[0][0];
                        const valColumns = columns.filter(([key]) => key !== nameKey);
                        return (
                            <div key={row.company_id || row.inverter_id || index} className="report-period-card">
                                <div className="rp-card-header">
                                    <b className="rp-date" style={{fontSize: '13.5px'}}>{row[nameKey]}</b>
                                </div>
                                <div className="rp-meters-grid">
                                    {valColumns.map(([key, label]) => (
                                        <div key={key} className="rp-meter-chip">
                                            <small>{label}</small>
                                            <b>{number(row[key])}</b>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => (
                                <tr key={row.company_id || row.inverter_id || index}>
                                    {columns.map(([key]) => (
                                        <td className={key === 'company' || key === 'inverter' ? 'strong' : ''} key={key}>
                                            {key === 'company' || key === 'inverter' ? row[key] : number(row[key])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
