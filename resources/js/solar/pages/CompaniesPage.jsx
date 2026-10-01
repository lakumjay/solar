import React, {useEffect, useState} from 'react';
import {Building2, Eye, EyeOff, Factory, ImagePlus} from 'lucide-react';
import {api} from '../api';
import {METERS} from '../config';
import {Field} from '../components/Common';
import {fixedTwo} from '../format';

const blankCompany = {
    name: '',
    admin_email: '',
    password: '',
    logo_url: null,
    active: true,
    is_ss_reference: false,
    plant_import_multiplier: '600.00',
    plant_export_multiplier: '600.00',
    sub_import_multiplier: '5000.00',
    sub_export_multiplier: '5000.00',
};

export default function CompaniesPage({companies, refresh}) {
    const [selected, setSelected] = useState(null);
    const [form, setForm] = useState({...blankCompany});
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => () => {
        if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
    }, [logoPreview]);

    const resetLogo = preview => {
        setLogoFile(null);
        setLogoPreview(preview ?? null);
    };

    const choose = company => {
        setSelected(company);
        setForm({...company, password: ''});
        setShowPassword(false);
        resetLogo(company.logo_url);
        setMessage('');
    };

    const startNew = () => {
        setSelected(null);
        setForm({...blankCompany});
        setShowPassword(false);
        resetLogo(null);
        setMessage('');
    };

    const chooseLogo = event => {
        const file = event.target.files?.[0] ?? null;
        setLogoFile(file);
        setLogoPreview(file ? URL.createObjectURL(file) : form.logo_url);
    };

    const save = async event => {
        event.preventDefault();
        setMessage('');

        const payload = new FormData();
        if (form.id) payload.append('id', form.id);
        payload.append('name', form.name);
        payload.append('admin_email', form.admin_email);
        payload.append('password', form.password ?? '');
        payload.append('active', form.active ? '1' : '0');
        payload.append('is_ss_reference', form.is_ss_reference ? '1' : '0');
        METERS.forEach(([key]) => payload.append(`${key}_multiplier`, form[`${key}_multiplier`]));
        if (logoFile) payload.append('logo', logoFile);

        try {
            const saved = await api('companies', {method: 'POST', body: payload});
            setSelected(saved);
            setForm({...saved, password: ''});
            setShowPassword(false);
            resetLogo(saved.logo_url);
            setMessage('Company, logo and login saved. Historical units were recalculated.');
            await refresh();
        } catch (error) {
            setMessage(error.message);
        }
    };

    const saveInverter = async inverter => {
        await api('inverters', {method: 'POST', body: JSON.stringify(inverter)});
        const updatedCompanies = await refresh();
        const updated = updatedCompanies.find(company => company.id === selected.id);
        setSelected(updated);
        setForm(current => ({...current, ...updated, password: ''}));
    };

    return <>
        <ExpensePercentagePanel companies={companies} refresh={refresh}/>
        <div className="management-layout">
        <section className="panel management-list">
            <div className="panel-head"><div><h2>Companies</h2><p>{companies.length} configured</p></div><button type="button" className="icon-button" onClick={startNew}>+</button></div>
            {companies.map(company => <button type="button" className={selected?.id === company.id ? 'list-row active' : 'list-row'} onClick={() => choose(company)} key={company.id}>
                <span className="company-icon">{company.logo_url ? <img src={company.logo_url} alt=""/> : <Building2/>}</span>
                <span><b>{company.name}</b><small>{company.is_ss_reference ? 'Daily SS reference · ' : ''}{company.admin_email} · {company.inverters.filter(inverter => inverter.active).length} active inverters</small></span>
                <i className={company.active ? 'status on' : 'status'}>{company.active ? 'Active' : 'Inactive'}</i>
            </button>)}
        </section>
        <div>
            <form className="panel company-form" onSubmit={save}>
                <div className="panel-head"><div><h2>{form.id ? 'Edit company' : 'New company'}</h2><p>Company login, logo and four meter multipliers are managed together.</p></div></div>
                <div className="company-profile-fields">
                    <label className="company-logo-upload">
                        <span className="company-logo-preview">{logoPreview ? <img src={logoPreview} alt="Company logo preview"/> : <ImagePlus/>}</span>
                        <span><b>{logoFile?.name || (form.logo_url ? 'Change company logo' : 'Choose company logo')}</b><small>PNG, JPG or WebP · maximum 4 MB</small></span>
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} required={!form.id}/>
                    </label>
                    <div className="company-status-toggles">
                        <label className="toggle"><input type="checkbox" checked={Boolean(form.active)} disabled={Boolean(form.is_ss_reference)} onChange={event => setForm({...form, active: event.target.checked})}/><span/> Company active</label>
                        <label className="toggle"><input type="checkbox" checked={Boolean(form.is_ss_reference)} disabled={Boolean(selected?.is_ss_reference)} onChange={event => setForm({...form, is_ss_reference: event.target.checked, active: event.target.checked ? true : form.active})}/><span/> Daily SS reference company</label>
                    </div>
                </div>
                <div className="info-banner">Only one active company can be the Daily SS reference. Select this option on another active company to replace the current reference.</div>
                <div className="form-grid two">
                    <Field label="Company name"><input value={form.name} onChange={event => setForm({...form, name: event.target.value})} required/></Field>
                    <Field label="Company login email"><input type="email" value={form.admin_email ?? ''} onChange={event => setForm({...form, admin_email: event.target.value})} autoComplete="off" required/></Field>
                    <Field label={form.id ? 'New password (optional)' : 'Login password'}><input type={showPassword ? 'text' : 'password'} minLength="8" value={form.password ?? ''} onChange={event => setForm({...form, password: event.target.value})} autoComplete="new-password" required={!form.id}/><button type="button" className="password-visibility" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></Field>
                    {METERS.map(([key, label]) => <Field key={key} label={`${label} Unit Multiplier`}><input type="number" min="0" step="0.01" inputMode="decimal" value={form[`${key}_multiplier`]} onChange={event => setForm({...form, [`${key}_multiplier`]: event.target.value})} onBlur={event => setForm(current => ({...current, [`${key}_multiplier`]: fixedTwo(event.target.value)}))} required/></Field>)}
                </div>
                {message && <div className={message.includes('saved') ? 'success' : 'error'}>{message}</div>}
                <div className="form-actions"><span>Changing a multiplier recalculates all saved units for this company.</span><button className="primary">Save company</button></div>
            </form>
            {selected && <Inverters company={selected} save={saveInverter}/>} 
        </div>
        </div>
    </>;
}

function ExpensePercentagePanel({companies, refresh}) {
    const activeCompanies = companies.filter(company => company.active);
    const [percentages, setPercentages] = useState({});
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        setPercentages(Object.fromEntries(activeCompanies.map(company => [company.id, Number(company.expense_percentage || 0).toFixed(2)])));
    }, [companies]);
    const total = activeCompanies.reduce((sum, company) => sum + Number(percentages[company.id] || 0), 0);
    const valid = activeCompanies.length > 0 && Math.abs(total - 100) < 0.001;
    const save = async event => {
        event.preventDefault(); setBusy(true); setMessage('');
        try {
            await api('expense-percentages', {method: 'POST', body: JSON.stringify({percentages: activeCompanies.map(company => ({company_id: company.id, percentage: percentages[company.id] || 0}))})});
            await refresh(); setMessage('Expense percentages saved. New expenses will use this split.');
        } catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
    };

    return <form className="panel expense-percentage-panel" onSubmit={save}>
        <div className="panel-head"><div><h2>Shared expense percentages</h2><p>Set the company-wise split used for new common expenses. Historical entries keep their original split.</p></div><div className={valid ? 'expense-total valid' : 'expense-total'}><small>Total</small><strong>{total.toFixed(2)}%</strong></div></div>
        <div className="expense-percentage-grid">{activeCompanies.map(company => <Field label={company.name} suffix="%" key={company.id}><input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={percentages[company.id] ?? ''} onChange={event => setPercentages({...percentages, [company.id]: event.target.value})} onBlur={event => setPercentages(current => ({...current, [company.id]: fixedTwo(event.target.value)}))} required/></Field>)}</div>
        {message && <div className={message.includes('saved') ? 'success' : 'error'}>{message}</div>}
        <div className="form-actions"><span>{valid ? 'Ready for expense entry.' : 'The active-company total must equal exactly 100%.'}</span><button className="primary" disabled={!valid || busy}>{busy ? 'Saving…' : 'Save percentages'}</button></div>
    </form>;
}

function Inverters({company, save}) {
    const [name, setName] = useState('');

    return <section className="panel"><div className="panel-head"><div><h2>Inverters</h2><p>Daily entry fields follow the active inverter list.</p></div></div><div className="inverter-list">{company.inverters.map(inverter => <div key={inverter.id}><span className="company-icon"><Factory/></span><b>{inverter.name}</b><label className="toggle small"><input type="checkbox" checked={Boolean(inverter.active)} onChange={event => save({...inverter, active: event.target.checked})}/><span/>{inverter.active ? 'Active' : 'Inactive'}</label></div>)}</div><div className="inline-add"><input placeholder="e.g. Inverter 5" value={name} onChange={event => setName(event.target.value)}/><button type="button" className="secondary" onClick={async () => {if (!name.trim()) return; await save({company_id: company.id, name, active: true}); setName('');}}>Add inverter</button></div></section>;
}
