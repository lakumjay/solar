import React, {useEffect, useMemo, useRef, useState} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight, Factory, Sun, Sparkles} from 'lucide-react';
import {number, shortDate} from '../format';
import {GUJARATI_WEEKDAYS, ENGLISH_WEEKDAYS, GUJARATI_MONTHS, getPanchangDetails, toGujaratiDigits} from '../utils/panchang';
import {getLanguage, t} from '../utils/translations';

function parseDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);

    return new Date(year, month - 1, day);
}

function isoDate(value) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function DatePicker({label, value, onChange, align = 'left'}) {
    const selected = parseDate(value);
    const root = useRef(null);
    const [open, setOpen] = useState(false);
    const [visibleMonth, setVisibleMonth] = useState(() => selected ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date());

    useEffect(() => {
        if (selected) setVisibleMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }, [value]);

    useEffect(() => {
        if (!open) return undefined;
        const close = event => {
            if (!root.current?.contains(event.target)) setOpen(false);
        };
        const escape = event => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', escape);

        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);

    const days = useMemo(() => {
        const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
        const mondayOffset = (first.getDay() + 6) % 7;
        const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);

        return Array.from({length: 42}, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
    }, [visibleMonth]);

    const select = date => {
        onChange(isoDate(date));
        setOpen(false);
    };
    const todayObj = new Date();
    const today = isoDate(todayObj);
    const todayPanchang = getPanchangDetails(selected || todayObj);

    const [currentLang, setCurrentLang] = useState(getLanguage());
    useEffect(() => {
        const handleLang = (e) => setCurrentLang(e.detail);
        window.addEventListener('solarflow_language_change', handleLang);
        return () => window.removeEventListener('solarflow_language_change', handleLang);
    }, []);

    const isEn = currentLang === 'en';
    const displayValue = selected
        ? `${selected.toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'})} (${isEn ? todayPanchang.dayNameEn : todayPanchang.dayNameGu})`
        : (isEn ? 'Select date' : 'તારીખ પસંદ કરો');

    const gujaratiMonthName = GUJARATI_MONTHS[visibleMonth.getMonth()];
    const englishMonthName = visibleMonth.toLocaleDateString('en-GB', {month: 'long', year: 'numeric'});

    return <div className={`date-picker ${align === 'right' ? 'align-right' : ''}`} ref={root}>
        <span className="date-picker-label">{label}</span>
        <button
            type="button"
            className={open ? 'date-picker-trigger open' : 'date-picker-trigger'}
            onClick={() => setOpen(current => !current)}
            aria-haspopup="dialog"
            aria-expanded={open}
            style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'}}
        >
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                <CalendarDays size={18} style={{color: '#15803d', flexShrink: 0}}/>
                <span style={{fontWeight: 700, color: '#0f291e', fontSize: '13px'}}>{displayValue}</span>
            </div>
            {todayPanchang.festivalName && (
                <span style={{background: '#fef3c7', color: '#b45309', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', border: '1px solid #fde68a'}}>
                    {todayPanchang.festivalIcon || '✨'} {todayPanchang.festivalName}
                </span>
            )}
        </button>

        {open && <div className="calendar-popover" role="dialog" aria-label={`${label} calendar`} style={{width: '330px', borderRadius: '16px', border: '1.5px solid #d1e7dd', boxShadow: '0 15px 35px rgba(0,0,0,0.12)'}}>
            {/* Calendar Header with Gujarati & English Month */}
            <div className="calendar-header" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #eef7f2'}}>
                <button
                    type="button"
                    onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                    aria-label="Previous month"
                    style={{width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #d1e7dd', background: '#f4faf6', color: '#15803d', display: 'grid', placeItems: 'center'}}
                >
                    <ChevronLeft size={16}/>
                </button>
                <div style={{textAlign: 'center'}}>
                    <b style={{fontSize: '14px', color: '#0f291e', display: 'block'}}>
                        {isEn ? englishMonthName : `${gujaratiMonthName} ${visibleMonth.getFullYear()}`}
                    </b>
                    <small style={{fontSize: '10px', color: '#64748b', fontWeight: 600}}>
                        {isEn ? `${gujaratiMonthName} ${visibleMonth.getFullYear()}` : englishMonthName}
                    </small>
                </div>
                <button
                    type="button"
                    onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                    aria-label="Next month"
                    style={{width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #d1e7dd', background: '#f4faf6', color: '#15803d', display: 'grid', placeItems: 'center'}}
                >
                    <ChevronRight size={16}/>
                </button>
            </div>

            {/* Weekdays Row */}
            <div className="calendar-weekdays" style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '4px'}}>
                {(isEn ? ENGLISH_WEEKDAYS : GUJARATI_WEEKDAYS).map((day, idx) => (
                    <span key={day} style={{fontSize: '11px', fontWeight: 800, color: idx === 6 ? '#dc2626' : '#15803d', padding: '4px 0'}}>
                        {day}
                    </span>
                ))}
            </div>

            {/* Calendar Days Grid with Tithi Subscripts */}
            <div className="calendar-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px'}}>
                {days.map(day => {
                    const key = isoDate(day);
                    const isOutside = day.getMonth() !== visibleMonth.getMonth();
                    const isSelected = key === value;
                    const isToday = key === today;
                    const panchang = getPanchangDetails(day);

                    return (
                        <button
                            type="button"
                            key={key}
                            onClick={() => select(day)}
                            style={{
                                height: '42px',
                                padding: '2px 1px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '8px',
                                border: isSelected ? '1.5px solid #15803d' : isToday ? '1.5px solid #3b82f6' : panchang.isBankHoliday && !isOutside ? '1px solid #fecaca' : '1px solid transparent',
                                background: isSelected ? 'linear-gradient(135deg, #16a34a, #15803d)' : isToday ? '#eff6ff' : isOutside ? '#f8fafc' : panchang.isSpecialTithi ? '#fefce8' : panchang.isBankHoliday ? '#fff5f5' : '#ffffff',
                                color: isSelected ? '#ffffff' : isOutside ? '#cbd5e1' : panchang.isBankHoliday ? '#dc2626' : '#1e293b',
                                cursor: 'pointer',
                                position: 'relative',
                                transition: 'all 0.1s ease'
                            }}
                            title={`${isEn ? panchang.dayNameEn : panchang.dayNameGu} - ${panchang.tithiFull}${panchang.festivalName ? ` (${panchang.festivalName})` : ''}${panchang.bankHolidayReason ? ` [${panchang.bankHolidayReason}]` : ''}`}
                        >
                            <span style={{fontSize: '12px', fontWeight: isSelected || isToday ? 800 : 700, lineHeight: 1.1}}>
                                {day.getDate()}
                            </span>
                            <span style={{fontSize: '8px', fontWeight: 600, color: isSelected ? '#dcfce7' : panchang.isSpecialTithi ? '#b45309' : panchang.isBankHoliday ? '#ef4444' : '#64748b', lineHeight: 1, marginTop: '2px', whiteSpace: 'nowrap'}}>
                                {panchang.festivalIcon ? panchang.festivalIcon : (isEn ? (panchang.isBankHoliday ? 'Off' : panchang.tithiName.slice(0, 4)) : (panchang.isEkadashi ? 'અગિ.' : panchang.isPoonam ? 'પૂનમ' : panchang.isAmavasya ? 'અમાસ' : panchang.tithiName.slice(0, 3)))}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Selected Date Panchang & Holiday Detail Footer */}
            <div style={{marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #eef7f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '11px'}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                    <span style={{color: '#15803d', fontWeight: 700}}>
                        🗓️ {todayPanchang.tithiFull} {todayPanchang.festivalName ? `• ${todayPanchang.festivalName}` : ''}
                    </span>
                    {todayPanchang.isBankHoliday && (
                        <span style={{color: '#dc2626', fontWeight: 800, fontSize: '10px'}}>
                            🏦 {todayPanchang.bankHolidayReason}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => select(new Date())}
                    style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid #16a34a',
                        background: '#f0fdf4',
                        color: '#15803d',
                        fontWeight: 800,
                        fontSize: '11px',
                        cursor: 'pointer'
                    }}
                >
                    {isEn ? 'Today' : 'આજે'}
                </button>
            </div>
        </div>}
    </div>;
}

export function Field({label, suffix, children}) {
    return (
        <label className="field">
            <span>{label}</span>
            <div className="field-control-wrap" style={{position: 'relative', width: '100%'}}>
                {children}
                {suffix && (
                    <span className="field-suffix-badge" style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontWeight: 800,
                        fontSize: '11px',
                        color: '#15803d',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '6px',
                        padding: '2px 8px',
                        pointerEvents: 'none',
                        zIndex: 10
                    }}>
                        {suffix}
                    </span>
                )}
            </div>
        </label>
    );
}

export function Metric({icon: Icon = Factory, title, value, unit = 'units', color = 'green'}) {
    return <article className={`metric ${color}`}><div className="metric-icon"><Icon size={20}/></div><span>{title}</span><strong>{number(value)}</strong><small>{unit}</small></article>;
}

export function ReadingTable({rows, showCompany = false, onEdit}) {
    if (!rows?.length) return <Empty title="No readings found" detail="Add a daily reading or change the selected period."/>;

    return <div className="table-wrap"><table><thead><tr><th>Date</th>{showCompany && <th>Company</th>}<th>All Inverter Total</th><th>Plant Import</th><th>Plant Export</th><th>66kV Import</th><th>66kV Export</th>{onEdit && <th/>}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className="strong">{shortDate(row.reading_date)}</td>{showCompany && <td>{row.company?.name}</td>}<td>{number((row.outputs || []).reduce((sum, output) => sum + Number(output.generation), 0))}</td><td>{row.plant_import_unit === null ? '—' : number(row.plant_import_unit)}</td><td>{row.plant_export_unit === null ? '—' : number(row.plant_export_unit)}</td><td>{row.sub_import_unit === null ? '—' : number(row.sub_import_unit)}</td><td>{row.sub_export_unit === null ? '—' : number(row.sub_export_unit)}</td>{onEdit && <td><button className="link" onClick={() => onEdit(row)}>Edit</button></td>}</tr>)}</tbody></table></div>;
}

export function Loading() {
    return <div className="app-loading inline"><Sun className="spin"/> Loading…</div>;
}

export function Empty({title, detail}) {
    return <div className="empty"><div><Sun/></div><h3>{title}</h3><p>{detail}</p></div>;
}
