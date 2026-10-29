import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Receipt, Building2, FolderClock, Settings, Plus, Search,
    Printer, Mail, FileText, CheckCircle2, AlertTriangle,
    XCircle, Ban, Download, RefreshCw, Eye, ArrowRight,
    ArrowLeft, Check, Upload, HelpCircle, BarChart3,
    Trash2, Edit3, Scale, ChevronDown, ChevronUp, TrendingUp, X
} from 'lucide-react';
import { api } from '../api';
import { useLanguage } from '../context/LanguageContext';
import BillingEngine, {
    deriveRates, companyBill, computeInterest, runChecks,
    nextInvoiceNo, fyOf, numberToWords, inr, round2
} from '../utils/billingEngine';
import ExactSolarBillSheet from '../components/ExactSolarBillSheet';

// Auto-detect billing month from PDF raw text or filename
export function detectBillingMonth(rawText = '', fileName = '') {
    const months = [
        { regex: /Jan(?:uary)?/i, short: 'Jan' },
        { regex: /Feb(?:ruary)?/i, short: 'Feb' },
        { regex: /Mar(?:ch)?/i, short: 'Mar' },
        { regex: /Apr(?:il)?/i, short: 'Apr' },
        { regex: /May/i, short: 'May' },
        { regex: /Jun(?:e)?/i, short: 'Jun' },
        { regex: /Jul(?:y)?/i, short: 'Jul' },
        { regex: /Aug(?:ust)?/i, short: 'Aug' },
        { regex: /Sep(?:tember)?/i, short: 'Sep' },
        { regex: /Oct(?:ober)?/i, short: 'Oct' },
        { regex: /Nov(?:ember)?/i, short: 'Nov' },
        { regex: /Dec(?:ember)?/i, short: 'Dec' },
    ];

    const sources = [fileName, rawText].filter(Boolean);

    for (const text of sources) {
        // 1. Text Month with 2 or 4 digit year: e.g. "Aug-26", "October 2026", "Sep_26", "Nov 26"
        for (const m of months) {
            const rx = new RegExp(m.regex.source + '[\\s-_/]*(?:20)?(\\d{2})\\b', 'i');
            const match = text.match(rx);
            if (match) {
                return `${m.short}-${match[1]}`;
            }
        }

        // 2. Numeric Month pattern like "08-2026" or "10/26"
        const numRx = /(?:month|period|statement)?[^\d]*(0[1-9]|1[0-2])[\/\-_](?:20)?(\\d{2})\\b/i;
        const numMatch = text.match(numRx);
        if (numMatch) {
            const mIndex = parseInt(numMatch[1], 10) - 1;
            if (months[mIndex]) {
                return `${months[mIndex].short}-${numMatch[2]}`;
            }
        }
    }
    return null;
}

// Helper: Advance billing month by 1 (e.g. Aug-26 -> Sep-26, Dec-26 -> Jan-27)
export function advanceMonthString(monthStr) {
    if (!monthStr) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = monthStr.split(/[-_\s/]+/);
    if (parts.length >= 2) {
        const mName = parts[0];
        const yr = parts[1];
        const mIdx = months.findIndex(m => m.toLowerCase() === mName.toLowerCase());
        if (mIdx !== -1) {
            const nextIdx = (mIdx + 1) % 12;
            let yrNum = parseInt(yr, 10);
            if (nextIdx === 0) {
                yrNum += 1;
            }
            const formattedYr = yr.length === 4 ? String(yrNum) : String(yrNum).padStart(2, '0');
            return `${months[nextIdx]}-${formattedYr}`;
        }
    }
    return monthStr;
}

export default function BillingPage({ currentUser }) {
    const { lang, t } = useLanguage();

    // Navigation Tabs
    const [activeTab, setActiveTab] = useState('bill'); // 'bill' | 'records' | 'ca' | 'reconciliation' | 'companies' | 'setup'

    // Server State
    const [loading, setLoading] = useState(false);
    const [companies, setCompanies] = useState([]);
    const [settings, setSettings] = useState({});
    const [bills, setBills] = useState([]);
    const [summary, setSummary] = useState(null);

    // Filters for Records & CA Report Tab
    const [filterCompany, setFilterCompany] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterMonth, setFilterMonth] = useState('all');
    const [monthOptions, setMonthOptions] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [caMonth, setCaMonth] = useState('');
    const [caCompanyId, setCaCompanyId] = useState('');

    // Reconciliation Tab State
    const [reconData, setReconData] = useState(null);
    const [reconMonth, setReconMonth] = useState('');
    const [reconLoading, setReconLoading] = useState(false);
    const [showDayWise, setShowDayWise] = useState(false);

    // File Input Refs
    const sigInputRef = useRef(null);
    const lhInputRef = useRef(null);
    const globalSigRef = useRef(null);

    // Modals & Actions
    const [viewingBill, setViewingBill] = useState(null);
    const [voidModal, setVoidModal] = useState({ open: false, bill: null, reason: '' });
    const [editingCompany, setEditingCompany] = useState(null); // null or company object
    const [editingSignatureFile, setEditingSignatureFile] = useState(null);
    const [editingSignaturePreview, setEditingSignaturePreview] = useState(null);
    const [editingLetterheadFile, setEditingLetterheadFile] = useState(null);
    const [editingLetterheadPreview, setEditingLetterheadPreview] = useState(null);

    // Wizard State (Steps 1 to 4)
    const [wizStep, setWizStep] = useState(1);
    const [wCompanyId, setWCompanyId] = useState('');
    const [wMonth, setWMonth] = useState('');
    const [isAutoMonth, setIsAutoMonth] = useState(false);
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

    // Helper: apply company-specific billing parameters & compute due date
    const applyCompanyConfig = (comp, baseInvDate = wInvDate, currentSettings = settings) => {
        if (!comp) return;
        const fy = fyOf(baseInvDate);
        setWInvNo(nextInvoiceNo(comp, fy));

        const dueDays = parseInt(comp.due_days) || parseInt(currentSettings?.due_days) || 15;
        const d = new Date(baseInvDate);
        if (!isNaN(d.getTime())) {
            d.setDate(d.getDate() + dueDays);
            setWDueDate(d.toISOString().slice(0, 10));
        }

        setWExtra(prev => ({
            lossPct: (comp.loss_pct !== null && comp.loss_pct !== undefined && comp.loss_pct !== '') ? String(comp.loss_pct) : (prev.lossPct || currentSettings?.loss_pct || '6.5'),
            crossPct: (comp.cross_pct !== null && comp.cross_pct !== undefined && comp.cross_pct !== '') ? String(comp.cross_pct) : (prev.crossPct || currentSettings?.cross_pct || '15'),
            wheelRate: (comp.wheel_rate !== null && comp.wheel_rate !== undefined && comp.wheel_rate !== '') ? String(comp.wheel_rate) : (prev.wheelRate || currentSettings?.wheel_rate || '0.2352'),
            bankRate: (comp.bank_rate !== null && comp.bank_rate !== undefined && comp.bank_rate !== '') ? String(comp.bank_rate) : (prev.bankRate || '1.50'),
        }));
    };

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
                const first = compsRes[0];
                setWCompanyId(first.id);
                applyCompanyConfig(first, wInvDate, settRes);
            }

            if (settRes) {
                setWCust({
                    name: settRes.default_customer_name || 'Blueart Granito Pvt. Ltd.',
                    address: settRes.default_customer_address || 'S.No. 93/1P3, B/h. Keda Ceramic, Paneli Road, Morbi-363642',
                    gst: settRes.default_customer_gstin || '24AABCO3285B1ZU',
                });
            }

            loadMonths();
        } catch (err) {
            console.error('Error loading billing init data:', err);
        } finally {
            setLoading(false);
        }
    };

    // Load Distinct Billing Months for Filter
    const loadMonths = async () => {
        try {
            const m = await api('billing/months');
            if (Array.isArray(m)) setMonthOptions(m);
        } catch (err) {
            console.error('Error loading bill months:', err);
        }
    };

    // 2. Load Bills for Records / Ledger Tab
    const fetchBills = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterCompany !== 'all') params.append('company_id', filterCompany);
            if (filterStatus !== 'all') params.append('status', filterStatus);
            if (filterMonth !== 'all') params.append('month', filterMonth);
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

    // 3. Load Reconciliation Data
    const fetchReconciliation = async (monthOverride) => {
        setReconLoading(true);
        try {
            const targetMonth = monthOverride !== undefined ? monthOverride : reconMonth;
            const url = targetMonth ? `billing/reconciliation?month=${targetMonth}` : 'billing/reconciliation';
            const res = await api(url);
            if (res) {
                setReconData(res);
                if (!reconMonth && res.month) {
                    setReconMonth(res.month);
                }
            }
        } catch (err) {
            console.error('Error fetching reconciliation data:', err);
        } finally {
            setReconLoading(false);
        }
    };

    useEffect(() => {
        loadInitData();
    }, []);

    useEffect(() => {
        if (activeTab === 'records' || activeTab === 'ca') {
            fetchBills();
            loadMonths();
        } else if (activeTab === 'reconciliation') {
            fetchReconciliation();
        }
    }, [activeTab, filterCompany, filterStatus, filterMonth, searchQuery, reconMonth]);

    // Handle Company Switch in Step 1
    const handleCompanyChange = (compId) => {
        setWCompanyId(compId);
        const comp = companies.find(c => c.id == compId);
        if (comp) {
            applyCompanyConfig(comp, wInvDate, settings);
        }
    };

    // Auto calculate due date when invoice date changes
    useEffect(() => {
        const comp = companies.find(c => c.id == wCompanyId);
        const days = parseInt(comp?.due_days) || parseInt(settings?.due_days) || 15;
        const d = new Date(wInvDate);
        if (!isNaN(d.getTime())) {
            d.setDate(d.getDate() + days);
            setWDueDate(d.toISOString().slice(0, 10));
        }
    }, [wInvDate, wCompanyId]);

    // Handle PDF upload and auto-detect month
    const handlePdfUpload = async (file) => {
        if (!file) return;
        setWPdfFile(file);
        setWPdfName(file.name);

        let detected = detectBillingMonth('', file.name);
        if (!detected && file.slice) {
            try {
                const slice = file.slice(0, 131072);
                const text = await slice.text();
                detected = detectBillingMonth(text, file.name);
            } catch (e) {
                console.warn('PDF slice read failed', e);
            }
        }

        if (detected) {
            setWMonth(detected);
            setIsAutoMonth(true);
        }
    };

    // Live Derived Rates for Step 2
    const liveRates = useMemo(() => {
        return deriveRates(wStmt);
    }, [wStmt]);

    // Load Aug-26 Real Example for Quick Testing
    const handleLoadExample = () => {
        setWMonth('Aug-26');
        setWUnits({ credited: '105715', peak: '31708', banking: '20113', generated: '113064' });
        setWTwoCo(true);
        const secondCo = companies.find(c => c.id != wCompanyId) || { id: 2 };
        setWUnits2({
            companyId: secondCo.id,
            credited: '60392',
            peak: '17699',
            banking: '11497',
            generated: '64590'
        });
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
            setPendingInfo(pi || { prev_balance: 0, interest_amt: 0, interest_days: 0 });

            if (wTwoCo && wUnits2.companyId) {
                const pi2 = await api(`billing/pending/${wUnits2.companyId}`);
                setPendingInfo2(pi2 || { prev_balance: 0, interest_amt: 0, interest_days: 0 });
            }
        } catch (e) {
            console.warn('Pending balance fetch failed', e);
        }

        setWizStep(2);
    };

    // Advance Step 2 -> 3 (Preview & Check)
    const handleStep2Next = async () => {
        try {
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

            const comp1 = companies.find(c => c.id == wCompanyId) || {};
            const disc1 = comp1?.discount !== null && isFinite(parseFloat(comp1?.discount))
                ? parseFloat(comp1.discount)
                : (parseFloat(settings.default_discount) || 1.25);

            const rateOpts = {
                min_bill_rate: settings.min_bill_rate ? parseFloat(settings.min_bill_rate) : 6.0,
                max_bill_rate: settings.max_bill_rate ? parseFloat(settings.max_bill_rate) : 7.2
            };

            const res1 = companyBill(wUnits, liveRates, wExtra, { discount: disc1, ...rateOpts });
            const checks1 = runChecks(res1, wStmt, 0, rateOpts).slice(0, 2); // 2 Checks: Bill-Rate & Grand/Generated ratio

            const pBal1 = Number(pendingInfo?.prev_balance ?? pendingInfo?.prevBal) || 0;
            const pInt1 = Number(pendingInfo?.interest_amt ?? pendingInfo?.interest) || 0;
            const pDays1 = Number(pendingInfo?.interest_days ?? pendingInfo?.interestDays) || 0;

            const billList = [{
                company: comp1,
                discount: disc1,
                discountRate: disc1,
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
                prevBal: pBal1,
                interest: pInt1,
                interestDays: pDays1,
                totalOut: Math.round((pBal1 + pInt1 + res1.grand) * 100) / 100
            }];

            // If Two-Company mode is active
            if (wTwoCo && wUnits2.companyId) {
                const comp2 = companies.find(c => c.id == wUnits2.companyId) || {};
                const disc2 = comp2?.discount !== null && isFinite(parseFloat(comp2?.discount))
                    ? parseFloat(comp2.discount)
                    : (parseFloat(settings.default_discount) || 1.25);

                const fy = fyOf(wInvDate);
                const inv2 = wUnits2.invNo || nextInvoiceNo(comp2, fy);
                const res2 = companyBill(wUnits2, liveRates, wExtra, { discount: disc2, ...rateOpts });
                const checks2 = runChecks(res2, wStmt, 0, rateOpts).slice(0, 2);

                const pBal2 = Number(pendingInfo2?.prev_balance ?? pendingInfo2?.prevBal) || 0;
                const pInt2 = Number(pendingInfo2?.interest_amt ?? pendingInfo2?.interest) || 0;
                const pDays2 = Number(pendingInfo2?.interest_days ?? pendingInfo2?.interestDays) || 0;

                billList.push({
                    company: comp2,
                    discount: disc2,
                    discountRate: disc2,
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
                    prevBal: pBal2,
                    interest: pInt2,
                    interestDays: pDays2,
                    totalOut: Math.round((pBal2 + pInt2 + res2.grand) * 100) / 100
                });
            }

            setComputedBills(billList);
            setWizStep(3);
        } catch (err) {
            console.error('Step 2 advance error:', err);
            alert((lang === 'en' ? 'Error preparing bill preview: ' : 'બિલ પ્રિવ્યૂ તૈયાર કરવામાં ખામી: ') + err.message);
        }
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

    // Multi-month helper: Create next month bill keeping the same uploaded PDF
    const handleNewBillFromSamePdf = async () => {
        const nextM = advanceMonthString(wMonth);
        setWMonth(nextM);
        setIsAutoMonth(false);

        // Keep wPdfFile and wPdfName intact!
        setWUnits({ credited: '', peak: '', banking: '', generated: '' });
        setWTwoCo(false);
        setWUnits2({ companyId: '', credited: '', peak: '', banking: '', generated: '', invNo: '' });
        setWStmt({
            unit: '', energyAmt: '', fcaAmt: '', pfAmt: '', ehvAmt: '',
            touAmt: '', totalPeak: '', varAmt: '', boardAmt: '', dutyAmt: ''
        });
        setComputedBills([]);

        // Advance Invoice Number for company 1
        const comp = companies.find(c => c.id == wCompanyId);
        if (comp) {
            const fy = fyOf(wInvDate);
            setWInvNo(nextInvoiceNo(comp, fy));
        }

        // Fetch fresh pending balance & interest for company 1
        if (wCompanyId) {
            try {
                const pend = await api(`billing/pending/${wCompanyId}`);
                setPendingInfo(pend || { prevBal: 0, interest: 0, interestDays: 0 });
            } catch (e) {
                console.error('Error fetching updated pending balance:', e);
            }
        }

        setWizStep(1);
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

    const downloadReconciliationCsv = () => {
        if (!reconData) return;
        const sMonth = reconData.month || reconMonth || 'current';
        const lines = [
            'SOLAR GENERATION VS PGVCL CREDITED UNITS RECONCILIATION REPORT',
            `Billing Month,${reconData.month || ''},"${reconData.month_label || ''}"`,
            `Report Generated At,"${new Date().toLocaleString('en-IN')}"`,
            '',
            'METRIC,VALUE,UNIT',
            `Plant Meter Export (Site),${reconData.summary?.plant_meter_export || 0},KWH`,
            `Plant Meter Import (Site),${reconData.summary?.plant_meter_import || 0},KWH`,
            `PGVCL Credited Units (Bill),${reconData.summary?.pgvcl_credited_units || 0},KWH`,
            `Variance / Generation Loss,${reconData.summary?.unit_difference || 0},KWH`,
            `Loss Percentage,${reconData.summary?.loss_percentage || 0}%,%`,
            `Average Bill Rate,${reconData.summary?.avg_bill_rate || 0},Rs/Unit`,
            `Financial Loss Value,${reconData.summary?.financial_loss_value || 0},Rs`,
            '',
            'COMPANY BREAKDOWN',
            'Company Name,Invoice No,Credited Units (KWH),Share %,Allocated Meter Units (KWH),Diff Units (KWH),Bill Rate (Rs),Grand Total (Rs),Loss Value (Rs)',
            ...(reconData.companies || []).map(c => [
                `"${c.company_name}"`,
                `"${c.invoice_no}"`,
                c.credited_units,
                `${c.share_pct}%`,
                c.allocated_meter_units,
                c.unit_diff,
                c.bill_rate,
                c.grand_total,
                c.loss_value
            ].join(',')),
            '',
            'DAILY METER READINGS',
            'Date,Plant Export Unit (KWH),Plant Import Unit (KWH),Sub-Meter Export (KWH)',
            ...(reconData.daily_readings || []).map(d => [
                `"${d.date}"`,
                d.export_unit,
                d.import_unit,
                d.sub_export_unit
            ].join(','))
        ];

        dlFile(`SolarFlow-Reconciliation-${sMonth}.csv`, lines.join('\n'));
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
                    className={`nav-pill-btn ${activeTab === 'reconciliation' ? 'active' : ''}`}
                    onClick={() => setActiveTab('reconciliation')}
                >
                    <Scale size={17} />
                    <span>{lang === 'en' ? 'Reconciliation' : '📈 સરખામણી'}</span>
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

                            {/* 1. PDF Statement Upload & Auto-Detection at Top */}
                            <div className="pdf-upload-box" style={{
                                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                                border: '1.5px dashed #10b981',
                                borderRadius: '12px',
                                padding: '16px',
                                marginBottom: '18px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                    <label style={{ fontWeight: 800, color: '#065f46', fontSize: '13px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Upload size={16} />
                                        <span>{lang === 'en' ? 'PGVCL Open Access Statement PDF' : 'PGVCL સ્ટેટમેન્ટ PDF અપલોડ કરો'}</span>
                                    </label>
                                    <span style={{ fontSize: '11px', color: '#047857', background: '#d1fae5', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
                                        ⚡ {lang === 'en' ? 'Auto-detects Month & Stores for Audit' : 'મહિનો આપોઆપ આવી જશે'}
                                    </span>
                                </div>
                                <input
                                    type="file"
                                    accept=".pdf"
                                    className="form-control"
                                    onChange={(e) => handlePdfUpload(e.target.files[0])}
                                    style={{ background: '#ffffff' }}
                                />
                                {wPdfName && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                        <span className="upload-badge">📄 {wPdfName}</span>
                                        {isAutoMonth && (
                                            <span className="auto-detected-badge">
                                                <CheckCircle2 size={13} />
                                                <span>{lang === 'en' ? `✓ Auto-detected Month: ${wMonth}` : `✓ PDF માંથી મહિનો શોધાયો: ${wMonth}`}</span>
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Company Selector */}
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
                                        ? 'Invoice prefix, payment due days, bank details & company terms loaded automatically.'
                                        : 'કંપનીના શોર્ટ પ્રિફિક્સ, ચૂકવણી દિવસો, બેંક અને બિલિંગ નિયમો આપોઆપ સેટ થશે.'}
                                </small>
                            </div>

                            <div className="form-row-2">
                                <div className="form-group">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <label style={{ margin: 0 }}>{lang === 'en' ? 'Billing Month (e.g. Oct-26)' : 'મહિનો (દા.ત. Oct-26)'}</label>
                                        {isAutoMonth ? (
                                            <span style={{ fontSize: '11px', color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, border: '1px solid #a7f3d0' }}>
                                                ✓ {lang === 'en' ? 'Auto-detected from PDF' : 'PDF માંથી ઓટો'}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                                                {lang === 'en' ? 'Manual entry' : 'મેન્યુઅલ'}
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={wMonth}
                                        placeholder="Oct-26"
                                        onChange={(e) => {
                                            setWMonth(e.target.value);
                                            setIsAutoMonth(false);
                                        }}
                                    />
                                    <small className="form-hint">
                                        {lang === 'en' ? 'Auto-filled upon PDF upload, or adjust manually if required.' : 'PDF અપલોડ કરવાથી ઓટોમેટિક આવી જશે. જરૂર જણાયે અહીં બદલી શકો છો.'}
                                    </small>
                                </div>
                                <div className="form-group">
                                    <label>{lang === 'en' ? 'Invoice Date (Auto / Editable)' : 'ઇનવોઇસ તારીખ (Auto / Editable)'}</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={wInvDate}
                                        onChange={(e) => setWInvDate(e.target.value)}
                                    />
                                    <small className="form-hint">
                                        {lang === 'en' ? 'Defaults to today. Changeable if needed.' : 'આજની તારીખ ઓટો આવશે. જરૂર મુજબ બદલી શકાય.'}
                                    </small>
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
                                    <label>{lang === 'en' ? 'Payment Due Date (Auto / Editable)' : 'ચૂકવણી આખરી તારીખ (Auto / Editable)'}</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={wDueDate}
                                        onChange={(e) => setWDueDate(e.target.value)}
                                    />
                                    <small className="form-hint">
                                        {lang === 'en' ? 'Calculated from company due days. Editable.' : 'કંપનીના નક્કી કરેલા દિવસો મુજબ ઓટો ગણાશે. એડિટ કરી શકાય.'}
                                    </small>
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

                                    {/* Exact BILL OF SUPPLY Debit Memo Display (Rajeshwari Solar Official Format) */}
                                    <ExactSolarBillSheet
                                        company={b.company}
                                        customer={b.cust}
                                        invoiceNo={b.invNo}
                                        invoiceDate={b.invDate}
                                        dueDate={b.dueDate}
                                        month={b.month}
                                        units={b.units?.credited}
                                        billRate={b.result?.billRate}
                                        netRate={b.result?.netRate}
                                        subTotal={b.result?.net}
                                        discountRate={b.discount || b.company?.discount || 1.25}
                                        discountAmt={b.result?.discountAmt}
                                        prevBal={b.prevBal}
                                        interest={b.interest}
                                        interestDays={b.interestDays}
                                        interestPct={b.company?.interest_pct ?? 18}
                                        roundOff={b.result?.roundOff}
                                        totalOut={b.totalOut}
                                        note={b.note}
                                        settings={settings}
                                        lang={lang}
                                    />
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
                                    className="btn-secondary"
                                    style={{ borderColor: '#3b82f6', color: '#1d4ed8', background: '#eff6ff', fontWeight: 600 }}
                                    onClick={handleNewBillFromSamePdf}
                                    title={lang === 'en' ? 'Create next month bill using same uploaded PDF' : 'આ જ PDF માંથી હવે પછીના મહિનાનું બિલ બનાવો'}
                                >
                                    <RefreshCw size={16} />
                                    <span>{lang === 'en' ? '＋ New Bill from Same PDF' : '＋ આ જ PDF માંથી આગળનું બિલ'}</span>
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
                                value={filterMonth}
                                onChange={(e) => setFilterMonth(e.target.value)}
                            >
                                <option value="all">{lang === 'en' ? 'All Months' : 'બધા મહિના'}</option>
                                {monthOptions.map(m => (
                                    <option key={m} value={m}>{m}</option>
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
                                                    href={`/api/billing/bills/${bill.id}/pdf?inline=1`}
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

            {/* TAB: RECONCILIATION REPORT (Plant Meter Export vs PGVCL Credited Units) */}
            {activeTab === 'reconciliation' && (
                <div className="billing-reconciliation-container">
                    {/* Header Bar */}
                    <div className="card-header-flex no-print" style={{ marginBottom: '16px' }}>
                        <div>
                            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Scale size={20} color="#059669" />
                                <span>{lang === 'en' ? 'Plant Meter vs PGVCL Credited Units Reconciliation' : 'દૈનિક મીટર રીડિંગ vs PGVCL ક્રેડિટ યુનિટ્સ સરખામણી'}</span>
                            </h3>
                            <p className="card-subtitle" style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
                                {lang === 'en'
                                    ? 'Audit plant site generation against utility credit statements, loss % and financial variance.'
                                    : 'સોલાર પ્લાન્ટ સાઇટના મીટર એક્સપોર્ટ અને PGVCL બિલિંગ ક્રેડિટ યુનિટ વચ્ચેનો ઓડિટ તફાવત, વ્હીલિંગ લોસ % અને નાણાકીય નુકસાન વિશ્લેષણ.'}
                            </p>
                        </div>
                        <div className="recon-actions-bar" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {/* Month Dropdown */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 700, margin: 0, color: '#475569' }}>
                                    {lang === 'en' ? 'Month:' : 'મહિનો:'}
                                </label>
                                <select
                                    className="form-control"
                                    style={{ width: 'auto', minWidth: '110px', padding: '6px 12px', fontSize: '13px', fontWeight: 600 }}
                                    value={reconMonth}
                                    onChange={(e) => {
                                        setReconMonth(e.target.value);
                                        fetchReconciliation(e.target.value);
                                    }}
                                >
                                    {(reconData?.available_months || ['Oct-26', 'Sep-26', 'Aug-26']).map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>

                            <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '13px' }}
                                onClick={() => fetchReconciliation(reconMonth)}
                                title={lang === 'en' ? 'Refresh Report' : 'રિપોર્ટ રિફ્રેશ કરો'}
                            >
                                <RefreshCw size={14} className={reconLoading ? 'animate-spin' : ''} />
                                <span>{lang === 'en' ? 'Refresh' : 'રિફ્રેશ'}</span>
                            </button>

                            <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '13px' }}
                                onClick={downloadReconciliationCsv}
                                title={lang === 'en' ? 'Download CSV' : 'CSV ડાઉનલોડ'}
                            >
                                <Download size={14} />
                                <span>CSV</span>
                            </button>

                            <button
                                type="button"
                                className="btn-primary"
                                style={{ padding: '6px 14px', fontSize: '13px' }}
                                onClick={() => window.print()}
                                title={lang === 'en' ? 'Print or Save as PDF' : 'પ્રિન્ટ / PDF સેવ કરો'}
                            >
                                <Printer size={14} />
                                <span>{lang === 'en' ? 'Print / PDF' : 'પ્રિન્ટ / PDF'}</span>
                            </button>
                        </div>
                    </div>

                    {reconLoading ? (
                        <div className="billing-card" style={{ textAlign: 'center', padding: '40px' }}>
                            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', color: '#3b82f6' }} />
                            <p style={{ color: '#64748b', fontSize: '14px' }}>
                                {lang === 'en' ? 'Analyzing daily meter readings and PGVCL bills...' : 'દૈનિક મીટર રીડિંગ્સ અને PGVCL બિલની સરખામણી થઈ રહી છે...'}
                            </p>
                        </div>
                    ) : !reconData ? (
                        <div className="billing-card" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                            <AlertTriangle size={24} style={{ color: '#f59e0b', margin: '0 auto 8px' }} />
                            <p>{lang === 'en' ? 'No reconciliation data available for this period.' : 'પસંદ કરેલા મહિના માટે કોઈ રીડિંગ અથવા બિલ મળ્યા નથી.'}</p>
                        </div>
                    ) : (
                        <>
                            {/* 4 Summary KPI Cards */}
                            <div className="recon-grid-kpis">
                                {/* KPI 1: Plant Meter Export */}
                                <div className="recon-kpi-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                                    <div className="recon-kpi-label">{lang === 'en' ? 'Plant Meter Export (Site)' : 'પ્લાન્ટ મીટર એક્સપોર્ટ (સાઇટ)'}</div>
                                    <div className="recon-kpi-val" style={{ color: '#1e40af' }}>
                                        {Math.round(reconData.summary?.plant_meter_export || 0).toLocaleString('en-IN')}{' '}
                                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748b' }}>KWH</span>
                                    </div>
                                    <div className="recon-kpi-sub">
                                        {lang === 'en'
                                            ? `Import: ${Math.round(reconData.summary?.plant_meter_import || 0).toLocaleString('en-IN')} KWH • ${reconData.summary?.reading_days || 0} reading days`
                                            : `ઇમ્પોર્ટ: ${Math.round(reconData.summary?.plant_meter_import || 0).toLocaleString('en-IN')} KWH • ${reconData.summary?.reading_days || 0} દિવસો`}
                                    </div>
                                </div>

                                {/* KPI 2: PGVCL Credited Units */}
                                <div className="recon-kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
                                    <div className="recon-kpi-label">{lang === 'en' ? 'PGVCL Credited Units (Bill)' : 'PGVCL ક્રેડિટ યુનિટ્સ (બિલ)'}</div>
                                    <div className="recon-kpi-val" style={{ color: '#065f46' }}>
                                        {Math.round(reconData.summary?.pgvcl_credited_units || 0).toLocaleString('en-IN')}{' '}
                                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748b' }}>KWH</span>
                                    </div>
                                    <div className="recon-kpi-sub">
                                        {lang === 'en'
                                            ? `Gross Gen: ${Math.round(reconData.summary?.pgvcl_generated_units || 0).toLocaleString('en-IN')} KWH`
                                            : `કુલ જનરેશન: ${Math.round(reconData.summary?.pgvcl_generated_units || 0).toLocaleString('en-IN')} KWH`}
                                    </div>
                                </div>

                                {/* KPI 3: Unit Variance & Loss % */}
                                <div className="recon-kpi-card" style={{ borderLeft: `4px solid ${(reconData.summary?.loss_percentage || 0) > 8 ? '#ef4444' : '#f59e0b'}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div className="recon-kpi-label">{lang === 'en' ? 'Loss / Difference' : 'તફાવત / વ્હીલિંગ લોસ'}</div>
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: 800,
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            background: (reconData.summary?.loss_percentage || 0) > 8 ? '#fee2e2' : '#fef3c7',
                                            color: (reconData.summary?.loss_percentage || 0) > 8 ? '#991b1b' : '#92400e'
                                        }}>
                                            {reconData.summary?.loss_percentage || 0}% {lang === 'en' ? 'Loss' : 'લોસ'}
                                        </span>
                                    </div>
                                    <div className="recon-kpi-val" style={{ color: (reconData.summary?.unit_difference || 0) > 0 ? '#b45309' : '#059669' }}>
                                        {Math.round(reconData.summary?.unit_difference || 0).toLocaleString('en-IN')}{' '}
                                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748b' }}>KWH</span>
                                    </div>
                                    <div className="recon-kpi-sub">
                                        {lang === 'en' ? 'Difference between plant export & credited units' : 'પ્લાન્ટ એક્સપોર્ટ અને PGVCL ક્રેડિટ વચ્ચેનો ગેપ'}
                                    </div>
                                </div>

                                {/* KPI 4: Financial Loss Value */}
                                <div className="recon-kpi-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
                                    <div className="recon-kpi-label">{lang === 'en' ? 'Financial Loss Value' : 'અંદાજિત તફાવત રકમ'}</div>
                                    <div className="recon-kpi-val" style={{ color: '#5b21b6' }}>
                                        ₹ {Math.round(reconData.summary?.financial_loss_value || 0).toLocaleString('en-IN')}
                                    </div>
                                    <div className="recon-kpi-sub">
                                        {lang === 'en'
                                            ? `At Avg Bill Rate: ₹${reconData.summary?.avg_bill_rate || 0}/unit`
                                            : `સરેરાશ બિલ રેટ: ₹${reconData.summary?.avg_bill_rate || 0}/unit લેખે`}
                                    </div>
                                </div>
                            </div>

                            {/* Company-wise Breakdown Table */}
                            <div className="billing-card" style={{ marginBottom: '20px' }}>
                                <div className="card-header-flex" style={{ marginBottom: '12px' }}>
                                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                                        🏢 {lang === 'en' ? 'Company-Wise Allocation & Difference' : 'કંપની વાઇઝ ક્રેડિટ ફાળવણી અને તફાવત'}
                                    </h4>
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                                        {lang === 'en' ? `Month: ${reconData.month_label}` : `બિલિંગ મહિનો: ${reconData.month_label}`}
                                    </span>
                                </div>

                                <div className="table-responsive">
                                    <table className="billing-table">
                                        <thead>
                                            <tr>
                                                <th>{lang === 'en' ? 'Company Name' : 'કંપનીનું નામ'}</th>
                                                <th>{lang === 'en' ? 'Invoice No.' : 'ઇનવોઇસ નં.'}</th>
                                                <th style={{ textAlign: 'right' }}>{lang === 'en' ? 'Credited (KWH)' : 'PGVCL ક્રેડિટ (KWH)'}</th>
                                                <th style={{ textAlign: 'right' }}>{lang === 'en' ? 'Share %' : 'હિસ્સો %'}</th>
                                                <th style={{ textAlign: 'right' }}>{lang === 'en' ? 'Meter Share (KWH)' : 'ફાળવેલ મીટર (KWH)'}</th>
                                                <th style={{ textAlign: 'right' }}>{lang === 'en' ? 'Loss Units (KWH)' : 'તફાવત યુનિટ (KWH)'}</th>
                                                <th style={{ textAlign: 'right' }}>{lang === 'en' ? 'Bill Rate' : 'બિલ રેટ (₹)'}</th>
                                                <th style={{ textAlign: 'right' }}>{lang === 'en' ? 'Grand Total' : 'બિલ રકમ (₹)'}</th>
                                                <th style={{ textAlign: 'right' }}>{lang === 'en' ? 'Loss Value' : 'નુકસાન રકમ (₹)'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!reconData.companies || reconData.companies.length === 0) ? (
                                                <tr>
                                                    <td colSpan="9" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                                                        {lang === 'en' ? 'No active bills recorded for this month.' : 'આ મહિના માટે કોઈ સેવ થયેલ બિલ મળ્યું નથી.'}
                                                    </td>
                                                </tr>
                                            ) : (
                                                reconData.companies.map((co, idx) => (
                                                    <tr key={idx}>
                                                        <td style={{ fontWeight: 600, color: '#0f172a' }}>{co.company_name}</td>
                                                        <td>
                                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0369a1' }}>
                                                                {co.invoice_no}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                                            {Math.round(co.credited_units).toLocaleString('en-IN')}
                                                        </td>
                                                        <td style={{ textAlign: 'right', color: '#64748b' }}>
                                                            {co.share_pct}%
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            {Math.round(co.allocated_meter_units).toLocaleString('en-IN')}
                                                        </td>
                                                        <td style={{ textAlign: 'right', color: co.unit_diff > 0 ? '#b45309' : '#059669', fontWeight: 700 }}>
                                                            {Math.round(co.unit_diff).toLocaleString('en-IN')}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            ₹ {Number(co.bill_rate).toFixed(4)}
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                                                            ₹ {Math.round(co.grand_total).toLocaleString('en-IN')}
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700, color: co.loss_value > 0 ? '#b91c1c' : '#64748b' }}>
                                                            ₹ {Math.round(co.loss_value).toLocaleString('en-IN')}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {reconData.companies && reconData.companies.length > 0 && (
                                            <tfoot>
                                                <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                                                    <td colSpan="2">{lang === 'en' ? 'Total / Weighted Average' : 'કુલ સરવાળો / સરેરાશ'}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        {Math.round(reconData.summary?.pgvcl_credited_units || 0).toLocaleString('en-IN')}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>100%</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        {Math.round(reconData.summary?.plant_meter_export || 0).toLocaleString('en-IN')}
                                                    </td>
                                                    <td style={{ textAlign: 'right', color: (reconData.summary?.unit_difference || 0) > 0 ? '#b45309' : '#059669' }}>
                                                        {Math.round(reconData.summary?.unit_difference || 0).toLocaleString('en-IN')}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        ₹ {Number(reconData.summary?.avg_bill_rate || 0).toFixed(4)}
                                                    </td>
                                                    <td style={{ textAlign: 'right', color: '#047857' }}>
                                                        ₹ {Math.round(reconData.summary?.pgvcl_grand_total || 0).toLocaleString('en-IN')}
                                                    </td>
                                                    <td style={{ textAlign: 'right', color: (reconData.summary?.financial_loss_value || 0) > 0 ? '#b91c1c' : '#64748b' }}>
                                                        ₹ {Math.round(reconData.summary?.financial_loss_value || 0).toLocaleString('en-IN')}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>

                            {/* Day-by-Day Reading Breakdown (Collapsible) */}
                            <div className="billing-card" style={{ marginBottom: '20px' }}>
                                <div
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => setShowDayWise(!showDayWise)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <FolderClock size={16} color="#3b82f6" />
                                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                                            📅 {lang === 'en' ? 'Day-by-Day Plant Meter Readings' : 'દૈનિક પ્લાન્ટ મીટર રીડિંગ્સ વિગત'} ({reconData.daily_readings?.length || 0} {lang === 'en' ? 'days' : 'દિવસો'})
                                        </h4>
                                    </div>
                                    <button type="button" className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }}>
                                        {showDayWise ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        <span>{showDayWise ? (lang === 'en' ? 'Hide Details' : 'છુપાવો') : (lang === 'en' ? 'Show Details' : 'વિગત જુઓ')}</span>
                                    </button>
                                </div>

                                {showDayWise && (
                                    <div className="table-responsive" style={{ marginTop: '14px', maxHeight: '380px', overflowY: 'auto' }}>
                                        <table className="billing-table">
                                            <thead>
                                                <tr>
                                                    <th>{lang === 'en' ? 'Date' : 'તારીખ'}</th>
                                                    <th style={{ textAlign: 'right' }}>{lang === 'en' ? 'Plant Export Unit (KWH)' : 'પ્લાન્ટ એક્સપોર્ટ યુનિટ (KWH)'}</th>
                                                    <th style={{ textAlign: 'right' }}>{lang === 'en' ? 'Plant Import Unit (KWH)' : 'પ્લાન્ટ ઇમ્પોર્ટ યુનિટ (KWH)'}</th>
                                                    <th style={{ textAlign: 'right' }}>{lang === 'en' ? 'Sub-Meter Export (KWH)' : 'સબ-મીટર એક્સપોર્ટ (KWH)'}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(!reconData.daily_readings || reconData.daily_readings.length === 0) ? (
                                                    <tr>
                                                        <td colSpan="4" style={{ textAlign: 'center', padding: '16px', color: '#94a3b8' }}>
                                                            {lang === 'en' ? 'No daily readings recorded for this calendar month.' : 'આ મહિના માટે કોઈ દૈનિક મીટર રીડિંગ દાખલ થયેલ નથી.'}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    reconData.daily_readings.map((d, idx) => (
                                                        <tr key={idx}>
                                                            <td style={{ fontWeight: 600 }}>{d.date}</td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>
                                                                {Math.round(d.export_unit).toLocaleString('en-IN')}
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                                                                {Math.round(d.import_unit).toLocaleString('en-IN')}
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: '#475569' }}>
                                                                {Math.round(d.sub_export_unit).toLocaleString('en-IN')}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Technical Audit & Loss Note */}
                            <div className="billing-card ca-checklist-card">
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '13.5px', color: '#065f46', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={16} />
                                    <span>{lang === 'en' ? 'Technical Audit & Loss Benchmarks' : 'ટેકનિકલ ઓડિટ & વ્હીલિંગ લોસ માર્ગદર્શિકા'}</span>
                                </h4>
                                <div className="ca-note-item">
                                    <b>• સ્વીકાર્ય વ્હીલિંગ લોસ રેન્જ:</b> સોલાર ઓપન એક્સેસ નિયમો અનુસાર ૬૬ કેવી / ૧૧ કેવી ટ્રાન્સમિશન નેટવર્કમાં ૪% થી ૮% સુધીનો વ્હીલિંગ અને ટ્રાન્સમિશન લોસ સામાન્ય ગણાય છે.
                                </div>
                                <div className="ca-note-item">
                                    <b>• નુકસાન નિયંત્રણ:</b> જો તફાવત ૮% થી વધી જાય તો GETCO સબસ્ટેશન મીટર અને પ્લાન્ટ મેઇન મીટર વચ્ચે સીટી/પીટી (CT/PT) ટેસ્ટિંગ અને ક્રેડિટ સ્ટેટમેન્ટ ક્રોસ-વેરિફિકેશન કરાવવું.
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* TAB 3: COMPANIES CONFIGURATION */}
            {activeTab === 'companies' && (
                <div className="billing-companies-container">
                    <div className="card-header-flex">
                        <div>
                            <h3 className="card-title">
                                {lang === 'en' ? 'Solar Billing Companies' : 'સોલાર બિલિંગ કંપનીઓ'}
                            </h3>
                            <small className="form-hint" style={{ marginTop: '2px', display: 'block' }}>
                                {lang === 'en'
                                    ? 'Each company has its own digital signature, letterhead format, and billing terms.'
                                    : 'દરેક કંપનીની પોતાની અલગ ડિજિટલ સહી, લેટરહેડ ફોર્મેટ અને બિલિંગ નિયમો.'}
                            </small>
                        </div>
                        <button
                            type="button"
                            className="btn-primary billing-btn-add-company"
                            onClick={() => {
                                setEditingCompany({
                                    name: '', gstin: '', address: '', phones: '',
                                    bank_name: '', bank_ac: '', bank_ifsc: '', discount: '1.25',
                                    inv_prefix: 'RS', active: true, signature_enabled: true,
                                    due_days: '15', interest_pct: '18.0', loss_pct: '6.5',
                                    wheel_rate: '0.2352', bank_rate: '1.50', cross_pct: '15.0',
                                    letterhead_mode: 'digital', signature_path: '', letterhead_path: ''
                                });
                                setEditingSignatureFile(null);
                                setEditingSignaturePreview(null);
                                setEditingLetterheadFile(null);
                                setEditingLetterheadPreview(null);
                            }}
                        >
                            <Plus size={16} /> <span>{lang === 'en' ? 'Add Company' : 'નવી કંપની ઉમેરો'}</span>
                        </button>
                    </div>

                    <div className="companies-grid">
                        {companies.map(c => (
                            <div key={c.id} className="company-profile-card">
                                <div className="card-head">
                                    <div style={{ display: 'grid', gap: '3px' }}>
                                        <b style={{ fontSize: '15px' }}>{c.name}</b>
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                                            {c.inv_prefix} (છેલ્લો નં: #{c.last_seq || 0})
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            type="button"
                                            className="btn-edit-link"
                                            onClick={() => {
                                                setEditingCompany({
                                                    ...c,
                                                    signature_enabled: c.signature_enabled !== false,
                                                    due_days: c.due_days !== null && c.due_days !== undefined ? String(c.due_days) : '15',
                                                    interest_pct: c.interest_pct !== null && c.interest_pct !== undefined ? String(c.interest_pct) : '18.0',
                                                    loss_pct: c.loss_pct !== null && c.loss_pct !== undefined ? String(c.loss_pct) : '6.5',
                                                    wheel_rate: c.wheel_rate !== null && c.wheel_rate !== undefined ? String(c.wheel_rate) : '0.2352',
                                                    bank_rate: c.bank_rate !== null && c.bank_rate !== undefined ? String(c.bank_rate) : '1.50',
                                                    cross_pct: c.cross_pct !== null && c.cross_pct !== undefined ? String(c.cross_pct) : '15.0',
                                                    letterhead_mode: c.letterhead_mode || 'digital',
                                                });
                                                setEditingSignatureFile(null);
                                                setEditingSignaturePreview(c.signature_path || null);
                                                setEditingLetterheadFile(null);
                                                setEditingLetterheadPreview(c.letterhead_path || null);
                                            }}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-edit-link"
                                            style={{ color: '#ef4444' }}
                                            onClick={async () => {
                                                if (!confirm(lang === 'en' ? `Delete company "${c.name}"?` : `શું તમે કંપની "${c.name}" ડિલીટ કરવા માંગો છો?`)) return;
                                                try {
                                                    await api(`billing/companies/${c.id}`, { method: 'DELETE' });
                                                    const comps = await api('billing/companies');
                                                    if (comps) setCompanies(comps);
                                                    alert(lang === 'en' ? 'Company deleted successfully' : 'કંપની સફળતાપૂર્વક ડિલીટ થઈ ગઈ');
                                                } catch (err) {
                                                    alert(err.message || 'Error deleting company');
                                                }
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                                <div className="card-body">
                                    <p><b>GSTIN:</b> {c.gstin || 'N/A'}</p>
                                    <p><b>બેંક:</b> {c.bank_name || 'N/A'}</p>
                                    <p><b>A/c:</b> {c.bank_ac || 'N/A'} (IFSC: {c.bank_ifsc || 'N/A'})</p>

                                    {/* Company Specific Terms Badges */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
                                        <span style={{ fontSize: '10.5px', background: '#ecfdf5', color: '#065f46', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                                            PPA: ₹{c.discount || '1.25'}/u
                                        </span>
                                        <span style={{ fontSize: '10.5px', background: '#eff6ff', color: '#1e40af', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                                            Due: {c.due_days || 15} Divas
                                        </span>
                                        <span style={{ fontSize: '10.5px', background: '#fef3c7', color: '#92400e', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                                            Vyaaj: {c.interest_pct || 18.0}% p.a.
                                        </span>
                                        <span style={{ fontSize: '10.5px', background: c.signature_path && c.signature_enabled !== false ? '#dcfce7' : '#f1f5f9', color: c.signature_path && c.signature_enabled !== false ? '#15803d' : '#64748b', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                                            {c.signature_path ? (c.signature_enabled !== false ? '✓ Digital Signature (ON)' : '○ Signature (OFF)') : 'No Signature'}
                                        </span>
                                        <span style={{ fontSize: '10.5px', background: '#f3e8ff', color: '#6b21a8', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                                            {c.letterhead_mode === 'custom_image' ? '🖼️ Custom Letterhead' : c.letterhead_mode === 'preprinted' ? '📄 Pre-printed Pad' : '🏢 Digital Header'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB 4: GLOBAL SETUP & SIGNATURE */}
            {activeTab === 'setup' && (
                <div className="billing-setup-container">
                    <div className="billing-card" style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                                <b style={{ color: '#0f172a', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Building2 size={16} color="#059669" />
                                    <span>{lang === 'en' ? 'Company-Specific Configurations Active' : 'કંપની દીઠ અલગ સેટિંગ્સ ઉપલબ્ધ'}</span>
                                </b>
                                <p className="form-hint" style={{ margin: '4px 0 0 0' }}>
                                    {lang === 'en'
                                        ? 'Each company now has its own Digital Signature, Letterhead Format, Due Days, Interest %, and Deduction rates configured under the Companies tab.'
                                        : 'હવે દરેક કંપનીની પોતાની અલગ ડિજિટલ સહી, લેટરહેડ ફોર્મેટ, ચૂકવણી દિવસો, વ્યાજ %, અને ડિડક્શન દરો "કંપનીઓ" ટેબમાંથી સીધા સેટ કરી શકાય છે.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="btn-secondary"
                                style={{ whiteSpace: 'nowrap', fontSize: '12px', padding: '6px 12px' }}
                                onClick={() => setActiveTab('companies')}
                            >
                                🏢 {lang === 'en' ? 'Go to Companies Tab →' : 'કંપનીઓ ટેબ પર જાઓ →'}
                            </button>
                        </div>
                    </div>

                    <div className="billing-card">
                        <h3 className="card-title">{lang === 'en' ? 'Global Default Fallback Configuration' : 'મૂળભૂત ડિફોલ્ટ સેટિંગ્સ (Fallback)'}</h3>
                        <p className="form-hint">
                            {lang === 'en'
                                ? 'These settings serve as system-wide fallback defaults when a company does not specify custom terms.'
                                : 'જો કોઈ કંપનીમાં કસ્ટમ રેટ ન હોય ત્યારે આ ડિફોલ્ટ સેટિંગ્સ લાગુ પડશે.'}
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

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Min Bill Rate Sanity (₹/unit)' : 'ન્યૂનતમ બિલ રેટ (₹/unit - ચેતવણી)'}</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    placeholder="6.00"
                                    value={settings.min_bill_rate || '6.00'}
                                    onChange={(e) => setSettings({ ...settings, min_bill_rate: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Max Bill Rate Sanity (₹/unit)' : 'મહત્તમ બિલ રેટ (₹/unit - ચેતવણી)'}</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    placeholder="7.20"
                                    value={settings.max_bill_rate || '7.20'}
                                    onChange={(e) => setSettings({ ...settings, max_bill_rate: e.target.value })}
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
                        <h3 className="card-title">{lang === 'en' ? 'Authorised Digital Signature (Default / Global)' : 'ગ્લોબલ અધિકૃત સહી (Default Signature)'}</h3>
                        <p className="form-hint" style={{ marginBottom: '12px' }}>
                            {lang === 'en'
                                ? 'Upload signature image — used as fallback for companies that do not have their own specific signature.'
                                : 'સહી અપલોડ કરો — જે કંપનીની પોતાની સહી નહીં હોય ત્યાં આ ડિફોલ્ટ સહી આપોઆપ લાગશે.'}
                        </p>

                        {settings.signature_url ? (
                            <div className="upload-card-preview">
                                <div className="upload-preview-left">
                                    <img src={settings.signature_url} alt="Uploaded Signature" className="upload-thumb-img" />
                                    <div className="upload-meta-info">
                                        <span className="upload-filename">
                                            {lang === 'en' ? 'Global Default Signature' : 'સિસ્ટમ ડિફોલ્ટ ડિજિટલ સહી'}
                                        </span>
                                        <span className="upload-badge-ok">
                                            <CheckCircle2 size={13} />
                                            {lang === 'en' ? 'Active on all bills' : 'બધા બિલ માટે સેટ છે'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="upload-delete-btn"
                                    title={lang === 'en' ? 'Remove Signature' : 'સહી હટાવો'}
                                    onClick={async () => {
                                        if (!confirm(lang === 'en' ? 'Remove global signature?' : 'શું ખરેખર ડિફોલ્ટ સહી હટાવવી છે?')) return;
                                        try {
                                            await api('billing/settings', {
                                                method: 'POST',
                                                body: JSON.stringify({ clear_signature: 1 })
                                            });
                                            setSettings(prev => ({ ...prev, signature_url: '', signature_path: '' }));
                                            if (globalSigRef.current) globalSigRef.current.value = '';
                                            alert(lang === 'en' ? 'Signature removed' : 'સહી હટાવી દેવામાં આવી ✓');
                                        } catch (err) {
                                            alert(err.message || 'Error removing signature');
                                        }
                                    }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ) : (
                            <div
                                className="custom-upload-zone"
                                onClick={() => globalSigRef.current?.click()}
                            >
                                <Upload size={24} color="#3b82f6" />
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                                    {lang === 'en' ? 'Choose Signature Image or Drag & Drop' : 'સહીની ઇમેજ પસંદ કરો અથવા અહીં ડ્રેગ કરો'}
                                </div>
                                <button
                                    type="button"
                                    className="upload-browse-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        globalSigRef.current?.click();
                                    }}
                                >
                                    <Upload size={14} />
                                    <span>{lang === 'en' ? 'Browse Signature' : 'સહી પસંદ કરો'}</span>
                                </button>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>
                                    {lang === 'en' ? 'Supported: PNG with transparent background, or JPG' : 'સપોર્ટેડ: પારદર્શક બેકગ્રાઉન્ડ વાળી PNG અથવા JPG'}
                                </span>
                            </div>
                        )}

                        <input
                            ref={globalSigRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const fd = new FormData();
                                fd.append('signature_file', file);
                                try {
                                    const res = await api('billing/settings', {
                                        method: 'POST',
                                        body: fd
                                    });
                                    if (res?.settings) setSettings(res.settings);
                                    alert(lang === 'en' ? 'Signature uploaded successfully ✓' : 'સહી અપલોડ થઈ ગઈ ✓');
                                } catch (err) {
                                    alert(err.message || 'Error uploading signature');
                                }
                            }}
                        />

                        {/* Global Signature ON / OFF Toggle */}
                        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <input
                                type="checkbox"
                                id="global_sig_enabled"
                                checked={settings.signature_enabled !== false && settings.signature_enabled !== '0'}
                                onChange={async (e) => {
                                    const val = e.target.checked ? '1' : '0';
                                    setSettings(prev => ({ ...prev, signature_enabled: val }));
                                    try {
                                        await api('billing/settings', {
                                            method: 'POST',
                                            body: JSON.stringify({ signature_enabled: val })
                                        });
                                    } catch (err) {
                                        console.error('Error updating signature_enabled setting:', err);
                                    }
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <label htmlFor="global_sig_enabled" style={{ margin: 0, fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: '#1e293b' }}>
                                {lang === 'en' ? 'Print Digital Signature on Bills Globally (ON / OFF)' : 'બધા બિલ પર ડિજિટલ સહી પ્રિન્ટ કરવી (ચાલુ / બંધ)'}
                            </label>
                        </div>
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
                <div className="billing-modal-backdrop" onClick={() => setEditingCompany(null)}>
                    <div className="billing-modal-box company-modal" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                            <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                                {editingCompany.id
                                    ? (lang === 'en' ? 'Edit Company Profile & Settings' : 'કંપની પ્રોફાઇલ અને બિલિંગ નિયમો')
                                    : (lang === 'en' ? 'Add New Solar Billing Company' : 'નવી સોલાર બિલિંગ કંપની ઉમેરો')}
                            </h3>
                            <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '13px' }}
                                onClick={() => setEditingCompany(null)}
                            >
                                ✕
                            </button>
                        </div>

                        {/* SECTION 1: BASIC DETAILS */}
                        <div className="modal-section-title">
                            <Building2 size={15} />
                            <span>{lang === 'en' ? '1. Basic Company Information' : '૧. કંપનીની મૂળભૂત વિગતો'}</span>
                        </div>

                        <div className="form-group">
                            <label>{lang === 'en' ? 'Company Name' : 'કંપનીનું પૂરું નામ'}</label>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="e.g. Radhey Solar Energy"
                                value={editingCompany.name || ''}
                                onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                            />
                        </div>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>{lang === 'en' ? 'GSTIN (GST Number)' : 'GSTIN નંબર'}</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="24AAAAA0000A1Z5"
                                    value={editingCompany.gstin || ''}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, gstin: e.target.value.toUpperCase() })}
                                />
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Invoice Series Prefix' : 'ઇનવોઇસ પ્રિફિક્સ (દા.ત. RS)'}</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="RS"
                                    value={editingCompany.inv_prefix || ''}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, inv_prefix: e.target.value.toUpperCase() })}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>{lang === 'en' ? 'Registered Address' : 'કંપની સરનામું'}</label>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Plot No, GIDC, City, Gujarat"
                                value={editingCompany.address || ''}
                                onChange={(e) => setEditingCompany({ ...editingCompany, address: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label>{lang === 'en' ? 'Contact Phone / Mobile' : 'સંપર્ક ફોન / મોબાઇલ'}</label>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="+91 98765 43210"
                                value={editingCompany.phones || ''}
                                onChange={(e) => setEditingCompany({ ...editingCompany, phones: e.target.value })}
                            />
                        </div>

                        {/* SECTION 2: BANK DETAILS */}
                        <div className="modal-section-title">
                            <Receipt size={15} />
                            <span>{lang === 'en' ? '2. Bank Account Details (For Bill of Supply)' : '૨. બેંક એકાઉન્ટ વિગતો (બિલ પર છાપવા માટે)'}</span>
                        </div>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Bank Name' : 'બેંકનું નામ'}</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="State Bank of India"
                                    value={editingCompany.bank_name || ''}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Bank A/c No.' : 'બેંક એકાઉન્ટ નં.'}</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="123456789012"
                                    value={editingCompany.bank_ac || ''}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_ac: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>{lang === 'en' ? 'IFSC Code' : 'IFSC કોડ'}</label>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="SBIN0001234"
                                value={editingCompany.bank_ifsc || ''}
                                onChange={(e) => setEditingCompany({ ...editingCompany, bank_ifsc: e.target.value.toUpperCase() })}
                            />
                        </div>

                        {/* SECTION 3: COMMERCIAL & BILLING RULES */}
                        <div className="modal-section-title">
                            <Settings size={15} />
                            <span>{lang === 'en' ? '3. Company Billing Terms & Deductions' : '૩. કંપની બિલિંગ નિયમો & કપાત દર'}</span>
                        </div>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>{lang === 'en' ? 'PPA Discount (₹/unit)' : 'PPA ડિસ્કાઉન્ટ (₹/unit)'}</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={editingCompany.discount ?? '1.25'}
                                    placeholder="1.25"
                                    onChange={(e) => setEditingCompany({ ...editingCompany, discount: e.target.value })}
                                />
                                <small className="form-hint">{lang === 'en' ? 'Default discount per credited unit' : 'યુનિટ દીઠ ડિસ્કાઉન્ટ'}</small>
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Payment Due Days' : 'ચૂકવણી મુદત (દિવસો)'}</label>
                                <input
                                    type="number"
                                    step="1"
                                    className="form-control"
                                    value={editingCompany.due_days ?? '15'}
                                    placeholder="15"
                                    onChange={(e) => setEditingCompany({ ...editingCompany, due_days: e.target.value })}
                                />
                                <small className="form-hint">{lang === 'en' ? 'Days from invoice date' : 'ઇનવોઇસ તારીખથી મુદત'}</small>
                            </div>
                        </div>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Annual Overdue Interest (% p.a.)' : 'બાકી રકમ પર વ્યાજ (% p.a.)'}</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className="form-control"
                                    value={editingCompany.interest_pct ?? '18.0'}
                                    placeholder="18.0"
                                    onChange={(e) => setEditingCompany({ ...editingCompany, interest_pct: e.target.value })}
                                />
                                <small className="form-hint">{lang === 'en' ? 'Annual rate charged on overdue principal' : 'મુદત વીતી ગયા પછી વાર્ષિક વ્યાજ દર'}</small>
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Wheeling Loss %' : 'વ્હીલિંગ લોસ %'}</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={editingCompany.loss_pct ?? '6.5'}
                                    placeholder="6.5"
                                    onChange={(e) => setEditingCompany({ ...editingCompany, loss_pct: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Wheeling Charge (₹/KWH)' : 'વ્હીલિંગ ચાર્જ (₹/KWH)'}</label>
                                <input
                                    type="number"
                                    step="0.0001"
                                    className="form-control"
                                    value={editingCompany.wheel_rate ?? '0.2352'}
                                    placeholder="0.2352"
                                    onChange={(e) => setEditingCompany({ ...editingCompany, wheel_rate: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Banking Rate (₹/unit)' : 'બેંકિંગ ચાર્જ દર (₹/unit)'}</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={editingCompany.bank_rate ?? '1.50'}
                                    placeholder="1.50"
                                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_rate: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>{lang === 'en' ? 'Cross Subsidy %' : 'ક્રોસ સબસિડી %'}</label>
                            <input
                                type="number"
                                step="0.01"
                                className="form-control"
                                value={editingCompany.cross_pct ?? '15.0'}
                                placeholder="15.0"
                                onChange={(e) => setEditingCompany({ ...editingCompany, cross_pct: e.target.value })}
                            />
                        </div>

                        {/* SECTION 4: AUTHORISED SIGNATURE */}
                        <div className="modal-section-title">
                            <FileText size={15} />
                            <span>{lang === 'en' ? '4. Authorised Digital Signature' : '૪. કંપની અધિકૃત ડિજિટલ સહી'}</span>
                        </div>

                        <div className="form-group">
                            <label>{lang === 'en' ? 'Company Digital Signature Image' : 'કંપની અધિકૃત સહી (Signature Image)'}</label>
                            {(editingSignaturePreview || editingCompany.signature_path) ? (
                                <div className="upload-card-preview">
                                    <div className="upload-preview-left">
                                        <img
                                            src={editingSignaturePreview || editingCompany.signature_path}
                                            alt="Signature Preview"
                                            className="upload-thumb-img"
                                        />
                                        <div className="upload-meta-info">
                                            <span className="upload-filename">
                                                {editingSignatureFile ? editingSignatureFile.name : (lang === 'en' ? 'Company Signature' : `${editingCompany.name || 'Company'} સહી`)}
                                            </span>
                                            <span className="upload-badge-ok">
                                                <CheckCircle2 size={13} />
                                                {lang === 'en' ? 'Attached for this company' : 'આ કંપની માટે સહી સેટ છે'}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="upload-delete-btn"
                                        title={lang === 'en' ? 'Remove Signature' : 'સહી હટાવો'}
                                        onClick={() => {
                                            setEditingSignatureFile(null);
                                            setEditingSignaturePreview(null);
                                            setEditingCompany(prev => ({ ...prev, signature_path: '', clear_signature: 1 }));
                                            if (sigInputRef.current) sigInputRef.current.value = '';
                                        }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className="custom-upload-zone"
                                    onClick={() => sigInputRef.current?.click()}
                                >
                                    <Upload size={22} color="#3b82f6" />
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                                        {lang === 'en' ? 'Click to Upload Company Signature' : 'કંપનીની સહી પસંદ કરો અથવા અહીં ડ્રેગ કરો'}
                                    </div>
                                    <button
                                        type="button"
                                        className="upload-browse-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            sigInputRef.current?.click();
                                        }}
                                    >
                                        <Upload size={14} />
                                        <span>{lang === 'en' ? 'Browse Signature' : 'સહી પસંદ કરો'}</span>
                                    </button>
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                                        {lang === 'en' ? 'PNG with transparent background is recommended' : 'પારદર્શક બેકગ્રાઉન્ડ ધરાવતી PNG અથવા JPG ઇમેજ'}
                                    </span>
                                </div>
                            )}
                            <input
                                ref={sigInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        setEditingSignatureFile(file);
                                        setEditingSignaturePreview(URL.createObjectURL(file));
                                        setEditingCompany(prev => ({ ...prev, clear_signature: 0 }));
                                    }
                                }}
                            />

                            {/* Digital Signature Toggle (ON / OFF) */}
                            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                <input
                                    type="checkbox"
                                    id="co_signature_enabled"
                                    checked={editingCompany.signature_enabled !== false}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, signature_enabled: e.target.checked })}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                                <label htmlFor="co_signature_enabled" style={{ margin: 0, fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: '#1e293b' }}>
                                    {lang === 'en' ? 'Print Digital Signature on Bills (ON / OFF)' : 'બિલ પર ડિજિટલ સહી પ્રિન્ટ કરવી (ચાલુ / બંધ)'}
                                </label>
                            </div>
                        </div>

                        {/* SECTION 5: LETTERHEAD FORMAT */}
                        <div className="modal-section-title">
                            <Printer size={15} />
                            <span>{lang === 'en' ? '5. Letterhead & Stationary Format' : '૫. લેટરહેડ / પ્રિન્ટિંગ ફોર્મેટ'}</span>
                        </div>

                        <div className="form-group">
                            <label>{lang === 'en' ? 'Choose Invoice Letterhead Option' : 'બિલ પ્રિન્ટિંગ લેટરહેડ ઓપ્શન પસંદ કરો'}</label>
                            <select
                                className="form-control"
                                value={editingCompany.letterhead_mode || 'digital'}
                                onChange={(e) => setEditingCompany({ ...editingCompany, letterhead_mode: e.target.value })}
                            >
                                <option value="digital">
                                    {lang === 'en' ? '🏢 Digital Letterhead (System generated header with Logo & Details)' : '🏢 ડિજિટલ લેટરહેડ (સિસ્ટમ આપોઆપ નામ/GSTIN છાપશે)'}
                                </option>
                                <option value="custom_image">
                                    {lang === 'en' ? '🖼️ Custom Header Image Banner (Upload graphic letterhead header)' : '🖼️ કસ્ટમ લેટરહેડ બેનર (ગ્રાફિક ડિઝાઇન ઇમેજ અપલોડ કરો)'}
                                </option>
                                <option value="preprinted">
                                    {lang === 'en' ? '📄 Pre-printed Stationary (Leaves 52mm top margin for physical letterpad)' : '📄 પ્રી-પ્રિન્ટેડ લેટરપેડ (ઓરિજિનલ પેપર માટે 52mm ટોપ માર્જિન)'}
                                </option>
                            </select>
                        </div>

                        {/* Custom Letterhead Banner File Upload */}
                        {editingCompany.letterhead_mode === 'custom_image' && (
                            <div className="form-group" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                <label>{lang === 'en' ? 'Custom Graphic Letterhead Banner' : 'કસ્ટમ લેટરહેડ બેનર ઇમેજ'}</label>
                                {(editingLetterheadPreview || editingCompany.letterhead_path) ? (
                                    <div className="upload-card-preview" style={{ marginTop: '6px' }}>
                                        <div className="upload-preview-left">
                                            <img
                                                src={editingLetterheadPreview || editingCompany.letterhead_path}
                                                alt="Letterhead Banner Preview"
                                                className="upload-thumb-banner"
                                            />
                                            <div className="upload-meta-info">
                                                <span className="upload-filename">
                                                    {editingLetterheadFile ? editingLetterheadFile.name : (lang === 'en' ? 'Header Banner Image' : 'લેટરહેડ બેનર')}
                                                </span>
                                                <span className="upload-badge-ok">
                                                    <CheckCircle2 size={13} />
                                                    {lang === 'en' ? 'Banner attached' : 'બેનર સેટ છે'}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="upload-delete-btn"
                                            title={lang === 'en' ? 'Remove Banner' : 'બેનર હટાવો'}
                                            onClick={() => {
                                                setEditingLetterheadFile(null);
                                                setEditingLetterheadPreview(null);
                                                setEditingCompany(prev => ({ ...prev, letterhead_path: '', clear_letterhead: 1 }));
                                                if (lhInputRef.current) lhInputRef.current.value = '';
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div
                                        className="custom-upload-zone"
                                        onClick={() => lhInputRef.current?.click()}
                                    >
                                        <Upload size={22} color="#3b82f6" />
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                                            {lang === 'en' ? 'Choose Banner Image' : 'લેટરહેડ બેનર ઇમેજ પસંદ કરો'}
                                        </div>
                                        <button
                                            type="button"
                                            className="upload-browse-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                lhInputRef.current?.click();
                                            }}
                                        >
                                            <Upload size={14} />
                                            <span>{lang === 'en' ? 'Browse Banner' : 'બેનર પસંદ કરો'}</span>
                                        </button>
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                                            {lang === 'en' ? 'Recommended width: 800px-1200px (header strip)' : 'સૂચિત પહોળાઈ: ૮૦૦ થી ૧૨૦૦ પિક્સેલ (હેડર સ્ટ્રિપ)'}
                                        </span>
                                    </div>
                                )}
                                <input
                                    ref={lhInputRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            setEditingLetterheadFile(file);
                                            setEditingLetterheadPreview(URL.createObjectURL(file));
                                            setEditingCompany(prev => ({ ...prev, clear_letterhead: 0 }));
                                        }
                                    }}
                                />
                            </div>
                        )}

                        {editingCompany.letterhead_mode === 'preprinted' && (
                            <div className="preprinted-hint-banner" style={{ marginBottom: '14px' }}>
                                💡 <b>{lang === 'en' ? 'Pre-printed Paper Mode Active:' : 'પ્રી-પ્રિન્ટેડ પેપર મોડ:'}</b>{' '}
                                {lang === 'en'
                                    ? 'The invoice will leave a 52mm blank top margin so you can feed your physical company letterhead sheets directly into printer.'
                                    : 'આ બિલમાં ટોચ પર ૫૨ મિ.મી. (52mm) ની ખાલી જગ્યા રહેશે, જેથી તમે તમારું ઓરિજિનલ પ્રિન્ટેડ લેટરપેડ સીધું પ્રિન્ટરમાં મૂકી શકો.'}
                            </div>
                        )}

                        {/* Modal Action Buttons */}
                        <div className="wizard-btn-row" style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    setEditingCompany(null);
                                    setEditingSignatureFile(null);
                                    setEditingSignaturePreview(null);
                                    setEditingLetterheadFile(null);
                                    setEditingLetterheadPreview(null);
                                }}
                            >
                                {lang === 'en' ? 'Cancel' : 'રદ કરો'}
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={async () => {
                                    if (!editingCompany.name?.trim()) {
                                        alert(lang === 'en' ? 'Company name is required' : 'કંપનીનું નામ જરૂરી છે');
                                        return;
                                    }
                                    try {
                                        const formData = new FormData();
                                        formData.append('name', editingCompany.name || '');
                                        formData.append('gstin', editingCompany.gstin || '');
                                        formData.append('inv_prefix', editingCompany.inv_prefix || 'RS');
                                        formData.append('address', editingCompany.address || '');
                                        formData.append('phones', editingCompany.phones || '');
                                        formData.append('bank_name', editingCompany.bank_name || '');
                                        formData.append('bank_ac', editingCompany.bank_ac || '');
                                        formData.append('bank_ifsc', editingCompany.bank_ifsc || '');
                                        formData.append('discount', editingCompany.discount ?? '1.25');
                                        formData.append('due_days', editingCompany.due_days ?? '15');
                                        formData.append('interest_pct', editingCompany.interest_pct ?? '18.0');
                                        formData.append('loss_pct', editingCompany.loss_pct ?? '6.5');
                                        formData.append('wheel_rate', editingCompany.wheel_rate ?? '0.2352');
                                        formData.append('bank_rate', editingCompany.bank_rate ?? '1.50');
                                        formData.append('cross_pct', editingCompany.cross_pct ?? '15.0');
                                        formData.append('letterhead_mode', editingCompany.letterhead_mode || 'digital');
                                        formData.append('signature_enabled', editingCompany.signature_enabled !== false ? '1' : '0');

                                        if (editingSignatureFile) {
                                            formData.append('signature', editingSignatureFile);
                                        } else if (editingCompany.clear_signature) {
                                            formData.append('clear_signature', '1');
                                        }

                                        if (editingLetterheadFile) {
                                            formData.append('letterhead', editingLetterheadFile);
                                        } else if (editingCompany.clear_letterhead) {
                                            formData.append('clear_letterhead', '1');
                                        }

                                        const endpoint = editingCompany.id
                                            ? `billing/companies/${editingCompany.id}`
                                            : 'billing/companies';

                                        await api(endpoint, {
                                            method: 'POST',
                                            body: formData
                                        });

                                        setEditingCompany(null);
                                        setEditingSignatureFile(null);
                                        setEditingSignaturePreview(null);
                                        setEditingLetterheadFile(null);
                                        setEditingLetterheadPreview(null);

                                        const comps = await api('billing/companies');
                                        if (comps) setCompanies(comps);
                                        alert(lang === 'en' ? 'Company saved successfully ✓' : 'કંપની વિગતો સફળતાપૂર્વક સેવ થઈ ગઈ ✓');
                                    } catch (err) {
                                        alert(err.message || 'Error saving company');
                                    }
                                }}
                            >
                                <Check size={16} />
                                <span>{lang === 'en' ? 'Save Company Profile' : 'કંપની પ્રોફાઇલ સેવ કરો'}</span>
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

                        {/* Exact BILL OF SUPPLY Debit Memo Display (Rajeshwari Solar Official Format) */}
                        <ExactSolarBillSheet
                            company={viewingBill.company}
                            customer={{
                                name: viewingBill.customer_name || viewingBill.cust?.name,
                                address: viewingBill.customer_address || viewingBill.cust?.address,
                                gst: viewingBill.customer_gstin || viewingBill.cust?.gst
                            }}
                            invoiceNo={viewingBill.invoice_no || viewingBill.invNo}
                            invoiceDate={viewingBill.invoice_date || viewingBill.invDate}
                            dueDate={viewingBill.due_date || viewingBill.dueDate}
                            month={viewingBill.month}
                            units={viewingBill.units_credited || viewingBill.units?.credited}
                            billRate={Number(viewingBill.breakdown?.billRate || viewingBill.result?.billRate || 0)}
                            netRate={Number(viewingBill.breakdown?.netRate || viewingBill.result?.netRate || 0)}
                            subTotal={Number(viewingBill.sub_total || viewingBill.result?.net || 0)}
                            discountRate={Number(viewingBill.discount_rate || viewingBill.company?.discount || 1.25)}
                            discountAmt={Number(viewingBill.discount_amt || viewingBill.result?.discountAmt || 0)}
                            prevBal={Number(viewingBill.prev_balance || viewingBill.prevBal || 0)}
                            interest={Number(viewingBill.interest_amt || viewingBill.interest || 0)}
                            interestDays={Number(viewingBill.interest_days || viewingBill.interestDays || 0)}
                            interestPct={Number(viewingBill.company?.interest_pct || settings.interest_pct || 18)}
                            roundOff={Number(viewingBill.round_off || viewingBill.result?.roundOff || 0)}
                            totalOut={Number(viewingBill.total_outstanding || viewingBill.totalOut || 0)}
                            note={viewingBill.note || ''}
                            settings={settings}
                            lang={lang}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
