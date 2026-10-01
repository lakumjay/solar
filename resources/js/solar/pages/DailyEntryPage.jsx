import React, {useEffect, useMemo, useState} from 'react';
import {Zap} from 'lucide-react';
import {api} from '../api';
import {METERS, today} from '../config';
import {DatePicker, Empty, Field} from '../components/Common';
import {fixedTwo} from '../format';

export default function DailyEntryPage({company, canEdit}) {
    const [date, setDate] = useState(today());
    const [readings, setReadings] = useState({});
    const [outputs, setOutputs] = useState({});
    const [existing, setExisting] = useState(null);
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);
    const activeInverters = useMemo(() => company?.inverters.filter(inverter => inverter.active) || [], [company]);

    const [autoFetched, setAutoFetched] = useState(false);

    useEffect(() => {
        if (!company) return;
        setMessage(null);
        setExisting(null);
        setReadings({});
        setOutputs({});
        setAutoFetched(false);

        api(`readings?company_id=${company.id}&date_from=${date}&date_to=${date}`).then(async result => {
            const row = result.data[0];
            if (row) {
                setExisting(row);
                setReadings(Object.fromEntries(METERS.map(([key]) => [`${key}_reading`, row[`${key}_reading`] ?? ''])));
                setOutputs(Object.fromEntries(row.outputs.map(output => [output.inverter_id, output.generation])));
            } else if (date === today()) {
                // Automatically fetch current live generation into inputs if no entry exists yet
                try {
                    const syncResult = await api('isolarcloud/sync', {
                        method: 'POST',
                        body: JSON.stringify({company_id: company.id, date}),
                    });
                    if (syncResult.synced_count > 0) {
                        setOutputs(syncResult.outputs);
                        setAutoFetched(true);
                    }
                } catch (e) {
                    console.log('Background live generation fetch', e);
                }
            }
        }).catch(() => {});
    }, [company?.id, date]);

    if (!company) return <Empty title="Select a company" detail="Daily entries must belong to one company."/>;

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
            const result = await api('readings', {
                method: 'POST',
                body: JSON.stringify({
                    company_id: company.id,
                    reading_date: date,
                    ...readings,
                    outputs: activeInverters.map(inverter => ({inverter_id: inverter.id, generation: outputs[inverter.id]})),
                }),
            });
            setExisting(result);
            setMessage({type: 'success', text: 'Reading saved. This date and every later unit were recalculated.'});
        } catch (exception) {
            setMessage({type: 'error', text: exception.message});
        } finally {
            setBusy(false);
        }
    };

    const locked = existing && !canEdit;
    return <form className="entry" onSubmit={save}>
        <section className="panel entry-date"><div><p className="step">STEP 1</p><h2>Select entry date</h2><p>If this date already exists, its values will load for editing.</p></div><DatePicker label="Entry date" value={date} onChange={setDate} align="right"/></section>
        {existing && <div className="info-banner">An entry already exists for this date. {locked ? 'Employees can add new daily entries but cannot edit or delete existing entries.' : 'Saving will update it and recalculate later dates.'}</div>}
        {autoFetched && !existing && <div className="info-banner" style={{background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534'}}>⚡ Current live inverter readings auto-loaded from iSolarCloud!</div>}
        <section className="panel">
            <div className="panel-head">
                <div>
                    <p className="step">STEP 2</p>
                    <h2>Daily inverter generation</h2>
                    <p>Live current generation loaded automatically in kWh.</p>
                </div>
            </div>
            <div className="form-grid">{activeInverters.map(inverter => <Field key={inverter.id} label={inverter.name} suffix="kWh"><input type="number" min="0" step="0.01" inputMode="decimal" value={outputs[inverter.id] ?? ''} onChange={event => setOutputs({...outputs, [inverter.id]: event.target.value})} onBlur={event => setOutputs(current => ({...current, [inverter.id]: fixedTwo(event.target.value)}))} disabled={locked} required/></Field>)}</div>
        </section>
        <section className="panel"><div className="panel-head"><div><p className="step">STEP 3</p><h2>Cumulative meter readings</h2><p>Units are calculated from the previous reading × the company multiplier.</p></div></div><div className="form-grid">{METERS.map(([key, label]) => <Field key={key} label={`${label} Reading`} suffix="kWh"><input type="number" min="0" step="0.01" inputMode="decimal" value={readings[`${key}_reading`] ?? ''} onChange={event => setReadings({...readings, [`${key}_reading`]: event.target.value})} onBlur={event => setReadings(current => ({...current, [`${key}_reading`]: fixedTwo(event.target.value)}))} disabled={locked} required/></Field>)}</div></section>
        {message && <div className={message.type === 'success' ? 'success' : 'error'}>{message.text}</div>}
        {!locked && <div className="form-actions"><span>All four meter readings are required.</span><button className="primary" disabled={busy}>{busy ? 'Saving…' : existing ? 'Update & recalculate' : 'Save daily reading'}</button></div>}
    </form>;
}
