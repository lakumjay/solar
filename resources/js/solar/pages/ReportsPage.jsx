import React, {useEffect, useState} from 'react';
import {FileSpreadsheet, FileText, Sun} from 'lucide-react';
import {api} from '../api';
import {METERS, monthStart, today} from '../config';
import {number, shortDate} from '../format';
import {DatePicker, Empty, Metric} from '../components/Common';

export default function ReportsPage({companyId}) {
    const [period, setPeriod] = useState('daily');
    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(today());
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const load = () => {
        setError('');
        api(`report?company_id=${companyId}&period=${period}&date_from=${from}&date_to=${to}`).then(setData).catch(error => setError(error.message));
    };

    useEffect(load, [companyId, period]);
    const query = new URLSearchParams({company_id: companyId, period, date_from: from, date_to: to}).toString();

    return <>
        <section className="panel report-filter"><div className="segment">{[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([key, label]) => <button className={period === key ? 'active' : ''} onClick={() => setPeriod(key)} key={key}>{label}</button>)}</div><DatePicker label="From" value={from} onChange={setFrom}/><DatePicker label="To" value={to} onChange={setTo} align="right"/><button className="primary" onClick={load}>Apply</button></section>
        {error && <div className="error">{error}</div>}
        {data && <>
            <div className="cards five compact"><Metric icon={Sun} title="All Inverter Total" value={data.grand_total.generation} unit="kWh" color="amber"/>{METERS.map(([key, label]) => <Metric key={key} title={label} value={data.grand_total[key]}/>)}</div>
            <section className="panel"><div className="panel-head"><div><h2>{period[0].toUpperCase() + period.slice(1)} totals</h2><p>{shortDate(data.from)} to {shortDate(data.to)} · {data.is_combined ? 'Combined companies' : 'Selected company'}</p></div><div className="export-actions"><a className="secondary" href={`/api/report/export/excel?${query}`}><FileSpreadsheet size={16}/>Excel</a><a className="secondary" href={`/api/report/export/pdf?${query}`}><FileText size={16}/>PDF</a></div></div>{data.rows.length ? <div className="table-wrap"><table><thead><tr><th>{period === 'weekly' ? 'Week starting' : period === 'monthly' ? 'Month' : 'Date'}</th>{data.is_combined && <th>Companies</th>}<th>All Inverter Total</th>{METERS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.period}><td className="strong">{period === 'monthly' ? row.period : shortDate(row.period)}</td>{data.is_combined && <td>{row.company_count}</td>}<td>{number(row.generation)}</td>{METERS.map(([key]) => <td key={key}>{number(row[key])}</td>)}</tr>)}</tbody></table></div> : <Empty title="No report data" detail="No readings were found in the selected date range."/>}</section>
            {data.is_combined && <ReportTotals title="Company-wise totals" rows={data.company_totals} columns={[['company', 'Company'], ['generation', 'All Inverter Total'], ...METERS]}/>} 
            <ReportTotals title="Inverter-wise generation totals" rows={data.inverter_totals} columns={data.is_combined ? [['company', 'Company'], ['inverter', 'Inverter'], ['generation', 'Generation']] : [['inverter', 'Inverter'], ['generation', 'Generation']]}/>
        </>}
    </>;
}

function ReportTotals({title, rows, columns}) {
    if (!rows?.length) return null;

    return <section className="panel"><div className="panel-head"><div><h2>{title}</h2><p>Totals for the selected date range.</p></div></div><div className="table-wrap"><table><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.company_id || row.inverter_id || index}>{columns.map(([key]) => <td className={key === 'company' || key === 'inverter' ? 'strong' : ''} key={key}>{key === 'company' || key === 'inverter' ? row[key] : number(row[key])}</td>)}</tr>)}</tbody></table></div></section>;
}
