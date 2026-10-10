import React, {useEffect, useMemo, useState} from 'react';
import {Zap, RefreshCw, CheckCircle2, AlertCircle} from 'lucide-react';
import {api} from '../api';
import {METERS, today} from '../config';
import {DatePicker, Empty, Field} from '../components/Common';
import {fixedTwo} from '../format';
import { getLanguage, t } from '../utils/translations';

export default function DailyEntryPage({company: initialCompany, companies = [], companyId, setCompanyId, user, canEdit = true}) {
    const [currentLang, setCurrentLang] = useState(getLanguage());

    useEffect(() => {
        const handleLangChange = (e) => setCurrentLang(e.detail);
        window.addEventListener('solarflow_language_change', handleLangChange);
        return () => window.removeEventListener('solarflow_language_change', handleLangChange);
    }, []);
    const validCompanies = useMemo(() => companies.filter(c => String(c.id) !== 'all'), [companies]);
    const [selectedCompId, setSelectedCompId] = useState(() => {
        if (initialCompany && String(initialCompany.id) !== 'all') return String(initialCompany.id);
        if (validCompanies.length > 0) return String(validCompanies[0].id);
        return '';
    });

    const company = useMemo(() => {
        return validCompanies.find(c => String(c.id) === String(selectedCompId)) || initialCompany || validCompanies[0];
    }, [validCompanies, selectedCompId, initialCompany]);

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

    const isToday = date === today();

    const syncCloudGeneration = async (targetDate = date, overwriteManual = false) => {
        if (!company) return;
        if (targetDate !== today()) {
            setMessage({
                type: 'error',
                text: currentLang === 'en' ? `⚠️ iSolarCloud live auto-fetch is only available for today (${today()}). Live units will not overwrite past date (${targetDate}). Please enter past date units manually.` : `⚠️ iSolarCloud લાઈવ ઓટો-ફેચ માત્ર આજના દિવસ (${today()}) માટે જ ઉપલબ્ધ છે. જૂની તારીખ (${targetDate}) માં આજના લાઈવ યુનિટ્સ ઓવરરાઈટ નહીં થાય. કૃપા કરીને જૂની તારીખના યુનિટ્સ મેન્યુઅલી દાખલ કરો.`
            });
            return;
        }
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
                    text: currentLang === 'en' ? `Successfully fetched today's live units from iSolarCloud (${syncResult.synced_count || Object.keys(syncResult.outputs).length} inverters).` : `iSolarCloud માંથી આજના ઇન્વર્ટર લાઈવ યુનિટ્સ સફળતાપૂર્વક મેળવી લીધા (${syncResult.synced_count || Object.keys(syncResult.outputs).length} ઇન્વર્ટર).`
                });
            }
        } catch (e) {
            setMessage({
                type: 'error',
                text: (currentLang === 'en' ? 'Error syncing iSolarCloud: ' : 'iSolarCloud સિંક કરવામાં સમસ્યા: ') + (e.message || 'Error')
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
                text: currentLang === 'en' ? '✅ Reading saved successfully. Units calculated and updated.' : '✅ રીડિંગ સફળતાપૂર્વક સેવ થઈ ગયું છે. યુનિટ્સની ગણતરી અપડેટ થઈ ગઈ છે.'
            });

            setTimeout(() => setSaveSuccess(false), 4000);
        } catch (exception) {
            triggerHaptic([100, 50, 100]);
            setMessage({type: 'error', text: exception.message || (currentLang === 'en' ? 'Error saving reading.' : 'સેવ કરવામાં ભૂલ આવી.')});
        } finally {
            setBusy(false);
        }
    };

    return <form className="entry" onSubmit={save}>
        {companies.length > 1 && (user?.role === 'super_admin' || !user?.company_id) && (
            <div className="entry-company-picker">
                <span className="entry-company-label">
                    {currentLang === 'en' ? '🏢 Select Company:' : '🏢 કંપની પસંદ કરો (Company):'}
                </span>
                <div className="entry-company-pills">
                    {companies.filter(c => String(c.id) !== 'all').map(comp => {
                        const isSelected = String(comp.id) === String(company?.id);
                        return (
                            <button
                                key={comp.id}
                                type="button"
                                onClick={() => {
                                    setSelectedCompId(String(comp.id));
                                }}
                                className={`entry-company-pill ${isSelected ? 'active' : ''}`}
                            >
                                {isSelected ? '✓ ' : ''}{comp.name}
                            </button>
                        );
                    })}
                </div>
            </div>
        )}

        <section className="panel entry-date entry-step-card">
            <div>
                <p className="step entry-step-badge">STEP 1</p>
                <h2 className="entry-step-title">{currentLang === 'en' ? 'Select Date' : 'તારીખ પસંદ કરો (Entry Date)'}</h2>
                <p className="entry-step-desc">{currentLang === 'en' ? 'If data exists for this date, it will load automatically for editing.' : 'જો આ તારીખનો ડેટા પહેલેથી હશે, તો તે આપોઆપ એડિટિંગ માટે લોડ થશે.'}</p>
            </div>
            <DatePicker label="Entry date" value={date} onChange={setDate} align="right"/>
        </section>

        {existing && (
            <div className="info-banner entry-banner entry-banner-info">
                {currentLang === 'en' ? <>ℹ️ <b>Entry for this date already exists.</b> You can update meter readings or inverter units below.</> : <>ℹ️ <b>આ તારીખની એન્ટ્રી પહેલેથી હાજર છે.</b> તમે નીચેના મીટર રીડિંગ્સ અથવા ઇન્વર્ટર યુનિટ્સ અપડેટ કરીને સેવ કરી શકો છો.</>}
            </div>
        )}

        {autoFetched && !existing && (
            <div className="info-banner entry-banner entry-banner-success">
                {currentLang === 'en' ? '⚡ Live inverter readings loaded automatically from iSolarCloud!' : '⚡ iSolarCloud માંથી લાઇવ ઇન્વર્ટર રીડિંગ્સ આપોઆપ લોડ થઈ ગયા છે!'}
            </div>
        )}

        {message && (
            <div className={`entry-status-msg ${message.type === 'success' ? 'success' : 'error'}`}>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px', flex: 1}}>
                    {message.type === 'success' ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}
                    <span>{message.text}</span>
                </div>
                <button
                    type="button"
                    onClick={() => setMessage(null)}
                    className="entry-msg-close"
                    title="Dismiss"
                >
                    ✕
                </button>
            </div>
        )}

        <section className="panel entry-step-card">
            <div className="panel-head entry-step-head">
                <div>
                    <p className="step entry-step-badge">STEP 2</p>
                    <h2 className="entry-step-title">{currentLang === 'en' ? 'Inverter Daily Generation' : 'ઇન્વર્ટર દૈનિક ઉત્પાદન (Inverter Generation)'}</h2>
                    <p className="entry-step-desc">{currentLang === 'en' ? 'Auto-synced or live units (kWh). Total generation: ' : 'ઓટો-સેવ થયેલા અથવા લાઇવ યુનિટ્સ (kWh). કુલ અંદાજિત જનરેશન: '} <b className="entry-generation-highlight">{totalInverterGeneration} kWh</b></p>
                </div>
                {isToday ? (
                    <button
                        type="button"
                        onClick={() => {
                            triggerHaptic([30]);
                            syncCloudGeneration(date, true);
                        }}
                        disabled={syncingCloud}
                        className="entry-sync-btn"
                        title={currentLang === 'en' ? "Fetch today's live generation from iSolarCloud" : 'આજના દિવસનું લાઈવ ઉત્પાદન iSolarCloud માંથી મેળવો'}
                    >
                        <RefreshCw size={14} className={syncingCloud ? 'spin' : ''}/>
                        <span>{syncingCloud ? (currentLang === 'en' ? 'Syncing...' : 'સિંક થાય છે...') : (currentLang === 'en' ? "⚡ Fetch Today's Live Units" : '⚡ આજના લાઈવ યુનિટ્સ ફેચ કરો')}</span>
                    </button>
                ) : (
                    <div className="entry-past-badge">
                        <span>{currentLang === 'en' ? '🔒 Manual Entry Mode (Past Date)' : '🔒 મેન્યુઅલ એન્ટ્રી મોડ (ભૂતકાળની તારીખ)'}</span>
                    </div>
                )}
            </div>

            <div className="form-grid entry-inverters-grid">
                {activeInverters.map(inverter => {
                    const currentVal = outputs[inverter.id] ?? '';
                    const isZeroOrBlank = currentVal === '' || parseFloat(currentVal) === 0;
                    const isValidNumber = !isZeroOrBlank && !isNaN(parseFloat(currentVal));

                    return (
                        <Field
                            key={inverter.id}
                            label={`${inverter.name} ${isZeroOrBlank ? (currentLang === 'en' ? '✏️ (Manual)' : '✏️ (મેન્યુઅલ એન્ટ્રી)') : ''}`}
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
                                    <div className="input-valid-tick" title={currentLang === 'en' ? 'Valid Unit' : 'વેલિડ યુનિટ'}>
                                        <CheckCircle2 size={16}/>
                                    </div>
                                )}
                            </div>
                        </Field>
                    );
                })}
            </div>
        </section>

        <section className="panel entry-step-card">
            <div className="panel-head entry-step-head">
                <div>
                    <p className="step entry-step-badge">STEP 3</p>
                    <h2 className="entry-step-title">{currentLang === 'en' ? 'Cumulative Meter Readings' : 'કુલ મીટર રીડિંગ્સ (Cumulative meter readings)'}</h2>
                    <p className="entry-step-desc">{currentLang === 'en' ? 'Enter physical meter reading after 7:00 PM (Calculated with previous readings × multipliers).' : 'સાંજે ૭:૦૦ વાગ્યા પછી ફિઝિકલ મીટર રીડિંગ નાખો (અગાઉના રીડિંગ × મલ્ટીપ્લાયરના આધારે પાવર ગણાશે).'}</p>
                </div>
            </div>
            <div className="form-grid entry-meters-grid">
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
                                    <div className="input-valid-tick" title={currentLang === 'en' ? 'Meter reading valid' : 'મીટર રીડિંગ ઓકે'}>
                                        <CheckCircle2 size={16}/>
                                    </div>
                                )}
                            </div>
                        </Field>
                    );
                })}
            </div>
        </section>

        <div className="form-actions entry-sticky-actions">
            {message ? (
                <div className={`entry-footer-msg ${message.type === 'success' ? 'success' : 'error'}`}>
                    {message.type === 'success' ? <CheckCircle2 size={15}/> : <AlertCircle size={15}/>}
                    <span>{message.text}</span>
                </div>
            ) : (
                <span className="entry-actions-hint">{currentLang === 'en' ? 'Meter readings (if available, enter after 7:00 PM)' : 'મીટર રીડિંગ્સ (જો ઉપલબ્ધ હોય તો નાખો, સાંજે ૭:૦૦ પછી)'}</span>
            )}
            <button
                type="submit"
                className={`btn-morph-save ${busy ? 'saving' : ''} ${saveSuccess ? 'success' : ''}`}
                disabled={busy}
            >
                {busy ? (
                    <>
                        <RefreshCw size={15} className="spin"/>
                        <span>{currentLang === 'en' ? 'Saving…' : 'સેવ થઈ રહ્યું છે…'}</span>
                    </>
                ) : saveSuccess ? (
                    <>
                        <CheckCircle2 size={16}/>
                        <span>{currentLang === 'en' ? '✅ Saved Successfully!' : '✅ સફળતાપૂર્વક સેવ થઈ ગયું!'}</span>
                    </>
                ) : existing ? (
                    <>
                        <Zap size={15}/>
                        <span>{currentLang === 'en' ? 'Update & Recalculate' : 'અપડેટ કરો (Update & Recalculate)'}</span>
                    </>
                ) : (
                    <>
                        <Zap size={15}/>
                        <span>{currentLang === 'en' ? 'Save Daily Reading' : 'દૈનિક રીડિંગ સેવ કરો (Save Daily Reading)'}</span>
                    </>
                )}
            </button>
        </div>
    </form>;
}
