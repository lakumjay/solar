import React, {useEffect, useMemo, useRef, useState} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight, Factory, Sun} from 'lucide-react';
import {number, shortDate} from '../format';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
    const today = isoDate(new Date());
    const displayValue = selected
        ? selected.toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'})
        : 'Select date';

    return <div className={`date-picker ${align === 'right' ? 'align-right' : ''}`} ref={root}>
        <span className="date-picker-label">{label}</span>
        <button type="button" className={open ? 'date-picker-trigger open' : 'date-picker-trigger'} onClick={() => setOpen(current => !current)} aria-haspopup="dialog" aria-expanded={open}>
            <CalendarDays size={18}/><span>{displayValue}</span>
        </button>
        {open && <div className="calendar-popover" role="dialog" aria-label={`${label} calendar`}>
            <div className="calendar-header">
                <button type="button" onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={18}/></button>
                <strong>{visibleMonth.toLocaleDateString('en-GB', {month: 'long', year: 'numeric'})}</strong>
                <button type="button" onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={18}/></button>
            </div>
            <div className="calendar-weekdays">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
            <div className="calendar-grid">{days.map(day => {
                const key = isoDate(day);
                const classes = ['calendar-day'];
                if (day.getMonth() !== visibleMonth.getMonth()) classes.push('outside');
                if (key === value) classes.push('selected');
                if (key === today) classes.push('today');

                return <button type="button" className={classes.join(' ')} key={key} onClick={() => select(day)} aria-label={day.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'})} aria-pressed={key === value}>{day.getDate()}</button>;
            })}</div>
            <div className="calendar-footer"><button type="button" onClick={() => select(new Date())}>Today</button></div>
        </div>}
    </div>;
}

export function Field({label, suffix, children}) {
    return <label className="field"><span>{label}</span><div>{children}{suffix && <small>{suffix}</small>}</div></label>;
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
