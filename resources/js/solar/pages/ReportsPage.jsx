import React, {useEffect, useState} from 'react';
import {FileSpreadsheet, FileText, Sun} from 'lucide-react';
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
            <section className="panel"><div className="panel-head"><div><h2>Daily SS report</h2><p>Common Daily SS values use only {data.ss_reference?.company || 'the configured reference company'} 66kV Sub Import Unit. Every authorized company login receives the same report.</p></div><div className="export-actions"><a className="secondary" href={`/api/report/export/daily-ss-excel?${dailySsQuery}`}><FileSpreadsheet size={16}/>Download Excel</a></div></div></section>
            {data.ss_reference?.missing_dates?.length > 0 && <div className="warning-banner"><b>Missing {data.ss_reference.company} entries</b><span>Daily SS and combined 66kV Sub Import count 0.00 on: {data.ss_reference.missing_dates.map(shortDate).join(', ')}. Other companies are not used as a fallback.</span></div>}
            <section className="panel company-report-builder">
                <div className="panel-head"><div><h2>Company-wise report</h2><p>Select the company and only the columns required in the Excel file. Date is always included.</p></div><div className="export-actions"><a className={reportCompanyId ? 'secondary' : 'secondary disabled'} href={reportCompanyId ? `/api/report/export/company-excel?${companyReportQuery}` : undefined}><FileSpreadsheet size={16}/>Generate Excel</a></div></div>
                <label className="company-report-select"><span>Company</span><select value={reportCompanyId} onChange={event => setReportCompanyId(event.target.value)}>{companies.map(company => <option value={company.id} key={company.id}>{company.name}</option>)}</select></label>
                <div className="report-column-groups">
                    <div><h3>Inverter generation</h3><div className="report-column-picker">{(selectedReportCompany?.inverters || []).map(inverter => <label key={inverter.id}><input type="checkbox" checked={inverterIds.includes(String(inverter.id))} onChange={event => toggle(inverterIds, setInverterIds, String(inverter.id), event.target.checked)}/><span>{inverter.name}</span></label>)}</div></div>
                    <div><h3>Meter readings and units</h3><div className="report-column-picker">{COMPANY_REPORT_COLUMNS.map(([key, label]) => <label key={key}><input type="checkbox" checked={meterColumns.includes(key)} onChange={event => toggle(meterColumns, setMeterColumns, key, event.target.checked)}/><span>{label}</span></label>)}</div></div>
                </div>
            </section>
            <div className="cards five compact"><Metric icon={Sun} title="All Inverter Total" value={data.grand_total.generation} unit="kWh" color="amber"/>{METERS.map(([key, label]) => <Metric key={key} title={label} value={data.grand_total[key]}/>)}</div>
            <section className="panel"><div className="panel-head"><div><h2>{period[0].toUpperCase() + period.slice(1)} totals</h2><p>{shortDate(data.from)} to {shortDate(data.to)} · {data.is_combined ? 'Combined companies' : 'Selected company'}</p></div><div className="export-actions"><a className="secondary" href={`/api/report/export/excel?${query}`}><FileSpreadsheet size={16}/>Excel</a><a className="secondary" href={`/api/report/export/pdf?${query}`}><FileText size={16}/>PDF</a></div></div>{data.rows.length ? <div className="table-wrap"><table><thead><tr><th>{period === 'weekly' ? 'Week starting' : period === 'monthly' ? 'Month' : 'Date'}</th>{data.is_combined && <th>Companies</th>}<th>All Inverter Total</th>{METERS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.period}><td className="strong">{period === 'monthly' ? row.period : shortDate(row.period)}</td>{data.is_combined && <td>{row.company_count}</td>}<td>{number(row.generation)}</td>{METERS.map(([key]) => <td key={key}>{number(row[key])}</td>)}</tr>)}</tbody></table></div> : <Empty title="No report data" detail="No readings were found in the selected date range."/>}</section>
            {data.is_combined && <ReportTotals title="Company-wise totals" rows={data.company_totals} columns={[['company', 'Company'], ['generation', 'All Inverter Total'], ...METERS]}/>} 
            <ReportTotals title="Inverter-wise generation totals" rows={data.inverter_totals} columns={data.is_combined ? [['company', 'Company'], ['inverter', 'Inverter'], ['generation', 'Generation']] : [['inverter', 'Inverter'], ['generation', 'Generation']]}/>
        </>}
    </div>;
}

function ReportTotals({title, rows, columns}) {
    if (!rows?.length) return null;

    return <section className="panel"><div className="panel-head"><div><h2>{title}</h2><p>Totals for the selected date range.</p></div></div><div className="table-wrap"><table><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.company_id || row.inverter_id || index}>{columns.map(([key]) => <td className={key === 'company' || key === 'inverter' ? 'strong' : ''} key={key}>{key === 'company' || key === 'inverter' ? row[key] : number(row[key])}</td>)}</tr>)}</tbody></table></div></section>;
}
