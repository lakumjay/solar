import React, {useEffect, useState} from 'react';
import {api} from '../api';
import {Empty} from '../components/Common';

export default function ActivityLogPage({companyId}) {
    const [rows, setRows] = useState([]);

    useEffect(() => {
        api(`activity${companyId !== 'all' ? `?company_id=${companyId}` : ''}`).then(data => setRows(data.data));
    }, [companyId]);

    return <section className="panel"><div className="panel-head"><div><h2>Recent activity</h2><p>Company, user and daily reading changes.</p></div></div>{rows.length ? <div className="timeline">{rows.map(row => <div key={row.id}><span className="timeline-dot"/><div><b>{row.description}</b><p>{row.user?.name || 'System'} · {row.company?.name || 'Global'} · {new Date(row.created_at).toLocaleString('en-GB')}</p></div><i className="status on">{row.action}</i></div>)}</div> : <Empty title="No activity yet" detail="Changes will appear here after data is saved."/>}</section>;
}
