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
    const [autoFetched, setAutoFetched] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const activeInverters = useMemo(() => company?.inverters?.filter(inverter => inverter.active) || [], [company]);

    // Calculate total inverter generation preview
    const totalInverterGeneration = useMemo(() => {
        return Object.values(outputs).reduce((acc, v) => acc + (parseFloat(v) || 0), 0).toFixed(2);
    }, [outputs]);

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

    // Soft audio chime on successful save
    const playSuccessChime = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const now = ctx.currentTime;
            
            // Note 1 (E5)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(659.25, now);
            gain1.gain.setValueAtTime(0.12, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.3);

            // Note 2 (G#5)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(830.61, now + 0.1);
            gain2.gain.setValueAtTime(0.15, now + 0.1);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.1);
            osc2.stop(now + 0.5);

            // Note 3 (B5)
            const osc3 = ctx.createOscillator();
            const gain3 = ctx.createGain();
            osc3.type = 'sine';
            osc3.frequency.setValueAtTime(987.77, now + 0.2);
            gain3.gain.setValueAtTime(0.18, now + 0.2);
            gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
            osc3.connect(gain3);
            gain3.connect(ctx.destination);
            osc3.start(now + 0.2);
            osc3.stop(now + 0.6);
        } catch (e) {
            // Audio context not available or muted
        }
    };

    const triggerHaptic = (pattern = [40]) => {
        if (navigator.vibrate) {
            try {
                navigator.vibrate(pattern);
            } catch (e) {}
        }
    };

    const save = async event => {
        event.preventDefault();
        triggerHaptic([45]);
        setBusy(true);
        setMessage(null);
        setSaveSuccess(false);

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

            // Safe meter readings: default blank to 0.00
            const safeReadings = {};
            METERS.forEach(([key]) => {
                const val = readings[`${key}_reading`];
                safeReadings[`${key}_reading`] = (val !== undefined && val !== '' && !isNaN(val)) ? parseFloat(val) : 0.00;
            });

            const result = await api('readings', {
                method: 'POST',
                body: JSON.stringify({
                    company_id: company.id,
                    reading_date: date,
                    ...safeReadings,
                    outputs: safeOutputs,
                }),
            });

            setExisting(result);
            setSaveSuccess(true);
            playSuccessChime();
            triggerHaptic([50, 60, 120]);

            setMessage({
                type: 'success',
                text: '✅ રીડિંગ સફળતાપૂર્વક સેવ થઈ ગયું છે. યુનિટ્સની ગણતરી અપડેટ થઈ ગઈ છે.'
            });

            setTimeout(() => setSaveSuccess(false), 4000);
        } catch (exception) {
            triggerHaptic([100, 50, 100]);
            setMessage({type: 'error', text: exception.message || 'સેવ કરવામાં ભૂલ આવી.'});
        } finally {
            setBusy(false);
        }
    };

    return <form className="entry" onSubmit={save}>
        <section className="panel entry-date solar-glass-card" style={{borderRadius: '20px', padding: '20px', background: 'var(--glass-bg)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 8px 28px rgba(21,128,61,0.08)'}}>
            <div>
                <p className="step" style={{color: '#15803D', fontSize: '13px', fontWeight: '800', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 4px'}}>STEP 1</p>
                <h2 style={{color: '#14211A', fontSize: '17px', fontWeight: '700', margin: '0 0 4px'}}>તારીખ પસંદ કરો (Entry Date)</h2>
                <p style={{color: '#4B5C52', fontSize: '13px', margin: 0}}>જો આ તારીખનો ડેટા પહેલેથી હશે, તો તે આપોઆપ એડિટિંગ માટે લોડ થશે.</p>
            </div>
            <DatePicker label="Entry date" value={date} onChange={setDate} align="right"/>
        </section>

        {existing && (
            <div className="info-banner" style={{background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1E40AF', borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span>ℹ️ <b>આ તારીખની એન્ટ્રી પહેલેથી હાજર છે.</b> તમે નીચેના મીટર રીડિંગ્સ અથવા ઇન્વર્ટર યુનિટ્સ અપડેટ કરીને સેવ કરી શકો છો.</span>
            </div>
        )}

        {autoFetched && !existing && (
            <div className="info-banner" style={{background: '#ECFDF3', borderColor: '#86EFAC', color: '#166534', borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <Zap size={16} style={{color: '#16A34A', flexShrink: 0}}/>
                <span><b>iSolarCloud Sync:</b> લાઇવ ઇન્વર્ટર રીડિંગ્સ આપોઆપ લોડ થઈ ગયા છે.</span>
            </div>
        )}

        <section className="panel solar-glass-card accent-gen" style={{borderRadius: '20px', padding: '20px'}}>
            <div className="panel-head" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '16px'}}>
                <div>
                    <p className="step" style={{color: '#16A34A', fontSize: '13px', fontWeight: '800', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 4px'}}>STEP 2</p>
                    <h2 style={{color: '#14211A', fontSize: '17px', fontWeight: '700', margin: '0 0 4px'}}>ઇન્વર્ટર દૈનિક ઉત્પાદન (Inverter Generation)</h2>
                    <p style={{color: '#4B5C52', fontSize: '13px', margin: 0}}>ઓટો-સેવ થયેલા અથવા લાઇવ યુનિટ્સ (kWh). કુલ અંદાજિત જનરેશન: <b style={{color: '#15803D', fontFamily: 'var(--font-mono)'}}>{totalInverterGeneration} kWh</b></p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        triggerHaptic([30]);
                        syncCloudGeneration(date, true);
                    }}
                    disabled={syncingCloud}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: '12px',
                        border: '1px solid #0EA5E9',
                        background: '#F0F9FF',
                        color: '#0284C7',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: syncingCloud ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 8px rgba(14, 165, 233, 0.12)'
                    }}
                >
                    <RefreshCw size={14} className={syncingCloud ? 'spin' : ''}/>
                    <span>{syncingCloud ? 'સિંક થાય છે...' : 'iSolarCloud યુનિટ્સ લાવો'}</span>
                </button>
            </div>

            <div className="form-grid">
                {activeInverters.map(inverter => {
                    const currentVal = outputs[inverter.id] ?? '';
                    const isZeroOrBlank = currentVal === '' || parseFloat(currentVal) === 0;
                    const isValidNumber = !isZeroOrBlank && !isNaN(parseFloat(currentVal));

                    return (
                        <Field
                            key={inverter.id}
                            label={`${inverter.name} ${isZeroOrBlank ? '(મેન્યુઅલ)' : ''}`}
                            suffix="kWh"
                        >
                            <div className="smart-input-wrapper">
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
                                {isValidNumber && (
                                    <div className="input-valid-tick" title="વેલિડ યુનિટ">
                                        <CheckCircle2 size={16}/>
                                    </div>
                                )}
                            </div>
                        </Field>
                    );
                })}
            </div>
        </section>

        <section className="panel solar-glass-card accent-rev" style={{borderRadius: '20px', padding: '20px'}}>
            <div className="panel-head" style={{marginBottom: '16px'}}>
                <div>
                    <p className="step" style={{color: '#D97706', fontSize: '13px', fontWeight: '800', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 4px'}}>STEP 3</p>
                    <h2 style={{color: '#14211A', fontSize: '17px', fontWeight: '700', margin: '0 0 4px'}}>કુલ મીટર રીડિંગ્સ (Cumulative meter readings)</h2>
                    <p style={{color: '#4B5C52', fontSize: '13px', margin: 0}}>સાંજે ૭:૦૦ વાગ્યા પછી ફિઝિકલ મીટર રીડિંગ નાખો (અગાઉના રીડિંગ × મલ્ટીપ્લાયરના આધારે પાવર ગણાશે).</p>
                </div>
            </div>
            <div className="form-grid">
                {METERS.map(([key, label]) => {
                    const currentMeterVal = readings[`${key}_reading`] ?? '';
                    const isValidMeter = currentMeterVal !== '' && parseFloat(currentMeterVal) > 0;

                    return (
                        <Field key={key} label={`${label} Reading`} suffix="kWh">
                            <div className="smart-input-wrapper">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={currentMeterVal}
                                    onChange={event => setReadings({...readings, [`${key}_reading`]: event.target.value})}
                                    onBlur={event => {
                                        if (event.target.value !== '') {
                                            setReadings(current => ({...current, [`${key}_reading`]: fixedTwo(event.target.value)}));
                                        }
                                    }}
                                />
                                {isValidMeter && (
                                    <div className="input-valid-tick" title="મીટર રીડિંગ ઓકે">
                                        <CheckCircle2 size={16}/>
                                    </div>
                                )}
                            </div>
                        </Field>
                    );
                })}
            </div>
        </section>

        {message && (
            <div
                className={message.type === 'success' ? 'success' : 'error'}
                style={{
                    borderRadius: '14px',
                    padding: '12px 16px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}
            >
                {message.type === 'success' ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}
                <span>{message.text}</span>
            </div>
        )}

        <div className="form-actions" style={{
            position: 'sticky',
            bottom: 'calc(65px + env(safe-area-inset-bottom, 8px))',
            zIndex: 40,
            background: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid #D6E6D9',
            borderRadius: '16px',
            padding: '10px 16px',
            boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
        }}>
            <span style={{fontSize: '12px', color: '#4B5C52', fontWeight: 600}}>મીટર રીડિંગ્સ સાંજે ૭:૦૦ પછી ભરો</span>
            <button
                type="submit"
                className={`btn-morph-save btn-primary-glow ${busy ? 'saving' : ''} ${saveSuccess ? 'success' : ''}`}
                disabled={busy}
                style={{minHeight: '48px'}}
            >
                {busy ? (
                    <>
                        <RefreshCw size={16} className="spin"/>
                        <span>સેવ થઈ રહ્યું છે…</span>
                    </>
                ) : saveSuccess ? (
                    <>
                        <CheckCircle2 size={18}/>
                        <span>✅ સફળતાપૂર્વક સેવ થઈ ગયું!</span>
                    </>
                ) : existing ? (
                    <>
                        <Zap size={16}/>
                        <span>અપડેટ કરો (Update & Recalculate)</span>
                    </>
                ) : (
                    <>
                        <Zap size={16}/>
                        <span>દૈનિક રીડિંગ સેવ કરો (Save Daily Reading)</span>
                    </>
                )}
            </button>
        </div>
    </form>;
}
