import React, {useEffect, useMemo, useState} from 'react';
import {Camera, Check, ChevronLeft, ChevronRight, HandCoins, Package, PackagePlus, RotateCcw, Sparkles, User, X} from 'lucide-react';
import {api} from '../api';
import {fixedTwo, number, shortDate} from '../format';
import {DatePicker, Field} from './Common';
import {compressImage} from '../utils/imageCompressor';

const localDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

function ModalHead({title, detail, onClose}) {
    return (
        <div className="panel-head">
            <div>
                <h2>{title}</h2>
                <p>{detail}</p>
            </div>
            <button type="button" className="icon-button ghost" onClick={onClose} aria-label="Close">
                <X size={18}/>
            </button>
        </div>
    );
}

function StepProgressBar({steps, currentStep}) {
    return (
        <div className="expense-step-progress" style={{marginBottom: '16px'}}>
            {steps.map((label, i) => (
                <div key={i} className={`step-prog-item ${currentStep === i + 1 ? 'active' : currentStep > i + 1 ? 'done' : ''}`}>
                    <div className="step-prog-circle">{currentStep > i + 1 ? '✓' : i + 1}</div>
                    <span>{label}</span>
                </div>
            ))}
        </div>
    );
}

export function StockItemModal({item, onClose, onSaved}) {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(item ? {...item} : {
        name: '',
        unit_price: '',
        opening_quantity: '',
        low_stock_threshold: '0.00',
        notes: '',
        active: true
    });
    const [imageFile, setImageFile] = useState(null);
    const [compressing, setCompressing] = useState(false);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const preview = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : item?.image_url, [imageFile, item]);
    useEffect(() => () => { if (imageFile && preview) URL.revokeObjectURL(preview); }, [imageFile, preview]);

    const handleImageChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            setImageFile(null);
            return;
        }
        setCompressing(true);
        try {
            const compressed = await compressImage(file, {maxWidth: 900, maxHeight: 900, quality: 0.8});
            setImageFile(compressed);
        } catch {
            setImageFile(file);
        } finally {
            setCompressing(false);
        }
    };

    const step1Valid = Boolean(form.name?.trim() && Number(form.unit_price) >= 0);
    const step2Valid = Boolean((item?.id || Number(form.opening_quantity) >= 0) && Number(form.low_stock_threshold) >= 0);

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setMessage('');

        const body = new FormData();
        if (item?.id) body.append('id', item.id);
        body.append('name', form.name);
        body.append('unit_price', fixedTwo(form.unit_price));
        if (!item?.id) body.append('opening_quantity', fixedTwo(form.opening_quantity));
        body.append('low_stock_threshold', fixedTwo(form.low_stock_threshold));
        body.append('active', form.active ? '1' : '0');
        if (form.notes) body.append('notes', form.notes);
        if (imageFile) body.append('image', imageFile);

        try {
            await api('stock/items', {method: 'POST', body});
            await onSaved(item?.id ? 'Stock item updated successfully.' : 'Stock item added successfully.');
        } catch (error) {
            setMessage(error.message);
            setBusy(false);
            setStep(1);
        }
    };

    const steps = ['1. Basic Info', '2. Inventory', '3. Photo & Confirm'];

    return (
        <div className="modal-backdrop">
            <form className="modal stock-form-modal expense-modal-sheet" onSubmit={save}>
                <div className="mobile-modal-handle-bar"/>
                <ModalHead
                    title={item ? 'Edit stock item' : 'Add stock item'}
                    detail="Stock is common inventory shared across all partner companies."
                    onClose={onClose}
                />

                <StepProgressBar steps={steps} currentStep={step}/>

                <div className="expense-form-body-scroll" style={{minHeight: '260px'}}>
                    {/* STEP 1: Basic Info */}
                    {step === 1 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <span className="step-num-badge">1</span>
                                <b>Stock item information</b>
                            </div>
                            <Field label="Stock Item Name">
                                <input
                                    value={form.name}
                                    onChange={event => setForm({...form, name: event.target.value})}
                                    placeholder="e.g. Solar Cable 4sq mm"
                                    maxLength="150"
                                    required
                                    autoFocus
                                />
                            </Field>
                            <Field label="Unit Price (₹ per unit)">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    value={form.unit_price}
                                    placeholder="0.00"
                                    onChange={event => setForm({...form, unit_price: event.target.value})}
                                    onBlur={event => setForm(current => ({...current, unit_price: fixedTwo(event.target.value)}))}
                                    required
                                />
                            </Field>
                            <Field label="Notes / Specification (optional)">
                                <textarea
                                    value={form.notes || ''}
                                    onChange={event => setForm({...form, notes: event.target.value})}
                                    placeholder="Brand, model, or storage location details..."
                                    rows="2"
                                />
                            </Field>
                        </div>
                    )}

                    {/* STEP 2: Inventory & Threshold */}
                    {step === 2 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <span className="step-num-badge">2</span>
                                <b>Quantity & Stock alert thresholds</b>
                            </div>
                            <div className="form-grid two">
                                {!item && (
                                    <Field label="Opening Quantity">
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            inputMode="decimal"
                                            value={form.opening_quantity}
                                            placeholder="0.00"
                                            onChange={event => setForm({...form, opening_quantity: event.target.value})}
                                            onBlur={event => setForm(current => ({...current, opening_quantity: fixedTwo(event.target.value)}))}
                                            required
                                        />
                                    </Field>
                                )}
                                <Field label="Low-Stock Alert Level">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={form.low_stock_threshold}
                                        placeholder="0.00"
                                        onChange={event => setForm({...form, low_stock_threshold: event.target.value})}
                                        onBlur={event => setForm(current => ({...current, low_stock_threshold: fixedTwo(event.target.value)}))}
                                        required
                                    />
                                </Field>
                            </div>

                            <label className="toggle" style={{marginTop: '12px'}}>
                                <input
                                    type="checkbox"
                                    checked={Boolean(form.active)}
                                    onChange={event => setForm({...form, active: event.target.checked})}
                                />
                                <span/> Item is active & available for issuing
                            </label>

                            {item && (
                                <div style={{background: '#f1f5f9', padding: '10px 14px', borderRadius: '9px', marginTop: '10px', fontSize: '12px', color: '#334155'}}>
                                    Current owned quantity: <b>{number(item.total_quantity)} units</b> · Available: <b>{number(item.available_quantity)} units</b>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 3: Photo & Review */}
                    {step === 3 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <span className="step-num-badge green-badge">3</span>
                                <b>Item Photo & Final Review</b>
                            </div>

                            <label className="stock-image-upload">
                                <span>
                                    {preview ? <img src={preview} alt="Stock preview" style={{width: '100%', height: '100%', objectFit: 'cover'}} loading="lazy"/> : <Camera size={26}/>}
                                </span>
                                <div>
                                    <b>{compressing ? 'Compressing image...' : 'Upload Item Photo'}</b>
                                    <small>{item ? 'Select only to replace current image.' : 'Required for clear identification · Auto-compressed to lightweight format'}</small>
                                </div>
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    required={!item && !imageFile}
                                    onChange={handleImageChange}
                                />
                            </label>

                            <div className="wizard-alloc-preview" style={{marginTop: '10px'}}>
                                <div className="wizard-alloc-row">
                                    <span>Item Name</span>
                                    <b>{form.name}</b>
                                </div>
                                <div className="wizard-alloc-row">
                                    <span>Unit Price</span>
                                    <b>₹{number(form.unit_price)}</b>
                                </div>
                                {!item && (
                                    <div className="wizard-alloc-row">
                                        <span>Opening Quantity</span>
                                        <b>{number(form.opening_quantity || 0)} units</b>
                                    </div>
                                )}
                                <div className="wizard-alloc-row">
                                    <span>Alert Threshold</span>
                                    <span>Below {number(form.low_stock_threshold || 0)} units</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {message && <div className="error" style={{marginTop: '10px'}}>{message}</div>}
                </div>

                {/* Footer Navigation */}
                <div className="modal-sticky-footer expense-wizard-footer">
                    {step > 1 ? (
                        <button type="button" className="secondary modal-cancel-btn" onClick={() => setStep(s => s - 1)}>
                            ← Back
                        </button>
                    ) : (
                        <button type="button" className="secondary modal-cancel-btn" onClick={onClose}>
                            Cancel
                        </button>
                    )}

                    <div className="step-dots">
                        {[1, 2, 3].map(s => (
                            <span key={s} className={`step-dot ${step === s ? 'active' : step > s ? 'done' : ''}`}/>
                        ))}
                    </div>

                    {step < 3 ? (
                        <button
                            type="button"
                            className="primary expense-submit-btn"
                            disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
                            onClick={() => setStep(s => s + 1)}
                        >
                            Next →
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="primary expense-submit-btn"
                            disabled={busy || compressing || (!item?.id && !imageFile && !preview)}
                        >
                            {busy ? 'Saving...' : item ? '✓ Update item' : '✓ Save item'}
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}

export function AddStockModal({item, onClose, onSaved}) {
    const [form, setForm] = useState({quantity: '', unit_price: fixedTwo(item.unit_price), notes: ''});
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setMessage('');
        try {
            await api(`stock/items/${item.id}/add`, {
                method: 'POST',
                body: JSON.stringify({
                    ...form,
                    quantity: fixedTwo(form.quantity),
                    unit_price: fixedTwo(form.unit_price)
                })
            });
            await onSaved('Stock quantity added successfully.');
        } catch (error) {
            setMessage(error.message);
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <form className="modal compact-stock-modal" onSubmit={save}>
                <ModalHead
                    title="Add stock quantity"
                    detail={`${item.name} · Current stock: ${number(item.total_quantity)} units`}
                    onClose={onClose}
                />
                <div className="form-grid two">
                    <Field label="Add Quantity">
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            value={form.quantity}
                            onChange={event => setForm({...form, quantity: event.target.value})}
                            required
                            autoFocus
                        />
                    </Field>
                    <Field label="Purchase Unit Price (₹)">
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={form.unit_price}
                            onChange={event => setForm({...form, unit_price: event.target.value})}
                            required
                        />
                    </Field>
                </div>
                <Field label="Purchase Note / Supplier Reference">
                    <textarea
                        rows="2"
                        value={form.notes}
                        onChange={event => setForm({...form, notes: event.target.value})}
                        placeholder="Invoice # or supplier details..."
                    />
                </Field>
                {message && <div className="error">{message}</div>}
                <div className="form-actions">
                    <button type="button" className="secondary" onClick={onClose}>Cancel</button>
                    <button className="primary" disabled={busy}>
                        <PackagePlus size={16}/> Add quantity
                    </button>
                </div>
            </form>
        </div>
    );
}

export function BorrowStockModal({items, people, currentUser, selectedItem, onClose, onSaved}) {
    const availableItems = items.filter(item => item.active && item.available_quantity > 0);
    const defaultPerson = people.some(person => person.id === currentUser.id) ? currentUser.id : people[0]?.id || '';

    const [step, setStep] = useState(1);
    const [form, setForm] = useState({
        stock_item_id: selectedItem?.id || availableItems[0]?.id || '',
        borrower_name: '',
        borrower_mobile: '',
        quantity: '',
        borrowed_on: localDate(),
        expected_return_date: '',
        given_by_user_id: defaultPerson,
        notes: ''
    });
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const currentItem = items.find(row => String(row.id) === String(form.stock_item_id));

    const step1Valid = Boolean(form.stock_item_id && Number(form.quantity) > 0 && Number(form.quantity) <= (currentItem?.available_quantity || 0));
    const step2Valid = Boolean(form.borrower_name?.trim() && form.given_by_user_id);

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setMessage('');
        try {
            await api('stock/borrowings', {
                method: 'POST',
                body: JSON.stringify({
                    ...form,
                    quantity: fixedTwo(form.quantity),
                    expected_return_date: form.expected_return_date || null
                })
            });
            await onSaved('Stock issued to borrower successfully.');
        } catch (error) {
            setMessage(error.message);
            setBusy(false);
            setStep(1);
        }
    };

    const steps = ['1. Item & Qty', '2. Borrower Info', '3. Dates & Confirm'];

    return (
        <div className="modal-backdrop">
            <form className="modal stock-form-modal expense-modal-sheet" onSubmit={save}>
                <div className="mobile-modal-handle-bar"/>
                <ModalHead
                    title="Give stock to borrower / exchange"
                    detail="Available balance reduces until the borrowed stock is returned."
                    onClose={onClose}
                />

                <StepProgressBar steps={steps} currentStep={step}/>

                <div className="expense-form-body-scroll" style={{minHeight: '260px'}}>
                    {/* STEP 1: Item & Quantity */}
                    {step === 1 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <span className="step-num-badge">1</span>
                                <b>Select stock item and quantity</b>
                            </div>
                            {availableItems.length ? (
                                <>
                                    <Field label="Stock Item to Issue">
                                        <select
                                            value={form.stock_item_id}
                                            onChange={event => setForm({...form, stock_item_id: event.target.value})}
                                            className="clean-select-box"
                                        >
                                            {availableItems.map(row => (
                                                <option value={row.id} key={row.id}>
                                                    {row.name} · {number(row.available_quantity)} available
                                                </option>
                                            ))}
                                        </select>
                                    </Field>

                                    {currentItem && (
                                        <div style={{background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                            <span style={{fontSize: '12px', color: '#166534', fontWeight: 600}}>
                                                Available In Inventory:
                                            </span>
                                            <b style={{fontSize: '14px', color: '#15803d'}}>
                                                {number(currentItem.available_quantity)} units
                                            </b>
                                        </div>
                                    )}

                                    <Field label="Quantity to Issue">
                                        <input
                                            type="number"
                                            min="0.01"
                                            max={currentItem?.available_quantity}
                                            step="0.01"
                                            inputMode="decimal"
                                            value={form.quantity}
                                            placeholder="Enter quantity"
                                            onChange={event => setForm({...form, quantity: event.target.value})}
                                            required
                                            autoFocus
                                        />
                                    </Field>

                                    {currentItem && form.quantity && Number(form.quantity) > 0 && (
                                        <small style={{display: 'block', color: '#64748b', marginTop: '4px'}}>
                                            Remaining after issue: <b>{number(Math.max(0, currentItem.available_quantity - Number(form.quantity)))} units</b>
                                        </small>
                                    )}
                                </>
                            ) : (
                                <div className="info-banner">No active stock item currently has available quantity.</div>
                            )}
                        </div>
                    )}

                    {/* STEP 2: Borrower Details */}
                    {step === 2 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <span className="step-num-badge">2</span>
                                <b>Borrower and Issuer Details</b>
                            </div>
                            <Field label="Borrower / Opposite Party Name">
                                <input
                                    value={form.borrower_name}
                                    placeholder="Person or contractor name"
                                    onChange={event => setForm({...form, borrower_name: event.target.value})}
                                    required
                                    autoFocus
                                />
                            </Field>
                            <Field label="Borrower Mobile Number (optional)">
                                <input
                                    type="tel"
                                    value={form.borrower_mobile}
                                    placeholder="10-digit mobile"
                                    onChange={event => setForm({...form, borrower_mobile: event.target.value})}
                                />
                            </Field>
                            <Field label="Given By (Internal In-Charge)">
                                <select
                                    value={form.given_by_user_id}
                                    onChange={event => setForm({...form, given_by_user_id: event.target.value})}
                                    className="clean-select-box"
                                >
                                    {people.map(person => (
                                        <option value={person.id} key={person.id}>
                                            {person.name} · {(person.employee_code || person.role).replaceAll('_', ' ')}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                    )}

                    {/* STEP 3: Dates & Confirmation */}
                    {step === 3 && (
                        <div className="wizard-step-panel">
                            <div className="wizard-step-title">
                                <span className="step-num-badge green-badge">3</span>
                                <b>Borrow Dates & Confirmation</b>
                            </div>
                            <div className="form-grid two">
                                <DatePicker
                                    label="Borrow Date"
                                    value={form.borrowed_on}
                                    onChange={value => setForm({...form, borrowed_on: value})}
                                />
                                <Field label="Expected Return Date">
                                    <input
                                        type="date"
                                        value={form.expected_return_date}
                                        min={form.borrowed_on}
                                        onChange={event => setForm({...form, expected_return_date: event.target.value})}
                                    />
                                </Field>
                            </div>
                            <Field label="Purpose / Notes (optional)">
                                <textarea
                                    rows="2"
                                    value={form.notes}
                                    placeholder="Purpose of borrowing, site location, etc."
                                    onChange={event => setForm({...form, notes: event.target.value})}
                                />
                            </Field>

                            <div className="wizard-alloc-preview" style={{marginTop: '10px'}}>
                                <div className="wizard-alloc-row">
                                    <span>Stock Item</span>
                                    <b>{currentItem?.name}</b>
                                </div>
                                <div className="wizard-alloc-row">
                                    <span>Issued Quantity</span>
                                    <b style={{color: '#b91c1c'}}>{number(form.quantity)} units</b>
                                </div>
                                <div className="wizard-alloc-row">
                                    <span>Borrower</span>
                                    <b>{form.borrower_name} {form.borrower_mobile ? `(${form.borrower_mobile})` : ''}</b>
                                </div>
                            </div>
                        </div>
                    )}

                    {message && <div className="error" style={{marginTop: '10px'}}>{message}</div>}
                </div>

                {/* Footer Navigation */}
                <div className="modal-sticky-footer expense-wizard-footer">
                    {step > 1 ? (
                        <button type="button" className="secondary modal-cancel-btn" onClick={() => setStep(s => s - 1)}>
                            ← Back
                        </button>
                    ) : (
                        <button type="button" className="secondary modal-cancel-btn" onClick={onClose}>
                            Cancel
                        </button>
                    )}

                    <div className="step-dots">
                        {[1, 2, 3].map(s => (
                            <span key={s} className={`step-dot ${step === s ? 'active' : step > s ? 'done' : ''}`}/>
                        ))}
                    </div>

                    {step < 3 ? (
                        <button
                            type="button"
                            className="primary expense-submit-btn"
                            disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
                            onClick={() => setStep(s => s + 1)}
                        >
                            Next →
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="primary expense-submit-btn"
                            disabled={busy || !availableItems.length}
                        >
                            {busy ? 'Issuing...' : '✓ Issue stock'}
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}

export function ReturnStockModal({borrowing, people, currentUser, onClose, onSaved}) {
    const defaultPerson = people.some(person => person.id === currentUser.id) ? currentUser.id : people[0]?.id || '';
    const [form, setForm] = useState({
        quantity: fixedTwo(borrowing.pending_quantity),
        returned_on: localDate(),
        received_by_user_id: defaultPerson,
        notes: ''
    });
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setMessage('');
        try {
            await api(`stock/borrowings/${borrowing.id}/returns`, {
                method: 'POST',
                body: JSON.stringify({...form, quantity: fixedTwo(form.quantity)})
            });
            await onSaved('Returned stock received successfully.');
        } catch (error) {
            setMessage(error.message);
            setBusy(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <form className="modal compact-stock-modal" onSubmit={save}>
                <ModalHead
                    title="Receive returned stock"
                    detail={`${borrowing.item.name} · ${number(borrowing.pending_quantity)} pending from ${borrowing.borrower_name}`}
                    onClose={onClose}
                />
                <div className="form-grid two">
                    <Field label="Returned Quantity">
                        <input
                            type="number"
                            min="0.01"
                            max={borrowing.pending_quantity}
                            step="0.01"
                            inputMode="decimal"
                            value={form.quantity}
                            onChange={event => setForm({...form, quantity: event.target.value})}
                            required
                            autoFocus
                        />
                    </Field>
                    <DatePicker
                        label="Return Date"
                        value={form.returned_on}
                        onChange={value => setForm({...form, returned_on: value})}
                    />
                </div>
                <Field label="Received By">
                    <select
                        value={form.received_by_user_id}
                        onChange={event => setForm({...form, received_by_user_id: event.target.value})}
                    >
                        {people.map(person => (
                            <option value={person.id} key={person.id}>
                                {person.name} · {(person.employee_code || person.role).replaceAll('_', ' ')}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Return Note (optional)">
                    <textarea
                        rows="2"
                        value={form.notes}
                        placeholder="Condition of returned item..."
                        onChange={event => setForm({...form, notes: event.target.value})}
                    />
                </Field>
                {message && <div className="error">{message}</div>}
                <div className="form-actions">
                    <button type="button" className="secondary" onClick={onClose}>Cancel</button>
                    <button className="primary" disabled={busy}>
                        <RotateCcw size={16}/> Receive stock
                    </button>
                </div>
            </form>
        </div>
    );
}

export function StockPhotoModal({photo, onClose}) {
    return (
        <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
            <div className="modal stock-photo-modal" role="dialog" aria-modal="true">
                <ModalHead title={photo.name} detail="Stock item image" onClose={onClose}/>
                <img src={photo.url} alt={photo.name} loading="lazy"/>
            </div>
        </div>
    );
}

export function StockItemDetailModal({item, onClose}) {
    const movementLabel = type => type === 'opening' ? 'Opening stock' : type === 'stock_in' ? 'Stock added' : type.replaceAll('_', ' ');

    return (
        <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
            <div className="modal stock-history-modal" role="dialog" aria-modal="true">
                <ModalHead title={`${item.name} history`} detail="Opening stock and every later stock addition." onClose={onClose}/>
                <div className="stock-detail-grid">
                    <span><small>Total quantity</small><b>{number(item.total_quantity)}</b></span>
                    <span><small>Available</small><b>{number(item.available_quantity)}</b></span>
                    <span><small>Borrowed</small><b>{number(item.borrowed_quantity)}</b></span>
                    <span><small>Unit price</small><b>₹{number(item.unit_price)}</b></span>
                    <span><small>Total value</small><b>₹{number(item.total_value)}</b></span>
                    <span><small>Status</small><b>{item.active ? item.is_low_stock ? 'Low stock' : 'Active' : 'Inactive'}</b></span>
                </div>
                {item.notes && <div className="info-banner">{item.notes}</div>}
                <h3 className="section-title">Stock movement history</h3>
                {item.movements?.length ? (
                    <div className="stock-return-history stock-movement-history">
                        {item.movements.map(row => (
                            <div key={row.id}>
                                <span>
                                    <b>{movementLabel(row.type)} · {number(row.quantity)}</b>
                                    <small>{shortDate(row.created_at)} · by {row.creator?.name || 'Unknown'}</small>
                                </span>
                                <p>₹{number(row.unit_price)} each{row.notes ? ` · ${row.notes}` : ''}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="info-banner">No stock movement has been recorded yet.</div>
                )}
            </div>
        </div>
    );
}

export function BorrowingDetailModal({borrowing, onClose}) {
    return (
        <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
            <div className="modal stock-history-modal">
                <ModalHead title="Borrowing details" detail={`${borrowing.item.name} · ${borrowing.borrower_name}`} onClose={onClose}/>
                <div className="stock-detail-grid">
                    <span><small>Given quantity</small><b>{number(borrowing.quantity)}</b></span>
                    <span><small>Returned</small><b>{number(borrowing.returned_quantity)}</b></span>
                    <span><small>Pending</small><b>{number(borrowing.pending_quantity)}</b></span>
                    <span><small>Given by</small><b>{borrowing.given_by?.name || '—'}</b></span>
                    <span><small>Borrow date</small><b>{shortDate(borrowing.borrowed_on)}</b></span>
                    <span><small>Expected return</small><b>{shortDate(borrowing.expected_return_date)}</b></span>
                </div>
                {borrowing.notes && <div className="info-banner">{borrowing.notes}</div>}
                <h3 className="section-title">Return history</h3>
                {borrowing.returns.length ? (
                    <div className="stock-return-history">
                        {borrowing.returns.map(row => (
                            <div key={row.id}>
                                <span>
                                    <b>{number(row.quantity)} returned</b>
                                    <small>{shortDate(row.returned_on)} · received by {row.received_by?.name || 'Unknown'}</small>
                                </span>
                                <p>{row.notes || 'No note'}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="info-banner">No quantity has been returned yet.</div>
                )}
            </div>
        </div>
    );
}
