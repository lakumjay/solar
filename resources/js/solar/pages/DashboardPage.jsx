import React, {useEffect, useState} from 'react';
import {Sun} from 'lucide-react';
import {api} from '../api';
import {METERS} from '../config';
import {number} from '../format';
import {Empty, Loading, Metric, ReadingTable} from '../components/Common';

export default function DashboardPage({companyId}) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        setData(null);
        setError('');
        api(`dashboard?company_id=${companyId}`).then(setData).catch(error => setError(error.message));
    }, [companyId]);

    if (error) return <Empty title="Could not load dashboard" detail={error}/>;
    if (!data) return <Loading/>;

    return <>
        <div className="summary-label"><span>Today</span><small>{new Date().toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'})}</small></div>
        <div className="cards five"><Metric icon={Sun} title="All Inverter Total" value={data.today.generation} unit="kWh" color="amber"/><Metric title="Plant import" value={data.today.plant_import}/><Metric title="Plant export" value={data.today.plant_export}/><Metric title="66kV import" value={data.today.sub_import}/><Metric title="66kV export" value={data.today.sub_export}/></div>
        <section className="panel monthly-strip"><div><span>This Month All Inverter Total</span><strong>{number(data.month.generation)} <small>kWh</small></strong></div>{METERS.map(([key, label]) => <div key={key}><span>{label}</span><strong>{number(data.month[key])}</strong></div>)}</section>
        <section className="panel"><div className="panel-head"><div><h2>Recent entries</h2><p>{data.is_combined ? 'Latest activity across all companies' : 'Latest saved daily readings'}</p></div></div><ReadingTable rows={data.rows} showCompany={data.is_combined}/></section>
    </>;
}
