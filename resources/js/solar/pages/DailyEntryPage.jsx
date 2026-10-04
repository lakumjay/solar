import React, {useEffect, useMemo, useState} from 'react';
import {Zap, RefreshCw, CheckCircle2, AlertCircle} from 'lucide-react';
import {api} from '../api';
import {METERS, today} from '../config';
import {DatePicker, Empty, Field} from '../components/Common';
import {fixedTwo} from '../format';

export default function DailyEntryPage({company, canEdit = true}) {
    const [date, setDate] = useState(today());
    const [readings, setReadings] = useState({});
    const [outputs, setOutputs] = useState({});
    const [existing, setExisting] = useState(null);
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);
    const [syncingCloud, setSyncingCloud] = useState(false);
    const activeInverters = useMemo(() => company?.inverters.filter(inverter => inverter.active) || [], [company]);

    const [autoFetched, setAutoFetched] = useState(false);

    // Load existing readings or auto-fetch from cloud
    const loadDataForDate = async (targetDate) => {
        if (!company) return;
        setMessage(null);
        setExisting(null);
        setReadings({});
        setOutputs({});
        setAutoFetched(false);

        try {
            const result = await api(`readings?company_id=${company.id}&date_from=${targetDate}&date_to=${targetDate}`);
            const row = result.data?.[0];
            if (row) {
                setExisting(row);
                setReadings(Object.fromEntries(METERS.map(([key]) => [`${key}_reading`, row[`${key}_reading`] ?? ''])));
                const outMap = Object.fromEntries((row.outputs || []).map(output => [output.inverter_id, output.generation]));
                setOutputs(outMap);
            } else if (targetDate === today()) {
                // Auto fetch live generation for today if no entry yet
                await syncCloudGeneration(targetDate, false);
            }
        } catch (e) {
            console.error('Failed to load readings for date', e);
        }
    };

    const syncCloudGeneration = async (targetDate = date, overwriteManual = false) => {
        if (!company) return;
        setSyncingCloud(true);
        try {
            const syncResult = await api('isolarcloud/sync', {
                method: 'POST',
                body: JSON.stringify({company_id: company.id, date: targetDate}),
            });
            if (syncResult && syncResult.outputs) {
                setOutputs(prev => {
                    const merged = {...prev};
                    Object.entries(syncResult.outputs).forEach(([invId, gen]) => {
                        const cloudVal = parseFloat(gen) || 0;
                        const prevVal = parseFloat(merged[invId]) || 0;
                        // If previous value was manually entered > 0 and cloud is 0 (offline), keep manual value
                        if (!overwriteManual && prevVal > 0 && cloudVal <= 0) {
                            return;
                        }
                        merged[invId] = gen;
                    });
                    return merged;
                });
                setAutoFetched(true);
                setMessage({
                    type: 'success',
                    text: `iSolarCloud માંથી ઇન્વર્ટર જનરેશન સફળતાપૂર્વક મેળવી લીધું (${syncResult.synced_count || Object.keys(syncResult.outputs).length} ઇન્વર્ટર).`
                });
            }
        } catch (e) {
            setMessage({
                type: 'error',
                text: 'iSolarCloud સિંક કરવામાં સમસ્યા: ' + (e.message || 'Error')
            });
        } finally {
            setSyncingCloud(false);
        }
    };

    useEffect(() => {
        loadDataForDate(date);
    }, [company?.id, date]);

    if (!company) return <Empty title="Select a company" detail="Daily entries must belong to one company."/>;

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
            // Safe outputs payload: map all active inverters, default blank/missing to 0.00
            const safeOutputs = activeInverters.map(inverter => {
                const val = outputs[inverter.id];
                const numericGen = (val !== undefined && val !== '' && !isNaN(val)) ? parseFloat(val) : 0.00;
                return {
                    inverter_id: inverter.id,
                    generation: numericGen,
                };
            });

            const result = await api('readings', {
                method: 'POST',
                body: JSON.stringify({
                    company_id: company.id,
                    reading_date: date,
                    ...readings,
                    outputs: safeOutputs,
                }),
            });
            setExisting(result);
            setMessage({
                type: 'success',
                text: 'રીડિંગ સફળતાપૂર્વક સેવ થઈ ગયું છે. યુનિટ્સની ગણતરી અપડેટ થઈ ગઈ છે.'
            });
        } catch (exception) {
            setMessage({type: 'error', text: exception.message || 'સેવ કરવામાં ભૂલ આવી.'});
        } finally {
            setBusy(false);
        }
    };

    return <form className="entry" onSubmit={save}>
        <section className="panel entry-date">
            <div>
                <p className="step">STEP 1</p>
                <h2>તારીખ પસંદ કરો (Entry Date)</h2>
                <p>જો આ તારીખનો ડેટા પહેલેથી હશે, તો તે આપોઆપ એડિટિંગ માટે લોડ થશે.</p>
            </div>
            <DatePicker label="Entry date" value={date} onChange={setDate} align="right"/>
        </section>

        {existing && (
            <div className="info-banner" style={{background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af'}}>
                ℹ️ <b>આ તારીખની એન્ટ્રી પહેલેથી હાજર છે.</b> તમે નીચેના મીટર રીડિંગ્સ અથવા ઇન્વર્ટર યુનિટ્સ અપડેટ કરીને સેવ કરી શકો છો.
            </div>
        )}

        {autoFetched && !existing && (
            <div className="info-banner" style={{background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534'}}>
                ⚡ iSolarCloud માંથી લાઇવ ઇન્વર્ટર રીડિંગ્સ આપોઆપ લોડ થઈ ગયા છે!
            </div>
        )}

        <section className="panel">
            <div className="panel-head" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px'}}>
                <div>
                    <p className="step">STEP 2</p>
                    <h2>ઇન્વર્ટર દૈનિક ઉત્પાદન (Inverter Generation)</h2>
                    <p>ઓટો-સેવ થયેલા અથવા લાઇવ યુનિટ્સ (kWh). જો કોઈ ઇન્વર્ટર 0 હોય તો તમે જાતે મેન્યુઅલ લખી શકો છો.</p>
                </div>
                <button
                    type="button"
                    onClick={() => syncCloudGeneration(date, true)}
                    disabled={syncingCloud}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #0284c7',
                        background: '#f0f9ff',
                        color: '#0369a1',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: syncingCloud ? 'not-allowed' : 'pointer',
                    }}
                >
                    <RefreshCw size={14} className={syncingCloud ? 'spin' : ''}/>
                    <span>{syncingCloud ? 'સિંક થાય છે...' : '⚡ iSolarCloud માંથી યુનિટ્સ લાવો'}</span>
                </button>
            </div>

            <div className="form-grid">
                {activeInverters.map(inverter => {
                    const currentVal = outputs[inverter.id] ?? '';
                    const isZeroOrBlank = currentVal === '' || parseFloat(currentVal) === 0;

                    return (
                        <Field
                            key={inverter.id}
                            label={`${inverter.name} ${isZeroOrBlank ? '✏️ (મેન્યુઅલ એન્ટ્રી)' : ''}`}
                            suffix="kWh"
                        >
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={currentVal}
                                onChange={event => setOutputs({...outputs, [inverter.id]: event.target.value})}
                                onBlur={event => {
                                    if (event.target.value !== '') {
                                        setOutputs(current => ({...current, [inverter.id]: fixedTwo(event.target.value)}));
                                    }
                                }}
                            />
                        </Field>
                    );
                })}
            </div>
        </section>

        <section className="panel">
            <div className="panel-head">
                <div>
                    <p className="step">STEP 3</p>
                    <h2>કુલ મીટર રીડિંગ્સ (Cumulative meter readings)</h2>
                    <p>અગાઉના રીડિંગ × મલ્ટીપ્લાયરના આધારે પાવર યુનિટ્સની ગણતરી થશે.</p>
                </div>
            </div>
            <div className="form-grid">
                {METERS.map(([key, label]) => (
                    <Field key={key} label={`${label} Reading`} suffix="kWh">
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={readings[`${key}_reading`] ?? ''}
                            onChange={event => setReadings({...readings, [`${key}_reading`]: event.target.value})}
                            onBlur={event => setReadings(current => ({...current, [`${key}_reading`]: fixedTwo(event.target.value)}))}
                            required
                        />
                    </Field>
                ))}
            </div>
        </section>

        {message && <div className={message.type === 'success' ? 'success' : 'error'}>{message.text}</div>}

        <div className="form-actions">
            <span>બધા ૪ મીટર રીડિંગ્સ ફરજિયાત છે.</span>
            <button className="primary" disabled={busy}>
                {busy ? 'સેવ થઈ રહ્યું છે…' : existing ? 'અપડેટ કરો (Update & Recalculate)' : 'દૈનિક રીડિંગ સેવ કરો (Save Daily Reading)'}
            </button>
        </div>
    </form>;
}
