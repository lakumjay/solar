import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Receipt, Building2, FolderClock, Settings, Plus, Search,
    Printer, Mail, FileText, CheckCircle2, AlertTriangle,
    XCircle, Ban, Download, RefreshCw, Eye, ArrowRight,
    ArrowLeft, Check, Upload, HelpCircle, BarChart3
} from 'lucide-react';
import { api } from '../api';
import { useLanguage } from '../context/LanguageContext';
import BillingEngine, {
    deriveRates, companyBill, computeInterest, runChecks,
    nextInvoiceNo, fyOf, numberToWords, inr, round2
} from '../utils/billingEngine';

export default function BillingPage({ currentUser }) {
    const { lang, t } = useLanguage();

    // Navigation Tabs
    const [activeTab, setActiveTab] = useState('bill'); // 'bill' | 'records' | 'ca' | 'companies' | 'setup'

    // Server State
    const [loading, setLoading] = useState(false);
    const [companies, setCompanies] = useState([]);
    const [settings, setSettings] = useState({});
    const [bills, setBills] = useState([]);
    const [summary, setSummary] = useState(null);

    // Filters for Records & CA Report Tab
    const [filterCompany, setFilterCompany] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [caMonth, setCaMonth] = useState('');
    const [caCompanyId, setCaCompanyId] = useState('');

    // Modals & Actions
    const [viewingBill, setViewingBill] = useState(null);
    const [voidModal, setVoidModal] = useState({ open: false, bill: null, reason: '' });
    const [editingCompany, setEditingCompany] = useState(null); // null or company object

    // Wizard State (Steps 1 to 4)
    const [wizStep, setWizStep] = useState(1);
    const [wCompanyId, setWCompanyId] = useState('');
    const [wMonth, setWMonth] = useState('');
    const [wInvNo, setWInvNo] = useState('');
    const [wInvDate, setWInvDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [wDueDate, setWDueDate] = useState('');
    const [wPdfFile, setWPdfFile] = useState(null);
    const [wPdfName, setWPdfName] = useState('');
    const [wCust, setWCust] = useState({ name: '', address: '', gst: '' });

    // Step 2 Units
    const [wUnits, setWUnits] = useState({ credited: '', peak: '', banking: '', generated: '' });
    const [wTwoCo, setWTwoCo] = useState(false);
    const [wUnits2, setWUnits2] = useState({ companyId: '', credited: '', peak: '', banking: '', generated: '', invNo: '' });

    // Step 2 PGVCL Statement Inputs (CREDIT column)
    const [wStmt, setWStmt] = useState({
        unit: '', energyAmt: '', fcaAmt: '', pfAmt: '', ehvAmt: '',
        touAmt: '', totalPeak: '', varAmt: '', boardAmt: '', dutyAmt: ''
    });

    // Step 2 Deductions
    const [wExtra, setWExtra] = useState({ lossPct: '', crossPct: '', wheelRate: '', bankRate: '' });

    // Step 3 & 4 Computed Bills Cache
    const [computedBills, setComputedBills] = useState([]);
    const [pendingInfo, setPendingInfo] = useState({ prevBal: 0, interest: 0, interestDays: 0 });
    const [pendingInfo2, setPendingInfo2] = useState({ prevBal: 0, interest: 0, interestDays: 0 });
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccessCount, setSaveSuccessCount] = useState(0);

    // 1. Initial Load: Companies & Settings
    const loadInitData = async () => {
        setLoading(true);
        try {
            const [compsRes, settRes] = await Promise.all([
                api('billing/companies'),
                api('billing/settings')
            ]);
            setCompanies(compsRes || []);
            setSettings(settRes || {});

            if (compsRes?.length && !wCompanyId) {
                setWCompanyId(compsRes[0].id);
                const fy = fyOf(wInvDate);
                setWInvNo(nextInvoiceNo(compsRes[0], fy));
            }

            if (settRes) {
                setWCust({
                    name: settRes.default_customer_name || 'Blueart Granito Pvt. Ltd.',
                    address: settRes.default_customer_address || 'S.No. 93/1P3, B/h. Keda Ceramic, Paneli Road, Morbi-363642',
                    gst: settRes.default_customer_gstin || '24AABCO3285B1ZU',
                });
                setWExtra({
                    lossPct: settRes.loss_pct || '6.5',
                    crossPct: settRes.cross_pct || '15',
                    wheelRate: settRes.wheel_rate || '0.2352',
                    bankRate: '1.50'
                });
            }
        } catch (err) {
            console.error('Error loading billing init data:', err);
        } finally {
            setLoading(false);
        }
    };

    // 2. Load Bills for Records / Ledger Tab
    const fetchBills = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterCompany !== 'all') params.append('company_id', filterCompany);
            if (filterStatus !== 'all') params.append('status', filterStatus);
            if (searchQuery) params.append('search', searchQuery);

            const res = await api(`billing/bills?${params.toString()}`);
            if (res) {
                setBills(res.bills || []);
                setSummary(res.summary || null);
            }
        } catch (err) {
            console.error('Error fetching bills:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadInitData();
    }, []);

    useEffect(() => {
        if (activeTab === 'records' || activeTab === 'ca') {
            fetchBills();
        }
    }, [activeTab, filterCompany, filterStatus, searchQuery]);

    // Handle Company Switch in Step 1
    const handleCompanyChange = async (compId) => {
        setWCompanyId(compId);
        const comp = companies.find(c => c.id == compId);
        if (comp) {
            const fy = fyOf(wInvDate);
            setWInvNo(nextInvoiceNo(comp, fy));
        }
    };

    // Auto calculate due date when invoice date changes
    useEffect(() => {
        const days = parseInt(settings.due_days) || 15;
        const d = new Date(wInvDate);
        d.setDate(d.getDate() + days);
        setWDueDate(d.toISOString().slice(0, 10));
    }, [wInvDate, settings.due_days]);

    // Live Derived Rates for Step 2
    const liveRates = useMemo(() => {
        return deriveRates(wStmt);
    }, [wStmt]);

    // Load Aug-26 Real Example for Quick Testing
    const handleLoadExample = () => {
        setWMonth('Aug-26');
        setWUnits({ credited: '105715', peak: '31708', banking: '20113', generated: '113064' });
        setWStmt({
            unit: '166107',
            energyAmt: '697649.40',
            fcaAmt: '406962.15',
            pfAmt: '14301.81',
            ehvAmt: '6976.49',
            touAmt: '41995.95',
            totalPeak: '49407',
            varAmt: '44074.00',
            boardAmt: '1169403.19',
            dutyAmt: '175410.48'
        });
        setWExtra({
            lossPct: '6.5',
            crossPct: '15',
            wheelRate: '0.2352',
            bankRate: '1.50'
        });
    };

    // Advance Step 1 -> 2
    const handleStep1Next = async () => {
        if (!wMonth.trim()) {
            alert(lang === 'en' ? 'Please enter billing month (e.g. Oct-26)' : 'કૃપા કરીને મહિનો દાખલ કરો (દા.ત. Oct-26)');
            return;
        }
        if (!wInvNo.trim()) {
            alert(lang === 'en' ? 'Please enter invoice number' : 'કૃપા કરીને Invoice No. દાખલ કરો');
            return;
        }

        // Fetch pending balance & snapshot interest for primary company
        try {
            const pi = await api(`billing/pending/${wCompanyId}`);
            setPendingInfo(pi || { prevBal: 0, interest: 0, interestDays: 0 });

            if (wTwoCo && wUnits2.companyId) {
                const pi2 = await api(`billing/pending/${wUnits2.companyId}`);
                setPendingInfo2(pi2 || { prevBal: 0, interest: 0, interestDays: 0 });
            }
        } catch (_) {}

        setWizStep(2);
    };

    // Advance Step 2 -> 3 (Preview & Check)
    const handleStep2Next = async () => {
        if (!parseFloat(wUnits.credited)) {
            alert(lang === 'en' ? 'Please enter Credited Units' : 'Credited Unit દાખલ કરો');
            return;
        }
        if (!parseFloat(wStmt.unit)) {
            alert(lang === 'en' ? 'Please enter Statement Total Units' : 'સ્ટેટમેન્ટના કુલ Total Units દાખલ કરો');
            return;
        }
        if (wTwoCo && !parseFloat(wUnits2.credited)) {
            alert(lang === 'en' ? 'Please enter Credited Units for second company' : 'બીજી કંપનીના Credited Unit દાખલ કરો');
            return;
        }

        const comp1 = companies.find(c => c.id == wCompanyId);
        const disc1 = comp1?.discount !== null && isFinite(parseFloat(comp1?.discount))
            ? parseFloat(comp1.discount)
            : (parseFloat(settings.default_discount) || 1.25);

        const res1 = companyBill(wUnits, liveRates, wExtra, { discount: disc1 });
        const checks1 = runChecks(res1, wStmt, 0).slice(0, 2); // 2 Checks: Bill-Rate & Grand/Generated ratio

        const billList = [{
            company: comp1,
            month: wMonth,
            invNo: wInvNo,
            invDate: wInvDate,
            dueDate: wDueDate,
            cust: wCust,
            units: { ...wUnits },
            stmt: { ...wStmt },
            extra: { ...wExtra },
            rates: liveRates,
            result: res1,
            checks: checks1,
            prevBal: pendingInfo.prev_balance || 0,
            interest: pendingInfo.interest || 0,
            interestDays: pendingInfo.interest_days || 0,
            totalOut: Math.round((pendingInfo.prev_balance || 0) + (pendingInfo.interest || 0) + res1.grand)
        }];

        // If Two-Company mode is active
        if (wTwoCo && wUnits2.companyId) {
            const comp2 = companies.find(c => c.id == wUnits2.companyId);
            const disc2 = comp2?.discount !== null && isFinite(parseFloat(comp2?.discount))
                ? parseFloat(comp2.discount)
                : (parseFloat(settings.default_discount) || 1.25);

            const fy = fyOf(wInvDate);
            const inv2 = wUnits2.invNo || nextInvoiceNo(comp2, fy);
            const res2 = companyBill(wUnits2, liveRates, wExtra, { discount: disc2 });
            const checks2 = runChecks(res2, wStmt, 0).slice(0, 2);

            billList.push({
                company: comp2,
                month: wMonth,
                invNo: inv2,
                invDate: wInvDate,
                dueDate: wDueDate,
                cust: wCust,
                units: { ...wUnits2 },
                stmt: { ...wStmt },
                extra: { ...wExtra },
                rates: liveRates,
                result: res2,
                checks: checks2,
                prevBal: pendingInfo2.prev_balance || 0,
                interest: pendingInfo2.interest || 0,
                interestDays: pendingInfo2.interest_days || 0,
                totalOut: Math.round((pendingInfo2.prev_balance || 0) + (pendingInfo2.interest || 0) + res2.grand)
            });
        }

        setComputedBills(billList);
        setWizStep(3);
    };

    // Save Bill to Backend API
    const handleSaveBill = async () => {
        setIsSaving(true);
        try {
            const formData = new FormData();

            if (wPdfFile) {
                formData.append('pdf_file', wPdfFile);
            }

            computedBills.forEach((b, index) => {
                formData.append(`bills[${index}][company_id]`, b.company.id);
                formData.append(`bills[${index}][month]`, b.month);
                formData.append(`bills[${index}][invoice_no]`, b.invNo);
                formData.append(`bills[${index}][invoice_date]`, b.invDate);
                formData.append(`bills[${index}][due_date]`, b.dueDate);
                formData.append(`bills[${index}][customer_name]`, b.cust.name);
                formData.append(`bills[${index}][customer_address]`, b.cust.address || '');
                formData.append(`bills[${index}][customer_gstin]`, b.cust.gst || '');

                formData.append(`bills[${index}][units_credited]`, b.units.credited);
                formData.append(`bills[${index}][units_peak]`, b.units.peak || 0);
                formData.append(`bills[${index}][units_banking]`, b.units.banking || 0);
                formData.append(`bills[${index}][units_generated]`, b.result.generated);

                formData.append(`bills[${index}][prev_balance]`, b.prevBal);
                formData.append(`bills[${index}][interest_amt]`, b.interest);
                formData.append(`bills[${index}][interest_days]`, b.interestDays);

                // Source of truth: JSON structures
                formData.append(`bills[${index}][stmt_inputs]`, JSON.stringify(b.stmt));
                formData.append(`bills[${index}][rates_derived]`, JSON.stringify(b.rates));
                formData.append(`bills[${index}][extra_params]`, JSON.stringify(b.extra));
                formData.append(`bills[${index}][breakdown]`, JSON.stringify(b.result));
            });

            const res = await api('billing/bills', {
                method: 'POST',
                body: formData
            });

            setSaveSuccessCount(computedBills.length);
            setWizStep(4);
            // Refresh companies to update last_seq
            const updatedComps = await api('billing/companies');
            if (updatedComps) setCompanies(updatedComps);
        } catch (err) {
            alert(err.message || 'Error saving bill');
        } finally {
            setIsSaving(false);
        }
    };

    // Toggle Paid Status in Records
    const handleTogglePaid = async (billId) => {
        try {
            await api(`billing/bills/${billId}/toggle-paid`, { method: 'POST' });
            fetchBills();
        } catch (err) {
            alert(err.message || 'Error updating bill status');
        }
    };

    // Void Bill in Records
    const handleConfirmVoid = async () => {
        if (!voidModal.reason.trim()) {
            alert(lang === 'en' ? 'Please provide a void reason' : 'રદ કરવાનું કારણ દાખલ કરો');
            return;
        }
        try {
            await api(`billing/bills/${voidModal.bill.id}/void`, {
                method: 'POST',
                body: JSON.stringify({ reason: voidModal.reason })
            });
            setVoidModal({ open: false, bill: null, reason: '' });
            fetchBills();
        } catch (err) {
            alert(err.message || 'Error voiding bill');
        }
    };

    // Print Invoice Handler
    const handlePrintInvoice = (billObj) => {
        setViewingBill(billObj);
        setTimeout(() => {
            window.print();
        }, 200);
    };

    // Email Mailto Generator
    const handleEmailInvoice = (billObj) => {
        const comp = billObj.company;
        const total = billObj.totalOut || billObj.total_outstanding;
        const units = billObj.units?.credited || billObj.units_credited;
        const prevBal = billObj.prevBal || billObj.prev_balance;

        const sub = encodeURIComponent(`Bill of Supply ${billObj.invNo || billObj.invoice_no} - ${comp?.name}`);
        const bodyText = `Respected Sir,\n\nPlease find our Bill of Supply dated ${billObj.invDate || billObj.invoice_date} for Solar Power Generation ${billObj.month}:\n\n` +
            `• Company: ${comp?.name}\n` +
            `• Invoice No: ${billObj.invNo || billObj.invoice_no}\n` +
            `• Credited Units: ${inr(units)}\n` +
            `• Grand Total Due: ₹${inr(total)}` +
            (prevBal > 0 ? ` (Includes Previous Pending: ₹${inr(prevBal)})` : '') +
            `\n\nFor ${comp?.name}\n(Authorised Signatory)`;

        window.location.href = `mailto:?subject=${sub}&body=${encodeURIComponent(bodyText)}`;
    };

    // Reset Wizard
    const resetWizard = () => {
        setWizStep(1);
        setWMonth('');
        setWUnits({ credited: '', peak: '', banking: '', generated: '' });
        setWTwoCo(false);
        setWUnits2({ companyId: '', credited: '', peak: '', banking: '', generated: '', invNo: '' });
        setComputedBills([]);
        const comp = companies.find(c => c.id == wCompanyId);
        if (comp) {
            const fy = fyOf(wInvDate);
            setWInvNo(nextInvoiceNo(comp, fy));
        }
    };

    // CA Report Months List
    const caMonths = useMemo(() => {
        const m = {};
        const out = [];
        bills.forEach(b => {
            if (b.month && !m[b.month]) {
                m[b.month] = true;
                out.push(b.month);
            }
        });
        return out;
    }, [bills]);

    // CA Report (GSTR-1 Table 8 & HSN Summary) Data Calculation
    const caData = useMemo(() => {
        const validBills = bills.filter(b => b.status !== 'void');
        const filtered = validBills.filter(b => {
            const matchMonth = !caMonth || caMonth === 'all' || b.month === caMonth;
            const matchCo = !caCompanyId || caCompanyId === 'all' || String(b.company_id) === String(caCompanyId);
            return matchMonth && matchCo;
        });

        let intra = 0;
        let inter = 0;
        let qty = 0;

        const rows = filtered.map(b => {
            const compGst = (b.company?.gstin || '').slice(0, 2);
            const custGst = (b.customer_gstin || '').slice(0, 2);
            // If either GSTIN is missing, default to Gujarat Intra-state
            const isIntra = (!compGst || !custGst) ? true : (compGst === custGst);
            // In CA GSTR-1 & HSN summary, supply value represents the monthly bill energy amount (current_grand_total)
            const billValue = Number(b.current_grand_total || b.breakdown?.grand || b.total_outstanding || 0);

            if (isIntra) {
                intra += billValue;
            } else {
                inter += billValue;
            }
            qty += Number(b.units_credited || 0);

            return {
                b,
                c: b.company,
                isIntra,
                units: Number(b.units_credited || 0),
                value: billValue
            };
        });

        return {
            rows,
            intra: round2(intra),
            inter: round2(inter),
            qty: round2(qty),
            total: round2(intra + inter)
        };
    }, [bills, caMonth, caCompanyId]);

    const dlFile = (name, text, type = 'text/csv;charset=utf-8') => {
        const blob = new Blob([text], { type });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const exportCaCsv = () => {
        const sMonth = caMonth || 'all';
        const lines = ['Section,Month,Company,Company GSTIN,Customer,Customer GSTIN,Invoice No,Invoice Date,Units (KWH),Invoice Value (Rs),State Type,Status'];
        caData.rows.forEach(r => {
            lines.push([
                'GSTR1-T8',
                r.b.month,
                `"${r.c?.name || ''}"`,
                r.c?.gstin || '',
                `"${r.b.customer_name || ''}"`,
                r.b.customer_gstin || '',
                r.b.invoice_no,
                r.b.invoice_date,
                r.units,
                r.value,
                r.isIntra ? 'INTRA-STATE' : 'INTER-STATE',
                r.b.status
            ].join(','));
        });
        lines.push('');
        lines.push('HSN,Description,UQC,Total Qty,Total Value');
        lines.push(`2716,Electrical energy,KWH,${caData.qty},${caData.total}`);
        dlFile(`SolarFlow-CA-Report-${sMonth}.csv`, lines.join('\n'));
    };

    const exportCaJson = () => {
        const sMonth = caMonth || 'all';
        const jsonContent = JSON.stringify({
            month: sMonth,
            gstr1_table8: {
                intra_state: Math.round(caData.intra),
                inter_state: Math.round(caData.inter),
                total: Math.round(caData.total)
            },
            hsn_summary: {
                hsn: '2716',
                description: 'Electrical energy',
                uqc: 'KWH',
                qty: caData.qty,
                value: Math.round(caData.total)
            },
            bills: caData.rows.map(r => ({
                invoice_no: r.b.invoice_no,
                date: r.b.invoice_date,
                company: r.c?.name,
                units: r.units,
                value: r.value,
                intra: r.isIntra,
                status: r.b.status
            }))
        }, null, 2);
        dlFile(`SolarFlow-CA-Report-${sMonth}.json`, jsonContent, 'application/json');
    };

    return (
        <div className="solar-billing-module">
            {/* Top Navigation Tabs */}
            <div className="billing-nav-pills">
                <button
                    type="button"
                    className={`nav-pill-btn ${activeTab === 'bill' ? 'active' : ''}`}
                    onClick={() => setActiveTab('bill')}
                >
                    <Receipt size={17} />
                    <span>{lang === 'en' ? 'New Bill' : 'નવું બિલ'}</span>
                </button>
                <button
                    type="button"
                    className={`nav-pill-btn ${activeTab === 'records' ? 'active' : ''}`}
                    onClick={() => setActiveTab('records')}
                >
                    <FolderClock size={17} />
                    <span>{lang === 'en' ? 'Records & Ledger' : 'બિલ રેકોર્ડ & લેજર'}</span>
                </button>
                <button
                    type="button"
                    className={`nav-pill-btn ${activeTab === 'ca' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ca')}
                >
                    <BarChart3 size={17} />
                    <span>{lang === 'en' ? 'CA Report' : '📊 CA રિપોર્ટ'}</span>
                </button>
                <button
                    type="button"
                    className={`nav-pill-btn ${activeTab === 'companies' ? 'active' : ''}`}
                    onClick={() => setActiveTab('companies')}
                >
                    <Building2 size={17} />
                    <span>{lang === 'en' ? 'Companies' : 'કંપનીઓ'}</span>
                </button>
                <button
                    type="button"
                    className={`nav-pill-btn ${activeTab === 'setup' ? 'active' : ''}`}
                    onClick={() => setActiveTab('setup')}
                >
                    <Settings size={17} />
                    <span>{lang === 'en' ? 'Setup' : 'સેટઅપ'}</span>
                </button>
            </div>

            {/* TAB 1: BILL GENERATOR WIZARD */}
            {activeTab === 'bill' && (
                <div className="billing-wizard-container">
                    {/* Step Progress Indicators */}
                    <div className="billing-step-dots">
                        {[
                            { num: 1, title: lang === 'en' ? 'Company' : 'કંપની & મહિનો' },
                            { num: 2, title: lang === 'en' ? 'Statement Data' : 'ડેટા એન્ટ્રી' },
                            { num: 3, title: lang === 'en' ? 'Preview & Checks' : 'પ્રીવ્યુ & ચેક' },
                            { num: 4, title: lang === 'en' ? 'Save' : 'સેવ થયેલ' }
                        ].map((s) => (
                            <div
                                key={s.num}
                                className={`billing-step-item ${wizStep === s.num ? 'active' : wizStep > s.num ? 'done' : ''}`}
                            >
                                <span className="step-num">{wizStep > s.num ? '✓' : s.num}</span>
                                <span className="step-label">{s.title}</span>
                            </div>
                        ))}
                    </div>

                    {/* Step 1: Company & Month Selection */}
                    {wizStep === 1 && (
                        <div className="billing-card">
                            <h3 className="card-title">
                                {lang === 'en' ? 'Step 1 — Company & Billing Period' : 'Step 1 — કંપની અને મહિનો'}
                            </h3>

                            <div className="form-group">
                                <label>{lang === 'en' ? 'Select Power Generating Company' : 'કંપની પસંદ કરો'}</label>
                                <select
                                    className="form-control"
                                    value={wCompanyId}
                                    onChange={(e) => handleCompanyChange(e.target.value)}
                                >
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <small className="form-hint">
                                    {lang === 'en'
                                        ? 'Invoice number and bank details will be loaded automatically.'
                                        : 'કંપનીના શોર્ટ પ્રિફિક્સ પરથી Invoice No. અને બેંક આપોઆપ સેટ થશે.'}
                                </small>
                            </div>

                            <div className="form-row-2">
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Billing Month (e.g. Oct-26)' : 'મહિનો (દા.ત. Oct-26)'}</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={wMonth}
                                        placeholder="Oct-26"
                                        onChange={(e) => setWMonth(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Invoice Date' : 'ઇનવોઇસ તારીખ'}</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={wInvDate}
                                        onChange={(e) => setWInvDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="form-row-2">
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Invoice No. (Auto generated)' : 'ઇનવોઇસ નં. (Auto)'}</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={wInvNo}
                                        onChange={(e) => setWInvNo(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Payment Due Date' : 'ચૂકવણી આખરી તારીખ'}</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={wDueDate}
                                        onChange={(e) => setWDueDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Customer Profile */}
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Customer / Factory (Bill To)' : 'ગ્રાહક / ફેક્ટરી (બિલ કોના નામે છે)'}</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={wCust.name}
                                    placeholder="Blueart Granito Pvt. Ltd."
                                    onChange={(e) => setWCust({ ...wCust, name: e.target.value })}
                                />
                            </div>

                            {/* PDF Statement Upload */}
                            <div className="form-group">
                                <label>{lang === 'en' ? 'PGVCL Open Access Statement PDF (Optional Audit Trail)' : 'PGVCL સ્ટેટમેન્ટ PDF અપલોડ (રેકોર્ડ માટે)'}</label>
                                <input
                                    type="file"
                                    accept=".pdf"
                                    className="form-control"
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        setWPdfFile(file || null);
                                        setWPdfName(file ? file.name : '');
                                    }}
                                />
                                {wPdfName && <span className="upload-badge">📄 {wPdfName}</span>}
                            </div>

                            <div className="wizard-btn-row">
                                <button type="button" className="btn-primary" onClick={handleStep1Next}>
                                    <span>{lang === 'en' ? 'Next: Enter Units →' : 'આગળ વધો: ડેટા એન્ટ્રી →'}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Data Entry & PGVCL Statement */}
                    {wizStep === 2 && (
                        <div className="billing-card">
                            <div className="card-header-flex">
                                <h3 className="card-title">
                                    {lang === 'en' ? 'Step 2 — Units & PGVCL Statement' : 'Step 2 — યુનિટ્સ & સ્ટેટમેન્ટ ડેટા'}
                                </h3>
                                <button
                                    type="button"
                                    className="btn-example-load"
                                    onClick={handleLoadExample}
                                    title="Load Aug-26 verified test figures"
                                >
                                    ⚡ {lang === 'en' ? 'Load Aug-26 Demo' : 'Aug-26 ઉદાહરણ લોડ કરો'}
                                </button>
                            </div>

                            {/* Section A: Primary Company Units */}
                            <details className="accordion-sec" open>
                                <summary>
                                    <b>A. {companies.find(c => c.id == wCompanyId)?.name || 'કંપની યુનિટ્સ'}</b>
                                    <span className="accordion-badge">૪ યુનિટ ફિલ્ડ</span>
                                </summary>
                                <div className="accordion-body">
                                    <div className="form-row-2">
                                        <div className="form-group">
                                            <label>Credited Unit (CR UNIT)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wUnits.credited}
                                                placeholder="105715"
                                                onChange={(e) => setWUnits({ ...wUnits, credited: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Peak Unit (Time of Use)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wUnits.peak}
                                                placeholder="31708"
                                                onChange={(e) => setWUnits({ ...wUnits, peak: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-row-2">
                                        <div className="form-group">
                                            <label>Banking Unit (RA. BANK)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wUnits.banking}
                                                placeholder="20113"
                                                onChange={(e) => setWUnits({ ...wUnits, banking: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Generated Unit (ખાલી હોય તો ઓટો 6.5%)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wUnits.generated}
                                                placeholder="113064"
                                                onChange={(e) => setWUnits({ ...wUnits, generated: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </details>

                            {/* Section B: Two-Company Option (Sunrise + Rajeshwari in 1 PDF) */}
                            <details className="accordion-sec">
                                <summary>
                                    <b>B. બીજી કંપની (Two-Company Flow)</b>
                                    <span className="accordion-badge optional">ઓપ્શનલ</span>
                                </summary>
                                <div className="accordion-body">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={wTwoCo}
                                            onChange={(e) => {
                                                setWTwoCo(e.target.checked);
                                                if (e.target.checked && !wUnits2.companyId) {
                                                    const other = companies.find(c => c.id != wCompanyId);
                                                    if (other) setWUnits2(prev => ({ ...prev, companyId: other.id }));
                                                }
                                            }}
                                        />
                                        <span><b>એક જ PDF માંથી બીજી કંપનીનું બિલ પણ સાથે બનાવવું છે</b></span>
                                    </label>

                                    {wTwoCo && (
                                        <div className="two-co-box">
                                            <div className="form-group">
                                                <label>બીજી કંપની પસંદ કરો</label>
                                                <select
                                                    className="form-control"
                                                    value={wUnits2.companyId}
                                                    onChange={(e) => setWUnits2({ ...wUnits2, companyId: e.target.value, invNo: '' })}
                                                >
                                                    {companies.filter(c => c.id != wCompanyId).map(c => (
                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="form-row-2">
                                                <div className="form-group">
                                                    <label>Credited Unit</label>
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        className="form-control"
                                                        value={wUnits2.credited}
                                                        onChange={(e) => setWUnits2({ ...wUnits2, credited: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Peak Unit</label>
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        className="form-control"
                                                        value={wUnits2.peak}
                                                        onChange={(e) => setWUnits2({ ...wUnits2, peak: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-row-2">
                                                <div className="form-group">
                                                    <label>Banking Unit</label>
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        className="form-control"
                                                        value={wUnits2.banking}
                                                        onChange={(e) => setWUnits2({ ...wUnits2, banking: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Generated (ખાલી=ઓટો)</label>
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        className="form-control"
                                                        value={wUnits2.generated}
                                                        onChange={(e) => setWUnits2({ ...wUnits2, generated: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </details>

                            {/* Section C: PGVCL Statement CREDIT OF OPEN ACCESS Values */}
                            <details className="accordion-sec" open>
                                <summary>
                                    <b>C. PGVCL Statement (CREDIT કોલમ)</b>
                                    <span className="accordion-badge live">રેટ ઓટો નીકળશે</span>
                                </summary>
                                <div className="accordion-body">
                                    <div className="form-row-2">
                                        <div className="form-group">
                                            <label>Total Unit (Statement)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wStmt.unit}
                                                placeholder="166107"
                                                onChange={(e) => setWStmt({ ...wStmt, unit: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Energy Charge (₹)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wStmt.energyAmt}
                                                placeholder="697649.40"
                                                onChange={(e) => setWStmt({ ...wStmt, energyAmt: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row-2">
                                        <div className="form-group">
                                            <label>FCA Charge (₹)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wStmt.fcaAmt}
                                                placeholder="406962.15"
                                                onChange={(e) => setWStmt({ ...wStmt, fcaAmt: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>P.F. Rebate (₹)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wStmt.pfAmt}
                                                placeholder="14301.81"
                                                onChange={(e) => setWStmt({ ...wStmt, pfAmt: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row-2">
                                        <div className="form-group">
                                            <label>EHV Rebate (₹)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wStmt.ehvAmt}
                                                placeholder="6976.49"
                                                onChange={(e) => setWStmt({ ...wStmt, ehvAmt: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Time of Use (₹)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wStmt.touAmt}
                                                placeholder="41995.95"
                                                onChange={(e) => setWStmt({ ...wStmt, touAmt: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row-2">
                                        <div className="form-group">
                                            <label>Total Peak Units (Statement)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wStmt.totalPeak}
                                                placeholder="49407"
                                                onChange={(e) => setWStmt({ ...wStmt, totalPeak: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Variable FPPAS (₹)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wStmt.varAmt}
                                                placeholder="44074.00"
                                                onChange={(e) => setWStmt({ ...wStmt, varAmt: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row-2">
                                        <div className="form-group">
                                            <label>Board Charge (Subtotal ₹)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wStmt.boardAmt}
                                                placeholder="1169403.19"
                                                onChange={(e) => setWStmt({ ...wStmt, boardAmt: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Electricity Duty (₹)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wStmt.dutyAmt}
                                                placeholder="175410.48"
                                                onChange={(e) => setWStmt({ ...wStmt, dutyAmt: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    {/* Live Derived Rates Ticker */}
                                    <div className="live-rates-ticker">
                                        ⚡ <b>ઓટો રેટ:</b> Energy: ₹{liveRates.energyRate.toFixed(2)} | FCA: ₹{liveRates.fcaRate.toFixed(2)} | PF: {liveRates.pfPct.toFixed(2)}% | EHV: {liveRates.ehvPct.toFixed(2)}% | ToU: ₹{liveRates.touRate.toFixed(2)} | Duty: {liveRates.dutyPct.toFixed(2)}%
                                    </div>
                                </div>
                            </details>

                            {/* Section D: Deductions */}
                            <details className="accordion-sec">
                                <summary>
                                    <b>D. ડિડક્શન & કપાત (Charges)</b>
                                    <span className="accordion-badge">કોન્ફિગ</span>
                                </summary>
                                <div className="accordion-body">
                                    <div className="form-row-2">
                                        <div className="form-group">
                                            <label>Wheeling Loss %</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wExtra.lossPct}
                                                onChange={(e) => setWExtra({ ...wExtra, lossPct: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Cross Subsidy %</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wExtra.crossPct}
                                                onChange={(e) => setWExtra({ ...wExtra, crossPct: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-row-2">
                                        <div className="form-group">
                                            <label>Wheeling Rate (₹/KWH)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wExtra.wheelRate}
                                                onChange={(e) => setWExtra({ ...wExtra, wheelRate: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Banking Rate (₹/Unit)</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wExtra.bankRate}
                                                onChange={(e) => setWExtra({ ...wExtra, bankRate: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </details>

                            <div className="wizard-btn-row">
                                <button type="button" className="btn-secondary" onClick={() => setWizStep(1)}>
                                    <ArrowLeft size={16} /> <span>{lang === 'en' ? 'Back' : 'પાછળ'}</span>
                                </button>
                                <button type="button" className="btn-primary" onClick={handleStep2Next}>
                                    <span>{lang === 'en' ? 'Preview & Verify Checks →' : 'પ્રીવ્યુ અને ચકાસણી →'}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Bill Preview & Validation Checks */}
                    {wizStep === 3 && (
                        <div className="billing-card">
                            <h3 className="card-title">
                                {lang === 'en' ? 'Step 3 — Bill Preview & Verification' : 'Step 3 — બિલ પ્રીવ્યુ અને ચકાસણી'}
                            </h3>

                            {computedBills.map((b, idx) => (
                                <div key={idx} className="preview-bill-wrapper">
                                    {computedBills.length > 1 && (
                                        <h4 className="bill-subheading">
                                            {idx + 1}. {b.company.name} (Invoice: {b.invNo})
                                        </h4>
                                    )}

                                    {/* 2 Checks: Bill-Rate & Ratio */}
                                    <div className="checks-box">
                                        {b.checks.map((c, ci) => (
                                            <div key={ci} className={`check-item ${c.ok ? 'pass' : 'fail'}`}>
                                                {c.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                                                <span>{c.text}</span>
                                            </div>
                                        ))}
                                        {b.result.warnings.map((w, wi) => (
                                            <div key={wi} className="check-item warn">
                                                <AlertTriangle size={16} />
                                                <span>{w}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Exact BILL OF SUPPLY Debit Memo Display */}
                                    <div className="printable-bill-sheet">
                                        <div className="sheet-header">
                                            <h2>{b.company.name}</h2>
                                            <p>{b.company.address}</p>
                                            <p>GSTIN: <b>{b.company.gstin || 'N/A'}</b> | Ph: {b.company.phones || 'N/A'}</p>
                                        </div>

                                        <div className="sheet-memo-bar">
                                            <span>Debit Memo</span>
                                            <b>BILL OF SUPPLY</b>
                                            <span>Original</span>
                                        </div>

                                        <table className="sheet-table info-table">
                                            <tbody>
                                                <tr>
                                                    <td style={{ width: '60%' }}>
                                                        <b>Bill To:</b><br />
                                                        <strong>{b.cust.name}</strong><br />
                                                        {b.cust.address}<br />
                                                        GSTIN: {b.cust.gst}
                                                    </td>
                                                    <td>
                                                        <b>Invoice No:</b> <strong>{b.invNo}</strong><br />
                                                        <b>Date:</b> {b.invDate}<br />
                                                        <b>Due Date:</b> {b.dueDate}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        <table className="sheet-table items-table">
                                            <thead>
                                                <tr>
                                                    <th>Sr</th>
                                                    <th>Product Name</th>
                                                    <th>HSN</th>
                                                    <th>Unit</th>
                                                    <th>Rate</th>
                                                    <th>Net Rate</th>
                                                    <th>Amount (₹)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td>1</td>
                                                    <td>Solar Power Generation {b.month}</td>
                                                    <td>2716</td>
                                                    <td>{inr(b.units.credited)}</td>
                                                    <td>{b.result.billRate.toFixed(5)}</td>
                                                    <td>{b.result.netRate.toFixed(5)}</td>
                                                    <td>{inr(b.result.net)}</td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        {/* Financial Summary */}
                                        <div className="sheet-summary-box">
                                            <div className="summary-row">
                                                <span>Sub Total:</span>
                                                <b>₹{inr(b.result.net)}</b>
                                            </div>
                                            <div className="summary-row discount">
                                                <span>Less: Discount ({inr(b.units.credited)} × ₹1.25):</span>
                                                <b>- ₹{inr(b.result.discountAmt)}</b>
                                            </div>

                                            {b.prevBal > 0 && (
                                                <div className="summary-row overdue">
                                                    <span>Previous Balance (Pending):</span>
                                                    <b>₹{inr(b.prevBal)}</b>
                                                </div>
                                            )}

                                            {b.interest > 0 && (
                                                <div className="summary-row overdue">
                                                    <span>Interest 18% p.a. ({b.interestDays} days):</span>
                                                    <b>₹{inr(b.interest)}</b>
                                                </div>
                                            )}

                                            <div className="summary-row">
                                                <span>Round Off:</span>
                                                <b>{b.result.roundOff.toFixed(2)}</b>
                                            </div>

                                            <div className="summary-row grand-total">
                                                <span>Total Outstanding Due:</span>
                                                <b>₹{inr(b.totalOut)}</b>
                                            </div>
                                        </div>

                                        <p className="amount-words">
                                            <b>Amount in words:</b> {numberToWords(b.totalOut)}
                                        </p>

                                        {/* Bank Details */}
                                        <div className="sheet-bank-box">
                                            <b>Bank Details:</b> {b.company.bank_name}<br />
                                            A/c: <strong>{b.company.bank_ac}</strong> | IFSC: <strong>{b.company.bank_ifsc}</strong>
                                        </div>

                                        <div className="sheet-terms">
                                            1. Interest @18% p.a. will be charged if payment is not made within due date.<br />
                                            2. "Subject to 'BOTAD' Jurisdiction only. E.&O.E."
                                        </div>

                                        <div className="sheet-signature-box">
                                            {settings.signature_url ? (
                                                <img src={settings.signature_url} alt="Signature" className="sig-img" />
                                            ) : (
                                                <div className="sig-spacer" />
                                            )}
                                            <p>For, <b>{b.company.name}</b><br />(Authorised Signatory)</p>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <div className="wizard-btn-row">
                                <button type="button" className="btn-secondary" onClick={() => setWizStep(2)}>
                                    <ArrowLeft size={16} /> <span>{lang === 'en' ? 'Back' : 'પાછળ'}</span>
                                </button>
                                <button
                                    type="button"
                                    className="btn-action-print"
                                    onClick={() => handlePrintInvoice(computedBills[0])}
                                >
                                    <Printer size={16} /> <span>{lang === 'en' ? 'Print / PDF' : 'પ્રિન્ટ / PDF'}</span>
                                </button>
                                <button
                                    type="button"
                                    className="btn-action-email"
                                    onClick={() => handleEmailInvoice(computedBills[0])}
                                >
                                    <Mail size={16} /> <span>Email (mailto)</span>
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    disabled={isSaving}
                                    onClick={handleSaveBill}
                                >
                                    {isSaving ? (
                                        <span>{lang === 'en' ? 'Saving...' : 'સેવ થઈ રહ્યું છે...'}</span>
                                    ) : (
                                        <>
                                            <Check size={16} />
                                            <span>{lang === 'en' ? '✓ Save Bill to Ledger' : '✓ લેજરમાં બિલ સેવ કરો'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Completion */}
                    {wizStep === 4 && (
                        <div className="billing-card completion-card">
                            <div className="completion-icon">✓</div>
                            <h3>{saveSuccessCount} {lang === 'en' ? 'Bill(s) Saved Successfully!' : 'બિલ સફળતાપૂર્વક સેવ થઈ ગયું!'}</h3>
                            <p className="completion-sub">
                                {lang === 'en'
                                    ? 'The invoice has been safely recorded in the database ledger with unique collision protection and mathematical audit JSON.'
                                    : 'ઇનવોઇસ ડેટાબેઝ લેજરમાં યુનિક નંબર અને ઓડિટ બ્રેકડાઉન સાથે સુરક્ષિત સેવ થઈ ગયું છે.'}
                            </p>

                            <div className="wizard-btn-row center">
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => {
                                        setActiveTab('records');
                                        fetchBills();
                                    }}
                                >
                                    <FolderClock size={16} />
                                    <span>{lang === 'en' ? 'View in Records & Ledger' : 'લેજરમાં જુઓ'}</span>
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={resetWizard}
                                >
                                    <Plus size={16} />
                                    <span>{lang === 'en' ? '+ Create Another Bill' : '+ નવું બિલ બનાવો'}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: RECORDS & LIVE LEDGER */}
            {activeTab === 'records' && (
                <div className="billing-records-container">
                    {/* Summary KPI Cards */}
                    {summary && (
                        <div className="records-kpi-grid">
                            <div className="kpi-card">
                                <span className="kpi-label">{lang === 'en' ? 'Total Billed' : 'કુલ બિલ રકમ'}</span>
                                <b className="kpi-val">₹{inr(summary.total_billed)}</b>
                            </div>
                            <div className="kpi-card paid">
                                <span className="kpi-label">{lang === 'en' ? 'Total Received (Paid)' : 'જમા થયેલ (Paid)'}</span>
                                <b className="kpi-val">₹{inr(summary.total_paid)}</b>
                            </div>
                            <div className="kpi-card pending">
                                <span className="kpi-label">{lang === 'en' ? 'Pending (Snapshot)' : 'બાકી (મૂળ બિલ)'}</span>
                                <b className="kpi-val">₹{inr(summary.total_pending)}</b>
                                <small>({summary.pending_count} બિલ બાકી)</small>
                            </div>
                            <div className="kpi-card live-due">
                                <span className="kpi-label">⚡ {lang === 'en' ? 'Live Accrued Total Due' : 'કુલ લેણી રકમ (લાઇવ ૧૮% વ્યાજ સાથે)'}</span>
                                <b className="kpi-val">₹{inr(summary.total_live_due)}</b>
                                <small>Live overdue interest applied</small>
                            </div>
                        </div>
                    )}

                    {/* Filter & Search Bar */}
                    <div className="records-filter-bar">
                        <div className="filter-group">
                            <select
                                className="form-control"
                                value={filterCompany}
                                onChange={(e) => setFilterCompany(e.target.value)}
                            >
                                <option value="all">{lang === 'en' ? 'All Companies' : 'બધી કંપનીઓ'}</option>
                                {companies.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="filter-group">
                            <select
                                className="form-control"
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                            >
                                <option value="all">{lang === 'en' ? 'All Status' : 'બધા સ્ટેટસ'}</option>
                                <option value="pending">Pending (બાકી)</option>
                                <option value="paid">Paid (ચૂકવાઈ ગયેલ)</option>
                                <option value="void">Void (રદ કરેલ)</option>
                            </select>
                        </div>
                        <div className="search-group">
                            <Search size={16} />
                            <input
                                type="text"
                                className="form-control"
                                placeholder={lang === 'en' ? 'Search invoice, month...' : 'ઇનવોઇસ નં, મહિનો શોધો...'}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Bills Table / Cards */}
                    <div className="records-list">
                        {bills.length === 0 ? (
                            <div className="empty-records">
                                <FolderClock size={36} />
                                <p>{lang === 'en' ? 'No billing records found.' : 'કોઈ બિલ રેકોર્ડ મળ્યા નથી.'}</p>
                            </div>
                        ) : (
                            bills.map((bill) => {
                                const isPending = bill.status === 'pending';
                                const isVoid = bill.status === 'void';
                                const live = bill.live_ledger;

                                return (
                                    <div key={bill.id} className={`bill-record-card ${bill.status}`}>
                                        <div className="record-top-row">
                                            <div className="record-title-col">
                                                <b className="record-inv-no">{bill.invoice_no}</b>
                                                <span className="record-company-name">{bill.company?.name}</span>
                                            </div>
                                            <div className="record-status-col">
                                                <span className={`status-pill ${bill.status}`}>
                                                    {isVoid ? 'VOID (રદ)' : isPending ? 'PENDING' : 'PAID'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="record-meta-row">
                                            <span>📅 મહિનો: <b>{bill.month}</b></span>
                                            <span>તારીખ: <b>{bill.invoice_date}</b></span>
                                            <span>ડ્યુ: <b>{bill.due_date}</b></span>
                                            <span>યુનિટ્સ: <b>{inr(bill.units_credited)}</b></span>
                                        </div>

                                        <div className="record-amount-row">
                                            <div>
                                                <small>બિલ રકમ:</small>
                                                <b>₹{inr(bill.total_outstanding)}</b>
                                            </div>
                                            {isPending && live?.is_overdue && (
                                                <div className="live-interest-tag">
                                                    ⚡ {live.overdue_days} દિવસ મોડું | +₹{inr(live.live_accrued_interest)} વ્યાજ = <b>₹{inr(live.current_total_due)}</b>
                                                </div>
                                            )}
                                        </div>

                                        {isVoid && bill.void_reason && (
                                            <div className="void-reason-box">
                                                ⚠️ <b>રદ કરવાનું કારણ:</b> {bill.void_reason} ({new Date(bill.voided_at).toLocaleDateString()})
                                            </div>
                                        )}

                                        {/* Action Buttons */}
                                        <div className="record-action-bar">
                                            <button
                                                type="button"
                                                className="btn-sm btn-view"
                                                onClick={() => setViewingBill(bill)}
                                            >
                                                <Eye size={14} /> <span>જુઓ</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-sm btn-print"
                                                onClick={() => handlePrintInvoice(bill)}
                                            >
                                                <Printer size={14} /> <span>પ્રિન્ટ</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-sm btn-email"
                                                onClick={() => handleEmailInvoice(bill)}
                                            >
                                                <Mail size={14} /> <span>Email</span>
                                            </button>

                                            {bill.pdf_path && (
                                                <a
                                                    href={bill.pdf_path}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="btn-sm btn-pdf-link"
                                                    title="View PGVCL Statement PDF"
                                                >
                                                    <Download size={14} /> <span>PDF</span>
                                                </a>
                                            )}

                                            {!isVoid && (
                                                <button
                                                    type="button"
                                                    className={`btn-sm ${isPending ? 'btn-mark-paid' : 'btn-mark-pending'}`}
                                                    onClick={() => handleTogglePaid(bill.id)}
                                                >
                                                    <RefreshCw size={14} />
                                                    <span>{isPending ? 'Paid કરો' : 'Pending કરો'}</span>
                                                </button>
                                            )}

                                            {!isVoid && (
                                                <button
                                                    type="button"
                                                    className="btn-sm btn-void"
                                                    onClick={() => setVoidModal({ open: true, bill, reason: '' })}
                                                    title="Mark bill as Void without deleting"
                                                >
                                                    <Ban size={14} /> <span>Void કરો</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* TAB: CA REPORT (GST & SALES REGISTER) */}
            {activeTab === 'ca' && (
                <div className="billing-ca-container">
                    {/* Header & Filter Card */}
                    <div className="billing-card">
                        <div className="card-header-flex">
                            <h3 className="card-title">
                                {lang === 'en' ? '📊 CA Report — GST & Outward Supply' : '📊 CA રિપોર્ટ — GST & સેલ્સ રજીસ્ટર'}
                            </h3>
                            <span className="accordion-badge live">ઓટોમેટિક ગણતરી</span>
                        </div>
                        <p className="form-hint" style={{ marginTop: '2px', marginBottom: '14px' }}>
                            {lang === 'en'
                                ? 'Automatic GST summary generated directly from saved bills. Ready to share with your Chartered Accountant.'
                                : 'સેવ થયેલા બિલમાંથી આપોઆપ તૈયાર થયેલ જીએસટી રિપોર્ટ. તમારા CA ને મોકલવા માટે સંપૂર્ણ તૈયાર.'}
                        </p>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Filter by Month' : 'મહિનો પસંદ કરો'}</label>
                                <select
                                    className="form-control"
                                    value={caMonth}
                                    onChange={(e) => setCaMonth(e.target.value)}
                                >
                                    <option value="">{lang === 'en' ? 'All Months' : 'બધા મહિના'}</option>
                                    {caMonths.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Filter by Company' : 'કંપની પસંદ કરો'}</label>
                                <select
                                    className="form-control"
                                    value={caCompanyId}
                                    onChange={(e) => setCaCompanyId(e.target.value)}
                                >
                                    <option value="">{lang === 'en' ? 'All Companies' : 'બધી કંપનીઓ'}</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* GSTR-1 Table 8 Summary */}
                    <div className="billing-card">
                        <h3 className="card-title">
                            {lang === 'en' ? 'GSTR-1 Table 8 — Nil / Exempt Supply' : 'GSTR-1 Table 8 — Nil / Exempt આઉટવર્ડ સપ્લાય'}
                        </h3>
                        <div className="ca-krow">
                            <span>Intra-state Outward (ગુજરાત અંદર):</span>
                            <b>₹{inr(caData.intra)}</b>
                        </div>
                        <div className="ca-krow">
                            <span>Inter-state Outward (ગુજરાત બહાર):</span>
                            <b>₹{inr(caData.inter)}</b>
                        </div>
                        <div className="ca-krow total">
                            <span><b>કુલ મુક્ત સપ્લાય (Total Exempt Outward):</b></span>
                            <b style={{ color: '#059669', fontSize: '16px' }}>₹{inr(caData.total)}</b>
                        </div>
                        <p className="form-hint" style={{ marginTop: '10px' }}>
                            💡 <b>GST કાયદો:</b> સૌર વીજળી (HSN 2716) જીએસટી મુક્ત (Exempt) હોવાથી ટેક્સ ઇનવોઇસ નહીં, પરંતુ <b>Bill of Supply</b> જ બને. આ રકમ તમારા CA સીધી GSTR-1 Table 8 માં ભરશે.
                        </p>
                    </div>

                    {/* HSN Summary */}
                    <div className="billing-card">
                        <h3 className="card-title">HSN Summary — 2716 (Electrical Energy)</h3>
                        <div className="ca-krow">
                            <span>HSN Code:</span>
                            <b>2716 — Electrical energy</b>
                        </div>
                        <div className="ca-krow">
                            <span>UQC (Unit of Quantity):</span>
                            <b>KWH</b>
                        </div>
                        <div className="ca-krow">
                            <span>Total Credited Units:</span>
                            <b>{inr(caData.qty)} KWH</b>
                        </div>
                        <div className="ca-krow total">
                            <span>Total Invoice Value:</span>
                            <b>₹{inr(caData.total)}</b>
                        </div>
                    </div>

                    {/* Sales Register */}
                    <div className="billing-card">
                        <div className="card-header-flex">
                            <h3 className="card-title">
                                {lang === 'en' ? 'Sales Register' : 'સેલ્સ રજીસ્ટર (તારીખ વાઈઝ બિલ લિસ્ટ)'}
                                <span className="accordion-badge" style={{ marginLeft: '8px' }}>{caData.rows.length} બિલ્સ</span>
                            </h3>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table className="ca-table">
                                <thead>
                                    <tr>
                                        <th>તારીખ</th>
                                        <th>ઇનવોઇસ નં.</th>
                                        <th>કંપની</th>
                                        <th>યુનિટ્સ (KWH)</th>
                                        <th>બિલ રકમ (₹)</th>
                                        <th>રાજ્ય પ્રકાર</th>
                                        <th>સ્ટેટસ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {caData.rows.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', color: '#64748b', padding: '16px' }}>
                                                પસંદ કરેલા ફિલ્ટરમાં કોઈ બિલ નથી.
                                            </td>
                                        </tr>
                                    ) : (
                                        caData.rows.map((r, i) => (
                                            <tr key={i}>
                                                <td>{r.b.invoice_date}</td>
                                                <td><b>{r.b.invoice_no}</b></td>
                                                <td>{r.c?.name}</td>
                                                <td>{inr(r.units)}</td>
                                                <td><b>₹{inr(r.value)}</b></td>
                                                <td>
                                                    <span className={`status-pill ${r.isIntra ? 'paid' : 'pending'}`} style={{ fontSize: '10px' }}>
                                                        {r.isIntra ? 'Intra (GUJ)' : 'Inter-State'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`status-pill ${r.b.status}`} style={{ fontSize: '10px' }}>
                                                        {r.b.status === 'paid' ? 'PAID' : 'PENDING'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Export Buttons */}
                        <div className="wizard-btn-row" style={{ marginTop: '14px' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={exportCaCsv}
                            >
                                <Download size={16} />
                                <span>{lang === 'en' ? '⬇ Export CSV (For CA)' : '⬇ CSV ડાઉનલોડ (CA માટે)'}</span>
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={exportCaJson}
                            >
                                <Download size={16} />
                                <span>{lang === 'en' ? '⬇ Export JSON' : '⬇ JSON ડાઉનલોડ'}</span>
                            </button>
                        </div>
                    </div>

                    {/* CA Checklist & Statutory Notes */}
                    <div className="billing-card ca-checklist-card">
                        <h3 className="card-title">
                            {lang === 'en' ? 'CA Checklist & Compliance Notes' : 'CA ચેકલિસ્ટ & કાનૂની માર્ગદર્શન'}
                        </h3>
                        <div className="check-item pass" style={{ marginBottom: '8px' }}>
                            <CheckCircle2 size={16} />
                            <span>GSTR-1 Table 8 (Nil/Exempt Supply) — ઓટોમેટિક તૈયાર</span>
                        </div>
                        <div className="check-item pass" style={{ marginBottom: '8px' }}>
                            <CheckCircle2 size={16} />
                            <span>HSN Summary (2716 Electrical Energy - KWH) — ઓટોમેટિક તૈયાર</span>
                        </div>
                        <div className="check-item pass" style={{ marginBottom: '8px' }}>
                            <CheckCircle2 size={16} />
                            <span>Sales Register & Outward Invoices — ઓટોમેટિક તૈયાર</span>
                        </div>

                        <div className="ca-note-item">
                            <b>• E-invoice:</b> જો વાર્ષિક ટર્નઓવર ₹૫ કરોડથી વધુ હોય તો CA ની સલાહ લેવી (વીજળી એક્ઝેમ્પ હોવાથી સામાન્ય રીતે ફરજિયાત નથી, પણ નિયમ ધ્યાન પર રાખવો).
                        </div>
                        <div className="ca-note-item">
                            <b>• E-way bill:</b> પાવર ગ્રીડ મારફત થતા વીજળી ટ્રાન્સમિશન પર ઇ-વે બિલ લાગુ પડતું નથી.
                        </div>
                        <div className="ca-note-item">
                            <b>• TDS (Income Tax):</b> બિલિંગ/ઇનવોઇસ બનાવતી વખતે કાપવાનું હોતું નથી; સામેવાળી ખરીદનાર કંપની પેમેન્ટ વખતે TDS કાપતી હોય તો CA સાથે તાલમેલ સાધવો.
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: COMPANIES CONFIGURATION */}
            {activeTab === 'companies' && (
                <div className="billing-companies-container">
                    <div className="card-header-flex">
                        <h3 className="card-title">
                            {lang === 'en' ? 'Solar Billing Companies' : 'સોલાર બિલિંગ કંપનીઓ'}
                        </h3>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setEditingCompany({
                                name: '', gstin: '', address: '', phones: '',
                                bank_name: '', bank_ac: '', bank_ifsc: '', discount: '1.25',
                                inv_prefix: 'RS', last_seq: 0, active: true
                            })}
                        >
                            <Plus size={16} /> <span>+ નવી કંપની</span>
                        </button>
                    </div>

                    <div className="companies-grid">
                        {companies.map(c => (
                            <div key={c.id} className="company-profile-card">
                                <div className="card-head">
                                    <b>{c.name}</b>
                                    <button
                                        type="button"
                                        className="btn-edit-link"
                                        onClick={() => setEditingCompany(c)}
                                    >
                                        Edit
                                    </button>
                                </div>
                                <div className="card-body">
                                    <p><b>GSTIN:</b> {c.gstin || 'N/A'}</p>
                                    <p><b>બેંક:</b> {c.bank_name || 'N/A'}</p>
                                    <p><b>A/c:</b> {c.bank_ac || 'N/A'} (IFSC: {c.bank_ifsc || 'N/A'})</p>
                                    <p><b>ઇનવોઇસ સીરિઝ:</b> {c.inv_prefix} (છેલ્લો નં: {c.last_seq})</p>
                                    <p><b>PPA ડિસ્કાઉન્ટ:</b> ₹{c.discount || '1.25'}/unit</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB 4: GLOBAL SETUP & SIGNATURE */}
            {activeTab === 'setup' && (
                <div className="billing-setup-container">
                    <div className="billing-card">
                        <h3 className="card-title">{lang === 'en' ? 'Global Billing Configuration' : 'મૂળભૂત નિયમો અને સેટિંગ'}</h3>
                        <p className="form-hint">
                            આ સેટિંગ્સ ડિફોલ્ટ ગણતરી માટે છે. દરેક બિલ વખતે રેટ PGVCL સ્ટેટમેન્ટમાંથી ઓટોમેટિક નીકળશે.
                        </p>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>Default PPA Discount (₹/unit)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={settings.default_discount || '1.25'}
                                    onChange={(e) => setSettings({ ...settings, default_discount: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Annual Interest % (બાકી રકમ પર p.a.)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className="form-control"
                                    value={settings.interest_pct || '18.0'}
                                    onChange={(e) => setSettings({ ...settings, interest_pct: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>Wheeling Loss %</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={settings.loss_pct || '6.5'}
                                    onChange={(e) => setSettings({ ...settings, loss_pct: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Payment Due Days (ઇનવોઇસ તારીખથી)</label>
                                <input
                                    type="number"
                                    step="1"
                                    className="form-control"
                                    value={settings.due_days || '15'}
                                    onChange={(e) => setSettings({ ...settings, due_days: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>Cross Subsidy %</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={settings.cross_pct || '15.0'}
                                    onChange={(e) => setSettings({ ...settings, cross_pct: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Wheeling Rate (₹/KWH)</label>
                                <input
                                    type="number"
                                    step="0.0001"
                                    className="form-control"
                                    value={settings.wheel_rate || '0.2352'}
                                    onChange={(e) => setSettings({ ...settings, wheel_rate: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="wizard-btn-row">
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={async () => {
                                    try {
                                        await api('billing/settings', {
                                            method: 'POST',
                                            body: JSON.stringify(settings)
                                        });
                                        alert('Settings saved successfully ✓');
                                    } catch (err) {
                                        alert(err.message || 'Error saving settings');
                                    }
                                }}
                            >
                                {lang === 'en' ? 'Save Settings' : 'સેટિંગ્સ સેવ કરો'}
                            </button>
                        </div>
                    </div>

                    {/* Signature Management */}
                    <div className="billing-card" style={{ marginTop: '16px' }}>
                        <h3 className="card-title">{lang === 'en' ? 'Authorised Digital Signature' : 'અધિકૃત સહી (Signature)'}</h3>
                        <p className="form-hint">
                            સહી અપલોડ કરો — દરેક બિલના 'BILL OF SUPPLY' પર આપોઆપ લાગશે.
                        </p>

                        <div className="sig-preview-area">
                            {settings.signature_url ? (
                                <img src={settings.signature_url} alt="Uploaded Signature" className="uploaded-sig" />
                            ) : (
                                <span className="no-sig-text">હજુ કોઈ સહી અપલોડ નથી કરી.</span>
                            )}
                        </div>

                        <input
                            type="file"
                            accept="image/*"
                            className="form-control"
                            onChange={async (e) => {
                                const file = e.target.files[0];
                                if (!file) return;
                                const fd = new FormData();
                                fd.append('signature_file', file);
                                try {
                                    const res = await api('billing/settings', {
                                        method: 'POST',
                                        body: fd
                                    });
                                    if (res?.settings) setSettings(res.settings);
                                    alert('સહી અપલોડ થઈ ગઈ ✓');
                                } catch (err) {
                                    alert(err.message || 'Error uploading signature');
                                }
                            }}
                        />
                    </div>
                </div>
            )}

            {/* VOID MODAL DIALOG */}
            {voidModal.open && (
                <div className="billing-modal-backdrop">
                    <div className="billing-modal-box">
                        <h3>⚠️ બિલ રદ (Void) કરો</h3>
                        <p>
                            ઇનવોઇસ <b>{voidModal.bill?.invoice_no}</b> કાયમી ડિલીટ નહીં થાય પરંતુ 'Void' માર્ક થશે, જેથી પાછલા બેલેન્સની ચેઇન અને ઓડિટ અખંડ રહે.
                        </p>
                        <div className="form-group">
                            <label>રદ કરવાનું કારણ (Reason):</label>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="દા.ત. યુનિટમાં ભૂલ હોવાથી નવું બિલ બનાવવાનું છે"
                                value={voidModal.reason}
                                onChange={(e) => setVoidModal({ ...voidModal, reason: e.target.value })}
                            />
                        </div>
                        <div className="wizard-btn-row">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setVoidModal({ open: false, bill: null, reason: '' })}
                            >
                                કેન્સલ
                            </button>
                            <button
                                type="button"
                                className="btn-danger"
                                onClick={handleConfirmVoid}
                            >
                                ખાતરી કરો - Void કરો
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT COMPANY MODAL */}
            {editingCompany && (
                <div className="billing-modal-backdrop">
                    <div className="billing-modal-box">
                        <h3>{editingCompany.id ? 'કંપની એડિટ કરો' : 'નવી કંપની ઉમેરો'}</h3>
                        <div className="form-group">
                            <label>Company Name</label>
                            <input
                                type="text"
                                className="form-control"
                                value={editingCompany.name || ''}
                                onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                            />
                        </div>
                        <div className="form-row-2">
                            <div className="form-group">
                                <label>GSTIN</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={editingCompany.gstin || ''}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, gstin: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Invoice Prefix (દા.ત. RS)</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={editingCompany.inv_prefix || ''}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, inv_prefix: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Address</label>
                            <input
                                type="text"
                                className="form-control"
                                value={editingCompany.address || ''}
                                onChange={(e) => setEditingCompany({ ...editingCompany, address: e.target.value })}
                            />
                        </div>
                        <div className="form-row-2">
                            <div className="form-group">
                                <label>Bank Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={editingCompany.bank_name || ''}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Bank A/c No.</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={editingCompany.bank_ac || ''}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_ac: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-row-2">
                            <div className="form-group">
                                <label>IFSC Code</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={editingCompany.bank_ifsc || ''}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_ifsc: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>PPA Discount (₹/unit)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={editingCompany.discount || ''}
                                    placeholder="1.25"
                                    onChange={(e) => setEditingCompany({ ...editingCompany, discount: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="wizard-btn-row">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setEditingCompany(null)}
                            >
                                રદ કરો
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={async () => {
                                    try {
                                        const endpoint = editingCompany.id
                                            ? `billing/companies/${editingCompany.id}`
                                            : 'billing/companies';
                                        await api(endpoint, {
                                            method: 'POST',
                                            body: JSON.stringify(editingCompany)
                                        });
                                        setEditingCompany(null);
                                        const comps = await api('billing/companies');
                                        if (comps) setCompanies(comps);
                                    } catch (err) {
                                        alert(err.message || 'Error saving company');
                                    }
                                }}
                            >
                                સેવ કરો
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW BILL MODAL */}
            {viewingBill && (
                <div className="billing-modal-backdrop" onClick={() => setViewingBill(null)}>
                    <div className="billing-modal-box large" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header-actions">
                            <h3>{viewingBill.invoice_no || viewingBill.invNo}</h3>
                            <div className="btn-group">
                                <button
                                    type="button"
                                    className="btn-action-print"
                                    onClick={() => handlePrintInvoice(viewingBill)}
                                >
                                    <Printer size={16} /> <span>Print</span>
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => setViewingBill(null)}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Printable Sheet */}
                        <div className="printable-bill-sheet">
                            <div className="sheet-header">
                                <h2>{viewingBill.company?.name}</h2>
                                <p>{viewingBill.company?.address}</p>
                                <p>GSTIN: <b>{viewingBill.company?.gstin || 'N/A'}</b> | Ph: {viewingBill.company?.phones || 'N/A'}</p>
                            </div>

                            <div className="sheet-memo-bar">
                                <span>Debit Memo</span>
                                <b>BILL OF SUPPLY</b>
                                <span>Original</span>
                            </div>

                            <table className="sheet-table info-table">
                                <tbody>
                                    <tr>
                                        <td style={{ width: '60%' }}>
                                            <b>Bill To:</b><br />
                                            <strong>{viewingBill.customer_name || viewingBill.cust?.name}</strong><br />
                                            {viewingBill.customer_address || viewingBill.cust?.address}<br />
                                            GSTIN: {viewingBill.customer_gstin || viewingBill.cust?.gst}
                                        </td>
                                        <td>
                                            <b>Invoice No:</b> <strong>{viewingBill.invoice_no || viewingBill.invNo}</strong><br />
                                            <b>Date:</b> {viewingBill.invoice_date || viewingBill.invDate}<br />
                                            <b>Due Date:</b> {viewingBill.due_date || viewingBill.dueDate}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <table className="sheet-table items-table">
                                <thead>
                                    <tr>
                                        <th>Sr</th>
                                        <th>Product Name</th>
                                        <th>HSN</th>
                                        <th>Unit</th>
                                        <th>Rate</th>
                                        <th>Net Rate</th>
                                        <th>Amount (₹)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>1</td>
                                        <td>Solar Power Generation {viewingBill.month}</td>
                                        <td>2716</td>
                                        <td>{inr(viewingBill.units_credited || viewingBill.units?.credited)}</td>
                                        <td>{Number(viewingBill.breakdown?.billRate || viewingBill.result?.billRate || 0).toFixed(5)}</td>
                                        <td>{Number(viewingBill.breakdown?.netRate || viewingBill.result?.netRate || 0).toFixed(5)}</td>
                                        <td>{inr(viewingBill.sub_total || viewingBill.result?.net)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="sheet-summary-box">
                                <div className="summary-row">
                                    <span>Sub Total:</span>
                                    <b>₹{inr(viewingBill.sub_total || viewingBill.result?.net)}</b>
                                </div>
                                <div className="summary-row discount">
                                    <span>Less: Discount ({inr(viewingBill.units_credited || viewingBill.units?.credited)} × ₹1.25):</span>
                                    <b>- ₹{inr(viewingBill.discount_amt || viewingBill.result?.discountAmt)}</b>
                                </div>

                                {(viewingBill.prev_balance > 0 || viewingBill.prevBal > 0) && (
                                    <div className="summary-row overdue">
                                        <span>Previous Balance (Pending):</span>
                                        <b>₹{inr(viewingBill.prev_balance || viewingBill.prevBal)}</b>
                                    </div>
                                )}

                                {(viewingBill.interest_amt > 0 || viewingBill.interest > 0) && (
                                    <div className="summary-row overdue">
                                        <span>Interest 18% p.a. ({viewingBill.interest_days || viewingBill.interestDays} days):</span>
                                        <b>₹{inr(viewingBill.interest_amt || viewingBill.interest)}</b>
                                    </div>
                                )}

                                <div className="summary-row">
                                    <span>Round Off:</span>
                                    <b>{Number(viewingBill.round_off || viewingBill.result?.roundOff || 0).toFixed(2)}</b>
                                </div>

                                <div className="summary-row grand-total">
                                    <span>Total Outstanding Due:</span>
                                    <b>₹{inr(viewingBill.total_outstanding || viewingBill.totalOut)}</b>
                                </div>
                            </div>

                            <p className="amount-words">
                                <b>Amount in words:</b> {numberToWords(viewingBill.total_outstanding || viewingBill.totalOut)}
                            </p>

                            <div className="sheet-bank-box">
                                <b>Bank Details:</b> {viewingBill.company?.bank_name}<br />
                                A/c: <strong>{viewingBill.company?.bank_ac}</strong> | IFSC: <strong>{viewingBill.company?.bank_ifsc}</strong>
                            </div>

                            <div className="sheet-terms">
                                1. Interest @18% p.a. will be charged if payment is not made within due date.<br />
                                2. "Subject to 'BOTAD' Jurisdiction only. E.&O.E."
                            </div>

                            <div className="sheet-signature-box">
                                {settings.signature_url ? (
                                    <img src={settings.signature_url} alt="Signature" className="sig-img" />
                                ) : (
                                    <div className="sig-spacer" />
                                )}
                                <p>For, <b>{viewingBill.company?.name}</b><br />(Authorised Signatory)</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
