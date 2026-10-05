import React, {useEffect, useState} from 'react';
import {Building2, Eye, EyeOff, Factory, ImagePlus} from 'lucide-react';
import {api} from '../api';
import {METERS} from '../config';
import {Field} from '../components/Common';
import {fixedTwo} from '../format';

const blankCompany = {
    name: '',
    owner_name: '',
    owner_designation: '',
    owner_photo_url: null,
    admin_email: '',
    password: '',
    logo_url: null,
    active: true,
    is_ss_reference: false,
    plant_location: 'Solar Plant, Gujarat',
    latitude: '22.3039',
    longitude: '70.8022',
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
    const [ownerPhotoFile, setOwnerPhotoFile] = useState(null);
    const [ownerPhotoPreview, setOwnerPhotoPreview] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => () => {
        if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
        if (ownerPhotoPreview?.startsWith('blob:')) URL.revokeObjectURL(ownerPhotoPreview);
    }, [logoPreview, ownerPhotoPreview]);

    const resetPhotos = (logo, ownerPhoto) => {
        setLogoFile(null);
        setLogoPreview(logo ?? null);
        setOwnerPhotoFile(null);
        setOwnerPhotoPreview(ownerPhoto ?? null);
    };

    const choose = company => {
        setSelected(company);
        setForm({...company, password: ''});
        setShowPassword(false);
        resetPhotos(company.logo_url, company.owner_photo_url);
        setMessage('');
    };

    const startNew = () => {
        setSelected(null);
        setForm({...blankCompany});
        setShowPassword(false);
        resetPhotos(null, null);
        setMessage('');
    };

    const chooseLogo = event => {
        const file = event.target.files?.[0] ?? null;
        setLogoFile(file);
        setLogoPreview(file ? URL.createObjectURL(file) : form.logo_url);
    };

    const chooseOwnerPhoto = event => {
        const file = event.target.files?.[0] ?? null;
        setOwnerPhotoFile(file);
        setOwnerPhotoPreview(file ? URL.createObjectURL(file) : form.owner_photo_url);
    };

    const save = async event => {
        event.preventDefault();
        setMessage('');

        const payload = new FormData();
        if (form.id) payload.append('id', form.id);
        payload.append('name', form.name);
        payload.append('owner_name', form.owner_name ?? '');
        payload.append('owner_designation', form.owner_designation ?? '');
        payload.append('admin_email', form.admin_email);
        payload.append('password', form.password ?? '');
        payload.append('active', form.active ? '1' : '0');
        payload.append('is_ss_reference', form.is_ss_reference ? '1' : '0');
        payload.append('plant_location', form.plant_location ?? '');
        payload.append('latitude', form.latitude ?? '');
        payload.append('longitude', form.longitude ?? '');
        METERS.forEach(([key]) => payload.append(`${key}_multiplier`, form[`${key}_multiplier`]));
        if (logoFile) payload.append('logo', logoFile);
        if (ownerPhotoFile) payload.append('owner_photo', ownerPhotoFile);

        try {
            const saved = await api('companies', {method: 'POST', body: payload});
            setSelected(saved);
            setForm({...saved, password: ''});
            setShowPassword(false);
            resetPhotos(saved.logo_url, saved.owner_photo_url);
            setMessage('Company profile, owner details, logo and plant location saved successfully.');
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
                <span>
                    <b>{company.name}</b>
                    <small>
                        {company.owner_name ? `👑 ${company.owner_name} · ` : ''}
                        {company.is_ss_reference ? 'Daily SS reference · ' : ''}
                        {company.admin_email} · {company.inverters.filter(inverter => inverter.active).length} active inverters
                    </small>
                </span>
                <i className={company.active ? 'status on' : 'status'}>{company.active ? 'Active' : 'Inactive'}</i>
            </button>)}
        </section>
        <div>
            <form className="panel company-form" onSubmit={save}>
                <div className="panel-head"><div><h2>{form.id ? 'Edit company' : 'New company'}</h2><p>Company login, owner branding, logo, plant location and meter multipliers are managed together.</p></div></div>
                <div className="company-profile-fields" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px'}}>
                    {/* 1. Company Logo Upload */}
                    <label className="company-logo-upload">
                        <span className="company-logo-preview">{logoPreview ? <img src={logoPreview} alt="Company logo preview"/> : <ImagePlus/>}</span>
                        <span><b>{logoFile?.name || (form.logo_url ? 'Change company logo' : 'Choose company logo')}</b><small>Company Brand Logo (PNG/JPG)</small></span>
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} required={!form.id}/>
                    </label>

                    {/* 2. Owner / Director Photo Upload */}
                    <label className="company-logo-upload" style={{borderColor: '#fbbf24', background: '#fffdfa'}}>
                        <span className="company-logo-preview" style={{borderRadius: '50%', overflow: 'hidden', border: '2px solid #f59e0b'}}>
                            {ownerPhotoPreview ? <img src={ownerPhotoPreview} alt="Owner photo preview"/> : <span style={{fontSize: '20px'}}>👑</span>}
                        </span>
                        <span><b>{ownerPhotoFile?.name || (form.owner_photo_url ? 'Change owner photo' : 'Upload Owner Photo')}</b><small>Owner VIP Avatar (For Welcome & Celebration)</small></span>
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/jpg" onChange={chooseOwnerPhoto}/>
                    </label>
                </div>

                <div className="company-status-toggles" style={{marginTop: '12px'}}>
                    <label className="toggle"><input type="checkbox" checked={Boolean(form.active)} disabled={Boolean(form.is_ss_reference)} onChange={event => setForm({...form, active: event.target.checked})}/><span/> Company active</label>
                    <label className="toggle"><input type="checkbox" checked={Boolean(form.is_ss_reference)} disabled={Boolean(selected?.is_ss_reference)} onChange={event => setForm({...form, is_ss_reference: event.target.checked, active: event.target.checked ? true : form.active})}/><span/> Daily SS reference company</label>
                </div>

                <div className="info-banner" style={{marginTop: '10px'}}>Only one active company can be the Daily SS reference. Select this option on another active company to replace the current reference.</div>
                
                <div className="form-grid two" style={{marginTop: '14px'}}>
                    <Field label="Company Name"><input value={form.name} onChange={event => setForm({...form, name: event.target.value})} required/></Field>
                    <Field label="Owner / Director Name"><input value={form.owner_name ?? ''} onChange={event => setForm({...form, owner_name: event.target.value})}/></Field>
                    <Field label="Owner Designation / Title"><input value={form.owner_designation ?? ''} onChange={event => setForm({...form, owner_designation: event.target.value})}/></Field>
                    <Field label="Company Login Email"><input type="email" value={form.admin_email ?? ''} onChange={event => setForm({...form, admin_email: event.target.value})} autoComplete="off" required/></Field>
                    <Field label={form.id ? 'New Password (optional)' : 'Login Password'}><input type={showPassword ? 'text' : 'password'} minLength="8" value={form.password ?? ''} onChange={event => setForm({...form, password: event.target.value})} autoComplete="new-password" required={!form.id}/><button type="button" className="password-visibility" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></Field>
                    <Field label="Plant Location Name"><input value={form.plant_location ?? ''} onChange={event => setForm({...form, plant_location: event.target.value})}/></Field>
                    <Field label="Latitude (for Weather & Predictions)"><input type="number" step="0.0001" value={form.latitude ?? ''} onChange={event => setForm({...form, latitude: event.target.value})}/></Field>
                    <Field label="Longitude (for Weather & Predictions)"><input type="number" step="0.0001" value={form.longitude ?? ''} onChange={event => setForm({...form, longitude: event.target.value})}/></Field>
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
    const [serialNumber, setSerialNumber] = useState('');

    return <section className="panel">
        <div className="panel-head">
            <div>
                <h2>Inverters</h2>
                <p>Daily entry fields follow the active inverter list. Enter iSolarCloud Serial Number (device_sn) for automated sync.</p>
            </div>
        </div>
        <div className="inverter-list">
            {company.inverters.map(inverter => <div key={inverter.id} style={{display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}>
                <span className="company-icon"><Factory/></span>
                <b style={{minWidth: '100px'}}>{inverter.name}</b>
                <input
                    type="text"
                    placeholder="iSolarCloud SN"
                    defaultValue={inverter.serial_number || ''}
                    onBlur={event => {
                        if (event.target.value !== (inverter.serial_number || '')) {
                            save({...inverter, serial_number: event.target.value.trim()});
                        }
                    }}
                    style={{maxWidth: '250px', padding: '6px 10px', fontSize: '13px'}}
                />
                <label className="toggle small">
                    <input type="checkbox" checked={Boolean(inverter.active)} onChange={event => save({...inverter, active: event.target.checked})}/>
                    <span/>
                    {inverter.active ? 'Active' : 'Inactive'}
                </label>
            </div>)}
        </div>
        <div className="inline-add" style={{marginTop: '12px'}}>
            <input placeholder="Inverter Name" value={name} onChange={event => setName(event.target.value)}/>
            <input placeholder="Serial Number (optional)" value={serialNumber} onChange={event => setSerialNumber(event.target.value)} style={{maxWidth: '220px'}}/>
            <button type="button" className="secondary" onClick={async () => {
                if (!name.trim()) return;
                await save({company_id: company.id, name, serial_number: serialNumber.trim() || null, active: true});
                setName('');
                setSerialNumber('');
            }}>Add inverter</button>
        </div>
    </section>;
}

