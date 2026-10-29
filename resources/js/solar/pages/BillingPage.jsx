import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Receipt, Building2, FolderClock, Settings, Plus, Search,
    Printer, Mail, FileText, CheckCircle2, AlertTriangle,
    XCircle, Ban, Download, RefreshCw, Eye, ArrowRight,
    ArrowLeft, Check, Upload, HelpCircle, BarChart3,
    Trash2, Edit3, Scale, ChevronDown, ChevronUp, TrendingUp, X,
    Percent, Clock, ShieldCheck
} from 'lucide-react';
import { api } from '../api';
import { useLanguage } from '../context/LanguageContext';
import BillingEngine, {
    deriveRates, companyBill, computeInterest, runChecks,
    nextInvoiceNo, fyOf, numberToWords, inr, round2, num
} from '../utils/billingEngine';
import ExactSolarBillSheet from '../components/ExactSolarBillSheet';

// Auto-detect billing month from PDF raw text or filename
export function detectBillingMonth(rawText = '', fileName = '') {
    const months = [
        { regex: /Jan(?:uary)?/i, short: 'Jan', num: '01' },
        { regex: /Feb(?:ruary)?/i, short: 'Feb', num: '02' },
        { regex: /Mar(?:ch)?/i, short: 'Mar', num: '03' },
        { regex: /Apr(?:il)?/i, short: 'Apr', num: '04' },
        { regex: /May/i, short: 'May', num: '05' },
        { regex: /Jun(?:e)?/i, short: 'Jun', num: '06' },
        { regex: /Jul(?:y)?/i, short: 'Jul', num: '07' },
        { regex: /Aug(?:ust)?/i, short: 'Aug', num: '08' },
        { regex: /Sep(?:tember)?/i, short: 'Sep', num: '09' },
        { regex: /Oct(?:ober)?/i, short: 'Oct', num: '10' },
        { regex: /Nov(?:ember)?/i, short: 'Nov', num: '11' },
        { regex: /Dec(?:ember)?/i, short: 'Dec', num: '12' },
    ];

    // Decode any UTF-16BE hex strings from PDF headers (e.g. <FEFF004100750067...>)
    let decodedText = rawText || '';
    if (decodedText.includes('<FEFF') || decodedText.includes('<feff')) {
        decodedText = decodedText.replace(/<[Ff][Ee][Ff][Ff]([0-9A-Fa-f]+)>/g, (_, hex) => {
            let s = '';
            for (let i = 0; i < hex.length; i += 4) {
                const code = parseInt(hex.substr(i, 4), 16);
                if (code > 0 && code < 128) s += String.fromCharCode(code);
            }
            return s;
        });
    }

    const sources = [fileName, decodedText].filter(Boolean);

    for (const text of sources) {
        // 1. Text Month with 2 or 4 digit year: e.g. "Aug-26", "August 2026", "Sep_26", "Nov 26", "Aug26"
        for (const m of months) {
            const rx = new RegExp('(?:^|[^a-zA-Z])' + m.regex.source + '[\\s-_/]*(?:20)?(\\d{2})\\b', 'i');
            const match = text.match(rx);
            if (match) {
                return `${m.short}-${match[1]}`;
            }
        }

        // 2. Numeric Month pattern like "08-2026", "08/26", "2026-08", "2026/08"
        const numRx = /(?:month|period|statement|bill|date)?[^\d]*(0[1-9]|1[0-2])[\/\-_](?:20)?(\d{2})\b/i;
        const numMatch = text.match(numRx);
        if (numMatch) {
            const mIndex = parseInt(numMatch[1], 10) - 1;
            if (months[mIndex]) {
                return `${months[mIndex].short}-${numMatch[2]}`;
            }
        }

        const ymdRx = /\b(?:20)?(\d{2})[\/\-_](0[1-9]|1[0-2])\b/;
        const ymdMatch = text.match(ymdRx);
        if (ymdMatch) {
            const mIndex = parseInt(ymdMatch[2], 10) - 1;
            if (months[mIndex]) {
                return `${months[mIndex].short}-${ymdMatch[1]}`;
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

// Helper: Get Current Billing Month (e.g. Oct-26)
export function getCurrentBillingMonth() {
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = months[now.getMonth()];
    const yy = String(now.getFullYear()).slice(-2);
    return `${m}-${yy}`;
}

// Helper: Go to previous billing month (e.g. Oct-26 -> Sep-26, Jan-27 -> Dec-26)
export function prevMonthString(monthStr) {
    if (!monthStr) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = monthStr.split(/[-_\s/]+/);
    if (parts.length >= 2) {
        const mName = parts[0];
        const yr = parts[1];
        const mIdx = months.findIndex(m => m.toLowerCase() === mName.toLowerCase());
        if (mIdx !== -1) {
            const prevIdx = (mIdx - 1 + 12) % 12;
            let yrNum = parseInt(yr, 10);
            if (mIdx === 0) {
                yrNum -= 1;
            }
            const formattedYr = yr.length === 4 ? String(yrNum) : String(yrNum).padStart(2, '0');
            return `${months[prevIdx]}-${formattedYr}`;
        }
    }
    return monthStr;
}

// Helper: Advance Invoice Number sequence (e.g. RS/26-27/01 -> RS/26-27/02)
export function advanceInvoiceNo(invNo) {
    if (!invNo) return '';
    const match = invNo.match(/^(.*\/)(\d+)$/);
    if (match) {
        const prefix = match[1];
        const seq = parseInt(match[2], 10) + 1;
        const len = match[2].length;
        return `${prefix}${String(seq).padStart(len, '0')}`;
    }
    return `${invNo}-2`;
}

// Comprehensive PDF Statement validation and company matching
export function validateSolarPdf(fileName = '', rawText = '', registeredCompanies = []) {
    const fnLower = (fileName || '').toLowerCase();
    const txtLower = (rawText || '').toLowerCase();
    const combined = fnLower + ' ' + txtLower;

    // 1. Is it a PDF file?
    if (!fnLower.endsWith('.pdf')) {
        return {
            valid: false,
            severity: 'error',
            code: 'NOT_PDF',
            title: 'અમાન્ય ફાઈલ ફોર્મેટ (Not a PDF)',
            message: 'ફક્ત PDF (.pdf) ફાઈલ જ માન્ય છે. અન્ય કોઈપણ ફાઈલ અહીં ચાલશે નહીં.'
        };
    }

    // 2. Obvious non-solar personal / administrative document patterns
    const negativeDocs = [
        { key: 'resume', label: 'બાયોડેટા / Resume' },
        { key: 'curriculum vitae', label: 'Curriculum Vitae (CV)' },
        { key: 'marksheet', label: 'માર્કશીટ / Marksheet' },
        { key: 'pan card', label: 'પાન કાર્ડ / PAN Card' },
        { key: 'aadhaar', label: 'આધાર કાર્ડ / Aadhaar' },
        { key: 'driving licen', label: 'ડ્રાઇવિંગ લાયસન્સ' },
        { key: 'passport', label: 'પાસપોર્ટ / Passport' },
        { key: 'salary slip', label: 'પગાર સ્લિપ / Salary Slip' },
        { key: 'irctc', label: 'ટિકિટ / Ticket' },
        { key: 'boarding pass', label: 'બોર્ડિંગ પાસ' }
    ];
    for (const neg of negativeDocs) {
        if (combined.includes(neg.key)) {
            return {
                valid: false,
                severity: 'error',
                code: 'INVALID_DOCUMENT',
                title: 'અમાન્ય દસ્તાવેજ (Invalid Document)',
                message: `આ ફાઈલ (${neg.label}) સોલાર કે PGVCL સ્ટેટમેન્ટ નથી. સોલાર બિલ બનાવવા માટે સાચી સ્ટેટમેન્ટ PDF અપલોડ કરો.`
            };
        }
    }

    // 3. Positive utility / open-access keywords
    const solarKeywords = [
        'pgvcl', 'paschim gujarat', 'open access', 'credit of open access',
        'credit', 'solar', 'wind', 'energy charge', 'fca', 'wheeling',
        'banking', 'kwh', 'ht consumer', 'discom', 'geb', 'blueart', 'granito',
        'statement', 'bill of supply', 'power'
    ];
    const hasSolarKeyword = solarKeywords.some(kw => combined.includes(kw));

    // 4. Match against registered companies
    let matchedCompany = null;
    if (Array.isArray(registeredCompanies) && registeredCompanies.length > 0) {
        for (const comp of registeredCompanies) {
            const compName = (comp.name || '').toLowerCase();
            const prefix = (comp.inv_prefix || '').toLowerCase();
            const words = compName
                .split(/[\s-]+/)
                .filter(w => w.length > 2 && !['solar', 'energy', 'pvt', 'ltd', 'limited', 'private'].includes(w));

            const nameMatched = words.length > 0 && words.some(w => combined.includes(w));
            const prefixMatched = prefix && prefix.length >= 2 && fnLower.includes(prefix);

            if (nameMatched || prefixMatched) {
                matchedCompany = comp;
                break;
            }
        }
    }

    // 5. Check if PDF mentions an external/third-party company not added in the system
    const commonThirdParties = [
        { key: 'adani', name: 'ADANI SOLAR / POWER' },
        { key: 'tata power', name: 'TATA POWER' },
        { key: 'torrent', name: 'TORRENT POWER' },
        { key: 'suzlon', name: 'SUZLON ENERGY' },
        { key: 'waree', name: 'WAAREE ENERGIES' },
        { key: 'renew power', name: 'RENEW POWER' },
        { key: 'reliance', name: 'RELIANCE POWER' },
        { key: 'ntpc', name: 'NTPC' },
        { key: 'gsec', name: 'GSECL' }
    ];
    const foundThirdParty = commonThirdParties.find(tp => combined.includes(tp.key));

    if (foundThirdParty && (!matchedCompany || !matchedCompany.name.toLowerCase().includes(foundThirdParty.key))) {
        return {
            valid: true,
            severity: 'warning',
            code: 'UNREGISTERED_COMPANY',
            companyName: foundThirdParty.name,
            matchedCompany: null,
            title: `ધ્યાન આપો — અજાણી કંપની (${foundThirdParty.name})`,
            message: `આ PDF માં "${foundThirdParty.name}" નો ઉલ્લેખ છે, જે હજુ તમારી સિસ્ટમમાં ઉમેરાયેલ નથી. તમે "કંપનીઓ" ટેબમાંથી નવી કંપની ઉમેરી શકો છો અથવા નીચેથી યોગ્ય કંપની પસંદ કરીને આગળ વધી શકો છો.`
        };
    }

    // 6. If extractable text is substantial but has NO solar/energy keywords
    if (!hasSolarKeyword && rawText && rawText.length > 250) {
        return {
            valid: false,
            severity: 'error',
            code: 'NOT_SOLAR_STATEMENT',
            title: 'PGVCL વિગતો મળી નથી (Not a Solar Statement)',
            message: 'આ PDF માં PGVCL કે સોલાર ઓપન એક્સેસ સંબંધિત કોઈ માહિતી (Credit Units, FCA, Wheeling etc.) નથી. આ PDF અહીં ચાલશે નહીં.'
        };
    }

    // 7. Success / Valid state
    if (matchedCompany) {
        return {
            valid: true,
            severity: 'success',
            code: 'MATCHED',
            matchedCompany: matchedCompany,
            title: `✓ માન્ય PGVCL સ્ટેટમેન્ટ — ${matchedCompany.name}`,
            message: `કંપની "${matchedCompany.name}" PDF સાથે મેળ ખાઈ ગઈ છે.`
        };
    }

    return {
        valid: true,
        severity: 'info',
        code: 'ACCEPTED',
        matchedCompany: null,
        title: '✓ સ્ટેટમેન્ટ PDF સ્વીકારેલ છે',
        message: `ફાઈલ "${fileName}" સ્વીકારાઈ છે. નીચે આપેલી કંપની અને યુનિટ્સ ચકાસીને આગળ વધો.`
    };
}

export default function BillingPage({ currentUser }) {
    const { lang, t } = useLanguage();

    // Navigation Tabs
    const [activeTab, setActiveTab] = useState('bill'); // 'bill' | 'records' | 'ca' | 'reconciliation' | 'companies' | 'charges' | 'setup'

    // Server State
    const [loading, setLoading] = useState(false);
    const [companies, setCompanies] = useState([]);
    const [settings, setSettings] = useState({});
    const [bills, setBills] = useState([]);
    const [summary, setSummary] = useState(null);

    // Charge Master State
    const [charges, setCharges] = useState([]);
    const [chargesLoading, setChargesLoading] = useState(false);
    const [editingCharge, setEditingCharge] = useState(null);

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
    const [waiveModal, setWaiveModal] = useState({ open: false, bill: null, waiveAmount: '', reason: '' });
    const [editingCompany, setEditingCompany] = useState(null); // null or company object
    const [editingSignatureFile, setEditingSignatureFile] = useState(null);
    const [editingSignaturePreview, setEditingSignaturePreview] = useState(null);
    const [editingLetterheadFile, setEditingLetterheadFile] = useState(null);
    const [editingLetterheadPreview, setEditingLetterheadPreview] = useState(null);

    // Wizard State (Steps 1 to 4)
    const [wizStep, setWizStep] = useState(1);
    const [wCompanyId, setWCompanyId] = useState('');
    const [wMonth, setWMonth] = useState(() => getCurrentBillingMonth());
    const [isAutoMonth, setIsAutoMonth] = useState(false);
    const [wInvNo, setWInvNo] = useState('');
    const [wInvDate, setWInvDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [wDueDate, setWDueDate] = useState('');
    const [wPdfFile, setWPdfFile] = useState(null);
    const [wPdfName, setWPdfName] = useState('');
    const [pdfValidation, setPdfValidation] = useState(null);
    const [wCust, setWCust] = useState({ name: '', address: '', gst: '' });
    const [step1Error, setStep1Error] = useState('');
    const [step2Error, setStep2Error] = useState('');

    // Step 2 Units
    const [wUnits, setWUnits] = useState({ credited: '', peak: '', banking: '', generated: '' });
    const [wTwoCo, setWTwoCo] = useState(false);
    const [wUnits2, setWUnits2] = useState({
        mode: 'multi_month',
        companyId: '',
        month: '',
        credited: '',
        peak: '',
        banking: '',
        generated: '',
        invNo: ''
    });

    // Step 2 PGVCL Statement Inputs (CREDIT column)
    const [wStmt, setWStmt] = useState({
        unit: '', energyAmt: '', fcaAmt: '', pfAmt: '', ehvAmt: '',
        touAmt: '', totalPeak: '', varAmt: '', boardAmt: '', dutyAmt: ''
    });

    // Step 2 Deductions
    const [wExtra, setWExtra] = useState({ lossPct: '', crossPct: '', wheelRate: '', bankRate: '' });

    // Step 2 Overdue Interest Waiver State
    const [wWaiveInterest, setWWaiveInterest] = useState(false);
    const [wInterestWaived, setWInterestWaived] = useState('');
    const [wInterestWaiveReason, setWInterestWaiveReason] = useState('');

    const [wWaiveInterest2, setWWaiveInterest2] = useState(false);
    const [wInterestWaived2, setWInterestWaived2] = useState('');
    const [wInterestWaiveReason2, setWInterestWaiveReason2] = useState('');

    // Step 3 & 4 Computed Bills Cache
    const [computedBills, setComputedBills] = useState([]);
    const [pendingInfo, setPendingInfo] = useState({ prevBal: 0, prev_invoice_no: null, interest: 0, interestDays: 0 });
    const [pendingInfo2, setPendingInfo2] = useState({ prevBal: 0, prev_invoice_no: null, interest: 0, interestDays: 0 });
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccessCount, setSaveSuccessCount] = useState(0);
    const [selectedBillIds, setSelectedBillIds] = useState([]);
    const [viewingBills, setViewingBills] = useState([]);

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

    // Load Dynamic Charges & Rebates Master
    const fetchCharges = async () => {
        setChargesLoading(true);
        try {
            const res = await api('billing/charges');
            setCharges(Array.isArray(res) ? res : []);
        } catch (err) {
            console.error('Error fetching charges:', err);
        } finally {
            setChargesLoading(false);
        }
    };

    // 1. Initial Load: Companies, Settings & Charges
    const loadInitData = async () => {
        setLoading(true);
        try {
            const [compsRes, settRes, chgRes] = await Promise.all([
                api('billing/companies'),
                api('billing/settings'),
                api('billing/charges').catch(() => [])
            ]);
            setCompanies(compsRes || []);
            setSettings(settRes || {});
            setCharges(Array.isArray(chgRes) ? chgRes : []);

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
        } else if (activeTab === 'charges') {
            fetchCharges();
        }
    }, [activeTab, filterCompany, filterStatus, filterMonth, searchQuery, reconMonth]);

    // Handle Company Switch in Step 1
    const handleCompanyChange = (compId) => {
        setWCompanyId(compId);
        // Reset secondary bill so other companies (Sunrise) do not leak into this company's bill
        setWTwoCo(false);
        setWUnits2({
            mode: 'multi_month',
            companyId: compId,
            month: '',
            credited: '',
            peak: '',
            banking: '',
            generated: '',
            invNo: ''
        });
        // Reset company-specific units (credited/peak/banking/generated) so the
        // previous company's data does not carry over. Statement data (wStmt) is
        // shared from the PDF and billing month stays, so they are kept.
        setWUnits({ credited: '', peak: '', banking: '', generated: '' });
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

    // Handle PDF upload, validate solar criteria & auto-detect month/company
    const handlePdfUpload = async (file) => {
        if (!file) {
            setPdfValidation(null);
            setWPdfFile(null);
            setWPdfName('');
            return;
        }
        setWPdfFile(file);
        setWPdfName(file.name);

        // Reset secondary bill on new PDF upload so it doesn't carry over
        setWTwoCo(false);
        setWUnits2({
            mode: 'multi_month',
            companyId: '',
            month: '',
            credited: '',
            peak: '',
            banking: '',
            generated: '',
            invNo: ''
        });

        let rawText = '';
        if (file.slice) {
            try {
                const slice = file.slice(0, 131072);
                rawText = await slice.text();
            } catch (e) {
                console.warn('PDF slice read failed', e);
            }
        }

        // 1. Validate PDF against solar criteria and company master
        const val = validateSolarPdf(file.name, rawText, companies);
        setPdfValidation(val);

        // 2. Auto-match company if found in PDF
        if (val.matchedCompany && val.matchedCompany.id) {
            handleCompanyChange(val.matchedCompany.id);
        }

        // 3. Auto-detect billing month
        const detected = detectBillingMonth(rawText, file.name);
        if (detected) {
            setWMonth(detected);
            setIsAutoMonth(true);
        }
    };

    // Live Derived Rates for Step 2 (auto-fallbacks to credited and peak units so rates compute immediately)
    const liveRates = useMemo(() => {
        const totalCredited = num(wUnits.credited) + (wTwoCo ? num(wUnits2.credited) : 0);
        const totalPeak = num(wUnits.peak) + (wTwoCo ? num(wUnits2.peak) : 0);
        const effectiveUnit = num(wStmt.unit) > 0 ? num(wStmt.unit) : totalCredited;
        const effectivePeak = num(wStmt.totalPeak) > 0 ? num(wStmt.totalPeak) : totalPeak;

        return deriveRates({
            ...wStmt,
            unit: effectiveUnit,
            totalPeak: effectivePeak,
        });
    }, [wStmt, wUnits, wUnits2, wTwoCo]);

    // Load Verified Test Figures for Quick Testing
    const handleLoadExample = (mode = 'single') => {
        setWMonth('Aug-26');
        setWUnits({ credited: '105715', peak: '31708', banking: '20113', generated: '113064' });

        if (mode === 'two_company') {
            setWTwoCo(true);
            const secondCo = companies.find(c => c.id != wCompanyId) || { id: 2 };
            setWUnits2({
                mode: 'two_company',
                companyId: secondCo.id,
                month: 'Aug-26',
                credited: '60392',
                peak: '17699',
                banking: '11497',
                generated: '64590',
                invNo: ''
            });
        } else if (mode === 'multi_month') {
            setWTwoCo(true);
            setWUnits2({
                mode: 'multi_month',
                companyId: wCompanyId,
                month: 'Sep-26',
                credited: '102500',
                peak: '30200',
                banking: '19500',
                generated: '109600',
                invNo: ''
            });
        } else {
            // Default: SINGLE COMPANY (Rajeshwari Solar) — NO SUNRISE!
            setWTwoCo(false);
            setWUnits2({
                mode: 'multi_month',
                companyId: wCompanyId,
                month: '',
                credited: '',
                peak: '',
                banking: '',
                generated: '',
                invNo: ''
            });
        }

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
        setStep1Error('');
        if (!wCompanyId) {
            setStep1Error(lang === 'en' ? 'Please select a company to proceed' : 'આગળ વધવા માટે કૃપા કરીને કંપની પસંદ કરો');
            return;
        }

        // Strict PDF Validation Guard: If PDF was uploaded and flagged as invalid/unsupported
        if (pdfValidation && !pdfValidation.valid && pdfValidation.severity === 'error') {
            setStep1Error(pdfValidation.title + ": " + pdfValidation.message);
            return;
        }

        if (!wMonth.trim()) {
            setStep1Error(lang === 'en' ? 'Please enter or select billing month (e.g. Aug-26)' : 'કૃપા કરીને મહિનો દાખલ કરો અથવા પસંદ કરો (દા.ત. Aug-26)');
            return;
        }
        if (!wInvNo.trim()) {
            setStep1Error(lang === 'en' ? 'Please enter invoice number' : 'કૃપા કરીને Invoice No. દાખલ કરો');
            return;
        }

        // Fetch pending balance & snapshot interest for primary company
        try {
            const pi = await api(`billing/pending/${wCompanyId}`);
            setPendingInfo(pi || { prev_balance: 0, prev_invoice_no: null, interest_amt: 0, interest_days: 0 });
            setWWaiveInterest(false);
            setWInterestWaived('');
            setWInterestWaiveReason('');

            if (wTwoCo && wUnits2.companyId) {
                const pi2 = await api(`billing/pending/${wUnits2.companyId}`);
                setPendingInfo2(pi2 || { prev_balance: 0, prev_invoice_no: null, interest_amt: 0, interest_days: 0 });
                setWWaiveInterest2(false);
                setWInterestWaived2('');
                setWInterestWaiveReason2('');
            }
        } catch (e) {
            console.warn('Pending balance fetch failed', e);
        }

        setWizStep(2);
    };

    // Advance Step 2 -> 3 (Preview & Check)
    const handleStep2Next = async () => {
        try {
            setStep2Error('');
            const credited1 = parseFloat(wUnits.credited);
            if (!credited1 || credited1 <= 0) {
                setStep2Error(lang === 'en' ? 'Please enter Credited Units in Section A' : 'કૃપા કરીને Section A માં Credited Unit દાખલ કરો');
                return;
            }

            // Auto-populate Statement unit from Credited units if user left it blank
            let effectiveStmtUnit = parseFloat(wStmt.unit);
            if (!effectiveStmtUnit || effectiveStmtUnit <= 0) {
                const autoUnit = credited1 + (wTwoCo ? (parseFloat(wUnits2.credited) || 0) : 0);
                if (autoUnit > 0) {
                    effectiveStmtUnit = autoUnit;
                    setWStmt(prev => ({ ...prev, unit: String(autoUnit) }));
                } else {
                    setStep2Error(lang === 'en' ? 'Please enter Statement Total Units in Section C' : 'Section C માં સ્ટેટમેન્ટના Total Units દાખલ કરો');
                    return;
                }
            }

            // Auto-populate Total Peak if left blank
            let effectivePeak = parseFloat(wStmt.totalPeak);
            if (!effectivePeak || effectivePeak <= 0) {
                const autoPeak = (parseFloat(wUnits.peak) || 0) + (wTwoCo ? (parseFloat(wUnits2.peak) || 0) : 0);
                if (autoPeak > 0) {
                    setWStmt(prev => ({ ...prev, totalPeak: String(autoPeak) }));
                }
            }

            if (wTwoCo && !parseFloat(wUnits2.credited)) {
                setStep2Error(lang === 'en' ? 'Please enter Credited Units for second company' : 'બીજી કંપનીના Credited Unit દાખલ કરો');
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

            const extraWithCharges = { ...wExtra, charges: charges };
            const res1 = companyBill(wUnits, liveRates, extraWithCharges, { discount: disc1, ...rateOpts });
            const checks1 = runChecks(res1, wStmt, 0, rateOpts).slice(0, 2); // 2 Checks: Bill-Rate & Grand/Generated ratio

            const pBal1 = Number(pendingInfo?.prev_balance ?? pendingInfo?.prevBal) || 0;
            const pInt1 = Number(pendingInfo?.interest_amt ?? pendingInfo?.interest) || 0;
            const pDays1 = Number(pendingInfo?.interest_days ?? pendingInfo?.interestDays) || 0;
            const prevInv1 = pendingInfo?.prev_invoice_no || null;

            let waived1 = 0;
            if (wWaiveInterest && pInt1 > 0) {
                waived1 = parseFloat(wInterestWaived);
                if (isNaN(waived1) || waived1 <= 0) {
                    waived1 = pInt1;
                }
                if (waived1 > pInt1) {
                    alert(lang === 'en' ? `Waive amount cannot exceed computed interest (₹${pInt1})` : `માફ રકમ ગણેલા વ્યાજ (₹${pInt1}) કરતાં વધુ ન હોઈ શકે`);
                    return;
                }
                if (!wInterestWaiveReason.trim()) {
                    alert(lang === 'en' ? 'Reason for waiving interest is mandatory' : 'વ્યાજ માફ કરવા માટેનું કારણ (Reason) લખવું ફરજિયાત છે');
                    return;
                }
            }
            const netInterest1 = Math.max(0, pInt1 - waived1);

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
                extra: extraWithCharges,
                rates: liveRates,
                result: res1,
                checks: checks1,
                prevBal: pBal1,
                prevInvoiceNo: prevInv1,
                interest: pInt1,
                interestDays: pDays1,
                interestWaived: waived1,
                interestWaiveReason: wInterestWaiveReason.trim(),
                totalOut: Math.round((pBal1 + netInterest1 + res1.grand) * 100) / 100
            }];

            // If Second Bill (Multi-Month for same company OR Two-Company) is active
            if (wTwoCo && parseFloat(wUnits2.credited)) {
                const isTwoCo = wUnits2.mode === 'two_company';
                const comp2 = isTwoCo
                    ? (companies.find(c => c.id == wUnits2.companyId) || {})
                    : comp1; // Same company for 2nd month (Rajeshwari)

                const disc2 = comp2?.discount !== null && isFinite(parseFloat(comp2?.discount))
                    ? parseFloat(comp2.discount)
                    : (parseFloat(settings.default_discount) || 1.25);

                const fy = fyOf(wInvDate);
                const inv2 = wUnits2.invNo || (isTwoCo ? nextInvoiceNo(comp2, fy) : advanceInvoiceNo(wInvNo));
                const res2 = companyBill(wUnits2, liveRates, extraWithCharges, { discount: disc2, ...rateOpts });
                const checks2 = runChecks(res2, wStmt, 0, rateOpts).slice(0, 2);

                const month2 = isTwoCo ? wMonth : (wUnits2.month || prevMonthString(wMonth) || 'Sep-26');

                let pBal2 = 0;
                let prevInv2 = null;
                let pInt2 = 0;
                let pDays2 = 0;

                if (isTwoCo) {
                    pBal2 = Number(pendingInfo2?.prev_balance ?? pendingInfo2?.prevBal) || 0;
                    pInt2 = Number(pendingInfo2?.interest_amt ?? pendingInfo2?.interest) || 0;
                    pDays2 = Number(pendingInfo2?.interest_days ?? pendingInfo2?.interestDays) || 0;
                    prevInv2 = pendingInfo2?.prev_invoice_no || null;
                } else {
                    // Multi-month for same company (e.g. Sep-26 & Oct-26):
                    // Bill 2 carries forward Bill 1's grand total as Previous Balance!
                    pBal2 = res1.grand;
                    prevInv2 = wInvNo;
                    pInt2 = 0;
                    pDays2 = 0;
                }

                let waived2 = 0;
                if (wWaiveInterest2 && pInt2 > 0) {
                    waived2 = parseFloat(wInterestWaived2);
                    if (isNaN(waived2) || waived2 <= 0) {
                        waived2 = pInt2;
                    }
                    if (waived2 > pInt2) {
                        alert(lang === 'en' ? `Waive amount cannot exceed computed interest for bill 2 (₹${pInt2})` : `બિલ ૨ માટે માફ રકમ ગણેલા વ્યાજ (₹${pInt2}) કરતાં વધુ ન હોઈ શકે`);
                        return;
                    }
                    if (!wInterestWaiveReason2.trim()) {
                        alert(lang === 'en' ? 'Reason for waiving interest for bill 2 is mandatory' : 'બિલ ૨ માટે વ્યાજ માફ કરવાનું કારણ લખવું ફરજિયાત છે');
                        return;
                    }
                }
                const netInterest2 = Math.max(0, pInt2 - waived2);

                billList.push({
                    company: comp2,
                    discount: disc2,
                    discountRate: disc2,
                    month: month2,
                    invNo: inv2,
                    invDate: wInvDate,
                    dueDate: wDueDate,
                    cust: wCust,
                    units: { ...wUnits2 },
                    stmt: { ...wStmt },
                    extra: extraWithCharges,
                    rates: liveRates,
                    result: res2,
                    checks: checks2,
                    prevBal: pBal2,
                    prevInvoiceNo: prevInv2,
                    interest: pInt2,
                    interestDays: pDays2,
                    interestWaived: waived2,
                    interestWaiveReason: wInterestWaiveReason2.trim(),
                    totalOut: Math.round((pBal2 + netInterest2 + res2.grand) * 100) / 100
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
                formData.append(`bills[${index}][prev_invoice_no]`, b.prevInvoiceNo || '');
                formData.append(`bills[${index}][interest_amt]`, b.interest);
                formData.append(`bills[${index}][interest_days]`, b.interestDays);
                formData.append(`bills[${index}][interest_waived]`, b.interestWaived || 0);
                formData.append(`bills[${index}][interest_waive_reason]`, b.interestWaiveReason || '');

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

    // Print Invoice Handler (Single or Combined)
    const handlePrintInvoice = (billOrBills) => {
        const billsArr = Array.isArray(billOrBills) ? billOrBills : [billOrBills];
        setViewingBills(billsArr);
        setViewingBill(null);
        setTimeout(() => {
            window.print();
        }, 250);
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
        setWMonth(getCurrentBillingMonth());
        setWInvDate(new Date().toISOString().slice(0, 10));
        setWPdfFile(null);
        setWPdfName('');
        setPdfValidation(null);
        setWUnits({ credited: '', peak: '', banking: '', generated: '' });
        setWTwoCo(false);
        setWUnits2({ mode: 'multi_month', companyId: '', month: '', credited: '', peak: '', banking: '', generated: '', invNo: '' });
        setComputedBills([]);
        const comp = companies.find(c => c.id == wCompanyId);
        if (comp) {
            const fy = fyOf(new Date().toISOString().slice(0, 10));
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
        setWUnits2({ mode: 'multi_month', companyId: wCompanyId, month: '', credited: '', peak: '', banking: '', generated: '', invNo: '' });
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
                    className={`nav-pill-btn ${activeTab === 'charges' ? 'active' : ''}`}
                    onClick={() => setActiveTab('charges')}
                >
                    <Percent size={17} />
                    <span>{lang === 'en' ? 'Charges & Rebates' : 'ચાર્જ & રીબેટ માસ્ટર'}</span>
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

                    {/* Step 1: Company & Month Selection (Mobile-First Polish) */}
                    {wizStep === 1 && (
                        <div className="step1-card-container">
                            <div className="step1-section-header">
                                <div>
                                    <h3 className="card-title" style={{ margin: '0 0 4px 0' }}>
                                        {lang === 'en' ? 'Step 1 — Company & Billing Period' : 'Step 1 — કંપની અને બિલિંગ મહિનો'}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                                        {lang === 'en' ? 'Select solar power plant, statement PDF and billing period.' : 'પાવર પ્લાન્ટ કંપની, સ્ટેટમેન્ટ PDF અને બિલિંગ મહિનો પસંદ કરો.'}
                                    </p>
                                </div>
                                <span className="step1-badge-auto">
                                    <ShieldCheck size={14} />
                                    <span>{lang === 'en' ? 'Audit Verified' : 'ઓડિટ વેરિફાઈડ'}</span>
                                </span>
                            </div>

                            {/* Inline Error Banner */}
                            {step1Error && (
                                <div className="step1-error-banner">
                                    <AlertTriangle size={18} />
                                    <span>{step1Error}</span>
                                </div>
                            )}

                            {/* 1. Company Selection Cards */}
                            <div style={{ marginBottom: '18px' }}>
                                <label className="step1-label">
                                    <span>{lang === 'en' ? 'Select Power Generating Company' : '૧. પાવર ઉત્પાદક કંપની પસંદ કરો'}</span>
                                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{companies.length} કંપનીઓ ઉપલબ્ધ</span>
                                </label>
                                <div className="step1-company-grid">
                                    {companies.map(c => {
                                        const isSelected = String(wCompanyId) === String(c.id);
                                        const dueDays = c.due_days || settings.due_days || 15;
                                        const monogram = (c.inv_prefix || c.name || 'CO').slice(0, 3).toUpperCase();
                                        return (
                                            <div
                                                key={c.id}
                                                className={`step1-company-card ${isSelected ? 'selected' : ''}`}
                                                onClick={() => handleCompanyChange(c.id)}
                                                role="radio"
                                                aria-checked={isSelected}
                                            >
                                                <div className="step1-radio-dot">
                                                    {isSelected && <div className="step1-radio-inner" />}
                                                </div>
                                                <div className="step1-co-avatar">
                                                    {c.logo_path ? (
                                                        <img src={c.logo_path} alt={c.name} />
                                                    ) : (
                                                        <span>{monogram}</span>
                                                    )}
                                                </div>
                                                <div className="step1-co-details">
                                                    <div className="step1-co-name" title={c.name}>{c.name}</div>
                                                    <div className="step1-co-meta">
                                                        <span className="step1-co-pill prefix">{c.inv_prefix || 'RS'}</span>
                                                        <span className="step1-co-pill due">{dueDays} દિવસ મુદત</span>
                                                        {c.discount && <span className="step1-co-pill">₹{Number(c.discount).toFixed(2)} PPA</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 2. Modern PDF Statement Upload & Drop Zone */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <label className="step1-label" style={{ margin: 0 }}>
                                        <span>{lang === 'en' ? 'PGVCL Open Access Statement PDF' : '૨. PGVCL ઓપન એક્સેસ સ્ટેટમેન્ટ PDF'}</span>
                                    </label>
                                    <span className="step1-badge-auto">
                                        ⚡ {lang === 'en' ? 'Auto-reads Month & Audits' : 'ઓટો-ડિટેક્ટ અને ઓડિટ'}
                                    </span>
                                </div>

                                <div
                                    className={`step1-dropzone ${wPdfFile ? 'has-file' : ''}`}
                                    onClick={() => document.getElementById('step1-pdf-input')?.click()}
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                            handlePdfUpload(e.dataTransfer.files[0]);
                                        }
                                    }}
                                >
                                    <input autoComplete="off"
                                        id="step1-pdf-input"
                                        type="file"
                                        accept=".pdf"
                                        style={{ display: 'none' }}
                                        onChange={(e) => handlePdfUpload(e.target.files[0])}
                                    />

                                    {wPdfFile ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <FileText size={22} />
                                                </div>
                                                <div style={{ textAlign: 'left' }}>
                                                    <b style={{ fontSize: '13.5px', color: '#0f172a', display: 'block', wordBreak: 'break-all' }}>{wPdfName}</b>
                                                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                                                        {(wPdfFile.size ? (wPdfFile.size / 1024).toFixed(1) + ' KB' : 'PDF Document')}
                                                    </span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {isAutoMonth ? (
                                                    <span className="step1-badge-auto">
                                                        <CheckCircle2 size={13} />
                                                        <span>મહિનો: <b>{wMonth}</b></span>
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', padding: '3px 8px', borderRadius: '999px', fontWeight: 700 }}>
                                                        સ્કેન કરેલ PDF
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePdfUpload(null);
                                                    }}
                                                    style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '5px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                                                >
                                                    ✕ બદલો
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="step1-dropzone-icon">
                                                <Upload size={22} />
                                            </div>
                                            <div className="step1-dropzone-title">
                                                {lang === 'en' ? 'Tap to upload or drag & drop PDF statement' : 'PDF સ્ટેટમેન્ટ અહીં ડ્રેગ કરો અથવા ફાઈલ પસંદ કરવા ટેપ કરો'}
                                            </div>
                                            <div className="step1-dropzone-subtitle">
                                                {lang === 'en' ? 'PGVCL Open Access Statement (.pdf up to 10MB)' : 'PGVCL ઓપન એક્સેસ ક્રેડિટ સ્ટેટમેન્ટ (.pdf)'}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {pdfValidation && (
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '10px',
                                        marginBottom: '14px',
                                        border: pdfValidation.severity === 'error' ? '1.5px solid #ef4444' : pdfValidation.severity === 'warning' ? '1.5px solid #f59e0b' : '1.5px solid #10b981',
                                        background: pdfValidation.severity === 'error' ? '#fef2f2' : pdfValidation.severity === 'warning' ? '#fffbeb' : '#f0fdf4'
                                    }}>
                                        <div style={{ color: pdfValidation.severity === 'error' ? '#dc2626' : pdfValidation.severity === 'warning' ? '#d97706' : '#059669', marginTop: '2px' }}>
                                            {pdfValidation.severity === 'error' ? <XCircle size={18} /> : pdfValidation.severity === 'warning' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: '13px', color: pdfValidation.severity === 'error' ? '#991b1b' : pdfValidation.severity === 'warning' ? '#92400e' : '#065f46' }}>
                                                {pdfValidation.title}
                                            </div>
                                            <div style={{ fontSize: '12px', marginTop: '3px', lineHeight: 1.5, color: pdfValidation.severity === 'error' ? '#7f1d1d' : pdfValidation.severity === 'warning' ? '#78350f' : '#047857' }}>
                                                {pdfValidation.message}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 3. Billing Month & Dates Grid */}
                            <div className="step1-grid-2">
                                {/* Billing Month + Quick Month Chips */}
                                <div className="step1-input-group">
                                    <label className="step1-label">
                                        <span>{lang === 'en' ? 'Billing Month (e.g. Aug-26)' : '૩. બિલિંગ મહિનો (દા.ત. Aug-26)'}</span>
                                        {isAutoMonth ? (
                                            <span className="step1-badge-auto">✓ PDF માંથી ઓટો</span>
                                        ) : (
                                            <span style={{ fontSize: '11px', color: '#64748b' }}>મેન્યુઅલ / ઝડપી પસંદગી</span>
                                        )}
                                    </label>
                                    <input autoComplete="off"
                                        type="text"
                                        className="step1-input"
                                        value={wMonth}
                                        placeholder="Aug-26"
                                        onChange={(e) => {
                                            setWMonth(e.target.value);
                                            setIsAutoMonth(false);
                                        }}
                                    />
                                    {/* Quick Month Chips */}
                                    <div className="step1-quick-months">
                                        {['Aug-26', 'Sep-26', 'Oct-26', 'Nov-26'].map((qm) => (
                                            <button
                                                key={qm}
                                                type="button"
                                                className={`step1-month-pill ${wMonth.toLowerCase() === qm.toLowerCase() ? 'active' : ''}`}
                                                onClick={() => {
                                                    setWMonth(qm);
                                                    setIsAutoMonth(false);
                                                    const comp = companies.find(c => c.id == wCompanyId);
                                                    if (comp) applyCompanyConfig(comp, wInvDate, settings);
                                                }}
                                            >
                                                {qm}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Invoice Date */}
                                <div className="step1-input-group">
                                    <label className="step1-label">
                                        <span>{lang === 'en' ? 'Invoice Date' : 'ઇનવોઇસ તારીખ'}</span>
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>આજની તારીખ (Editable)</span>
                                    </label>
                                    <input autoComplete="off"
                                        type="date"
                                        className="step1-input"
                                        value={wInvDate}
                                        onChange={(e) => setWInvDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="step1-grid-2" style={{ marginTop: '12px' }}>
                                {/* Invoice Number */}
                                <div className="step1-input-group">
                                    <label className="step1-label">
                                        <span>{lang === 'en' ? 'Invoice Number (Auto Sequence)' : 'ઇનવોઇસ નંબર (Auto Serial)'}</span>
                                        <span className="step1-co-pill prefix">{companies.find(c => c.id == wCompanyId)?.inv_prefix || 'RS'}</span>
                                    </label>
                                    <input autoComplete="off"
                                        type="text"
                                        className="step1-input"
                                        value={wInvNo}
                                        onChange={(e) => setWInvNo(e.target.value)}
                                    />
                                </div>

                                {/* Due Date with Auto Calculation Badge */}
                                <div className="step1-input-group">
                                    <label className="step1-label">
                                        <span>{lang === 'en' ? 'Payment Due Date' : 'ચૂકવણી આખરી તારીખ'}</span>
                                        <span className="step1-badge-due">
                                            ⚡ {companies.find(c => c.id == wCompanyId)?.due_days || settings.due_days || 15} દિવસ મુદત
                                        </span>
                                    </label>
                                    <input autoComplete="off"
                                        type="date"
                                        className="step1-input"
                                        value={wDueDate}
                                        onChange={(e) => setWDueDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Customer Profile (Bill To) */}
                            <div style={{ marginTop: '14px', marginBottom: '22px' }}>
                                <label className="step1-label">
                                    <span>{lang === 'en' ? 'Customer / Factory (Bill To)' : 'ગ્રાહક / ફેક્ટરી (બિલ કોના નામે છે)'}</span>
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>GSTIN: {wCust.gst || '24AABCO3285B1ZU'}</span>
                                </label>
                                <input autoComplete="off"
                                    type="text"
                                    className="step1-input"
                                    value={wCust.name}
                                    placeholder="Blueart Granito Pvt. Ltd."
                                    onChange={(e) => setWCust({ ...wCust, name: e.target.value })}
                                />
                            </div>

                            {/* Action Buttons Row */}
                            <div style={{ marginTop: '16px' }}>
                                <button
                                    type="button"
                                    className="step1-btn-next"
                                    onClick={handleStep1Next}
                                >
                                    <span>{lang === 'en' ? 'Next: Enter Units & Statement Data →' : 'આગળ વધો: યુનિટ્સ & ડેટા એન્ટ્રી →'}</span>
                                    <ArrowRight size={18} />
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
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        className="btn-example-load"
                                        onClick={() => handleLoadExample('single')}
                                        title="Load Rajeshwari Solar single bill demo"
                                    >
                                        ⚡ {lang === 'en' ? 'Load Demo (Single Bill)' : 'રાજેશ્વરી ઉદાહરણ લોડ કરો'}
                                    </button>
                                </div>
                            </div>

                            {step2Error && (
                                <div className="step1-error-banner" style={{ marginBottom: '14px' }}>
                                    <AlertTriangle size={18} />
                                    <span>{step2Error}</span>
                                </div>
                            )}

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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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

                            {/* Section B: Second Bill Option (Two Months for Same Company OR Two Companies) */}
                            <details className="accordion-sec">
                                <summary>
                                    <b>B. બીજું બિલ ઉમેરો (2nd Month અથવા 2nd Company)</b>
                                    <span className="accordion-badge optional">ઓપ્શનલ</span>
                                </summary>
                                <div className="accordion-body">
                                    <label className="checkbox-label" style={{ marginBottom: '12px' }}>
                                        <input autoComplete="off"
                                            type="checkbox"
                                            checked={wTwoCo}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setWTwoCo(checked);
                                                if (checked) {
                                                    setWUnits2(prev => ({
                                                        ...prev,
                                                        mode: prev.mode || 'multi_month',
                                                        companyId: prev.companyId || wCompanyId,
                                                        month: prev.month || (wMonth ? prevMonthString(wMonth) : 'Sep-26')
                                                    }));
                                                }
                                            }}
                                        />
                                        <span><b>એક જ સાથે બીજું બિલ પણ બનાવવું છે (૨ મહિનાનું અથવા બીજી કંપનીનું)</b></span>
                                    </label>

                                    {wTwoCo && (
                                        <div className="two-co-box" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
                                            {/* Mode Selector Tabs */}
                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setWUnits2(prev => ({
                                                        ...prev,
                                                        mode: 'multi_month',
                                                        companyId: wCompanyId,
                                                        month: prev.month || (wMonth ? prevMonthString(wMonth) : 'Sep-26')
                                                    }))}
                                                    style={{
                                                        flex: 1,
                                                        minWidth: '220px',
                                                        padding: '8px 12px',
                                                        borderRadius: '8px',
                                                        fontSize: '12px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        border: wUnits2.mode !== 'two_company' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                                        background: wUnits2.mode !== 'two_company' ? '#eff6ff' : '#ffffff',
                                                        color: wUnits2.mode !== 'two_company' ? '#1d4ed8' : '#64748b'
                                                    }}
                                                >
                                                    📅 ૨ મહિનાનું બિલ ({companies.find(c => c.id == wCompanyId)?.name || 'આ જ કંપની'})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const other = companies.find(c => c.id != wCompanyId);
                                                        setWUnits2(prev => ({
                                                            ...prev,
                                                            mode: 'two_company',
                                                            companyId: other ? other.id : '',
                                                            month: wMonth
                                                        }));
                                                    }}
                                                    style={{
                                                        flex: 1,
                                                        minWidth: '220px',
                                                        padding: '8px 12px',
                                                        borderRadius: '8px',
                                                        fontSize: '12px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        border: wUnits2.mode === 'two_company' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                                        background: wUnits2.mode === 'two_company' ? '#eff6ff' : '#ffffff',
                                                        color: wUnits2.mode === 'two_company' ? '#1d4ed8' : '#64748b'
                                                    }}
                                                >
                                                    🏢 બીજી કંપનીનું બિલ (Two Companies)
                                                </button>
                                            </div>

                                            {/* Conditional Fields based on mode */}
                                            {wUnits2.mode === 'two_company' ? (
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
                                            ) : (
                                                <div className="form-row-2">
                                                    <div className="form-group">
                                                        <label>કંપની</label>
                                                        <input autoComplete="off"
                                                            type="text"
                                                            className="form-control"
                                                            disabled
                                                            value={`${companies.find(c => c.id == wCompanyId)?.name || 'આ જ કંપની'} (આ જ કંપની)`}
                                                            style={{ background: '#f1f5f9' }}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>બીજા બિલનો મહિનો (2nd Month)</label>
                                                        <input autoComplete="off"
                                                            type="text"
                                                            className="form-control"
                                                            value={wUnits2.month || ''}
                                                            placeholder="Sep-26"
                                                            onChange={(e) => setWUnits2({ ...wUnits2, month: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            <div className="form-row-2">
                                                <div className="form-group">
                                                    <label>Credited Unit</label>
                                                    <input autoComplete="off"
                                                        type="number"
                                                        step="any"
                                                        className="form-control"
                                                        value={wUnits2.credited}
                                                        placeholder="0"
                                                        onChange={(e) => setWUnits2({ ...wUnits2, credited: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Peak Unit</label>
                                                    <input autoComplete="off"
                                                        type="number"
                                                        step="any"
                                                        className="form-control"
                                                        value={wUnits2.peak}
                                                        placeholder="0"
                                                        onChange={(e) => setWUnits2({ ...wUnits2, peak: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-row-2">
                                                <div className="form-group">
                                                    <label>Banking Unit</label>
                                                    <input autoComplete="off"
                                                        type="number"
                                                        step="any"
                                                        className="form-control"
                                                        value={wUnits2.banking}
                                                        placeholder="0"
                                                        onChange={(e) => setWUnits2({ ...wUnits2, banking: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Generated Unit (ખાલી=ઓટો)</label>
                                                    <input autoComplete="off"
                                                        type="number"
                                                        step="any"
                                                        className="form-control"
                                                        value={wUnits2.generated}
                                                        placeholder="Auto 6.5%"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wExtra.lossPct}
                                                onChange={(e) => setWExtra({ ...wExtra, lossPct: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Cross Subsidy %</label>
                                            <input autoComplete="off"
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
                                            <input autoComplete="off"
                                                type="number"
                                                step="any"
                                                className="form-control"
                                                value={wExtra.wheelRate}
                                                onChange={(e) => setWExtra({ ...wExtra, wheelRate: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Banking Rate (₹/Unit)</label>
                                            <input autoComplete="off"
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

                            {/* Section E: Overdue Interest & Balance Action */}
                            {(Number(pendingInfo?.interest_amt) > 0 || Number(pendingInfo?.prev_balance) > 0) && (
                                <div style={{ marginTop: '16px', border: '1.5px solid #fde047', background: '#fefce8', padding: '14px 16px', borderRadius: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Clock size={18} color="#b45309" />
                                            <b style={{ color: '#92400e', fontSize: '14px' }}>
                                                {lang === 'en' ? 'Previous Balance & Overdue Interest (18%)' : 'પાછલું બાકી બેલેન્સ & ઓવરડ્યુ વ્યાજ (૧૮% વાર્ષિક)'}
                                            </b>
                                        </div>
                                        {pendingInfo?.prev_invoice_no && (
                                            <span style={{ fontSize: '12px', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                                ગત ઇનવોઇસ: {pendingInfo.prev_invoice_no}
                                            </span>
                                        )}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '12px', background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #fef08a' }}>
                                        <div>
                                            <small style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>પાછલું બાકી (Principal):</small>
                                            <b style={{ color: '#0f172a', fontSize: '14px' }}>₹{inr(pendingInfo?.prev_balance || 0)}</b>
                                        </div>
                                        <div>
                                            <small style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>ઓવરડ્યુ દિવસો:</small>
                                            <b style={{ color: '#b45309', fontSize: '14px' }}>{pendingInfo?.interest_days || 0} દિવસ</b>
                                        </div>
                                        <div>
                                            <small style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>ગણેલ વ્યાજ (Interest):</small>
                                            <b style={{ color: '#dc2626', fontSize: '14px' }}>₹{inr(pendingInfo?.interest_amt || 0)}</b>
                                        </div>
                                    </div>

                                    {Number(pendingInfo?.interest_amt) > 0 && (
                                        <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                                                    <input autoComplete="off"
                                                        type="radio"
                                                        name="waive_interest_choice_1"
                                                        checked={!wWaiveInterest}
                                                        onChange={() => setWWaiveInterest(false)}
                                                    />
                                                    <span>વ્યાજ લાગુ કરો (Apply Full Interest)</span>
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#b45309' }}>
                                                    <input autoComplete="off"
                                                        type="radio"
                                                        name="waive_interest_choice_1"
                                                        checked={wWaiveInterest}
                                                        onChange={() => {
                                                            setWWaiveInterest(true);
                                                            if (!wInterestWaived) setWInterestWaived(String(pendingInfo.interest_amt));
                                                        }}
                                                    />
                                                    <span>વ્યાજ માફ કરો (Waive Overdue Interest)</span>
                                                </label>
                                            </div>

                                            {wWaiveInterest && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', marginTop: '10px', background: '#fffbeb', padding: '10px', borderRadius: '6px' }}>
                                                    <div className="form-group" style={{ margin: 0 }}>
                                                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>
                                                            માફ કરવાની રકમ (₹):
                                                        </label>
                                                        <input autoComplete="off"
                                                            type="number"
                                                            step="any"
                                                            max={pendingInfo?.interest_amt}
                                                            className="form-control"
                                                            placeholder={`મહત્તમ ₹${pendingInfo?.interest_amt}`}
                                                            value={wInterestWaived}
                                                            onChange={(e) => setWInterestWaived(e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group" style={{ margin: 0 }}>
                                                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>
                                                            માફ કરવાનું કારણ (ફરજિયાત):
                                                        </label>
                                                        <input autoComplete="off"
                                                            type="text"
                                                            className="form-control"
                                                            placeholder="દા.ત. વહેલી ચુકવણી નિમિત્તે મેનેજમેન્ટે વ્યાજ માફ કરેલ છે"
                                                            value={wInterestWaiveReason}
                                                            onChange={(e) => setWInterestWaiveReason(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Section E-2: Company 2 Overdue Balance & Interest Action (if applicable) */}
                            {wTwoCo && (Number(pendingInfo2?.interest_amt) > 0 || Number(pendingInfo2?.prev_balance) > 0) && (
                                <div style={{ marginTop: '14px', border: '1.5px solid #fde047', background: '#fefce8', padding: '14px 16px', borderRadius: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Clock size={18} color="#b45309" />
                                            <b style={{ color: '#92400e', fontSize: '14px' }}>
                                                કંપની ૨: પાછલું બાકી & વ્યાજ {pendingInfo2?.prev_invoice_no ? `(ઇનવોઇસ: ${pendingInfo2.prev_invoice_no})` : ''}
                                            </b>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '12px', background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #fef08a' }}>
                                        <div>
                                            <small style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>પાછલું બાકી:</small>
                                            <b style={{ color: '#0f172a', fontSize: '14px' }}>₹{inr(pendingInfo2?.prev_balance || 0)}</b>
                                        </div>
                                        <div>
                                            <small style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>ઓવરડ્યુ દિવસો:</small>
                                            <b style={{ color: '#b45309', fontSize: '14px' }}>{pendingInfo2?.interest_days || 0} દિવસ</b>
                                        </div>
                                        <div>
                                            <small style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>ગણેલ વ્યાજ:</small>
                                            <b style={{ color: '#dc2626', fontSize: '14px' }}>₹{inr(pendingInfo2?.interest_amt || 0)}</b>
                                        </div>
                                    </div>

                                    {Number(pendingInfo2?.interest_amt) > 0 && (
                                        <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                                                    <input autoComplete="off"
                                                        type="radio"
                                                        name="waive_interest_choice_2"
                                                        checked={!wWaiveInterest2}
                                                        onChange={() => setWWaiveInterest2(false)}
                                                    />
                                                    <span>વ્યાજ લાગુ કરો</span>
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#b45309' }}>
                                                    <input autoComplete="off"
                                                        type="radio"
                                                        name="waive_interest_choice_2"
                                                        checked={wWaiveInterest2}
                                                        onChange={() => {
                                                            setWWaiveInterest2(true);
                                                            if (!wInterestWaived2) setWInterestWaived2(String(pendingInfo2.interest_amt));
                                                        }}
                                                    />
                                                    <span>વ્યાજ માફ કરો</span>
                                                </label>
                                            </div>

                                            {wWaiveInterest2 && (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', marginTop: '10px', background: '#fffbeb', padding: '10px', borderRadius: '6px' }}>
                                                    <div className="form-group" style={{ margin: 0 }}>
                                                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>
                                                            માફ કરવાની રકમ (₹):
                                                        </label>
                                                        <input autoComplete="off"
                                                            type="number"
                                                            step="any"
                                                            max={pendingInfo2?.interest_amt}
                                                            className="form-control"
                                                            placeholder={`મહત્તમ ₹${pendingInfo2?.interest_amt}`}
                                                            value={wInterestWaived2}
                                                            onChange={(e) => setWInterestWaived2(e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group" style={{ margin: 0 }}>
                                                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>
                                                            માફ કરવાનું કારણ (ફરજિયાત):
                                                        </label>
                                                        <input autoComplete="off"
                                                            type="text"
                                                            className="form-control"
                                                            placeholder="કારણ દાખલ કરો"
                                                            value={wInterestWaiveReason2}
                                                            onChange={(e) => setWInterestWaiveReason2(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {step2Error && (
                                <div className="step1-error-banner" style={{ marginBottom: '14px' }}>
                                    <AlertTriangle size={18} />
                                    <span>{step2Error}</span>
                                </div>
                            )}

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
                                        prevInvoiceNo={b.prevInvoiceNo}
                                        interest={b.interest}
                                        interestDays={b.interestDays}
                                        interestPct={b.company?.interest_pct ?? 18}
                                        interestWaived={b.interestWaived || 0}
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
                                    onClick={() => handlePrintInvoice(computedBills)}
                                >
                                    <Printer size={16} /> <span>{computedBills.length > 1 ? (lang === 'en' ? 'Print All / PDF' : 'બધા બિલ પ્રિન્ટ / PDF') : (lang === 'en' ? 'Print / PDF' : 'પ્રિન્ટ / PDF')}</span>
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
                            <input autoComplete="off"
                                type="text"
                                className="form-control"
                                placeholder={lang === 'en' ? 'Search invoice, month...' : 'ઇનવોઇસ નં, મહિનો શોધો...'}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Multi-Bill Selection & Batch Actions Bar */}
                    {bills.length > 0 && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 16px',
                            background: selectedBillIds.length > 0 ? '#f0fdf4' : '#ffffff',
                            borderRadius: '12px',
                            border: selectedBillIds.length > 0 ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                            marginBottom: '14px',
                            flexWrap: 'wrap',
                            gap: '10px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input autoComplete="off"
                                    type="checkbox"
                                    id="select-all-bills"
                                    checked={selectedBillIds.length === bills.length && bills.length > 0}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedBillIds(bills.map(b => b.id));
                                        } else {
                                            setSelectedBillIds([]);
                                        }
                                    }}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#059669' }}
                                />
                                <label htmlFor="select-all-bills" style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                                    {selectedBillIds.length > 0
                                        ? `${selectedBillIds.length} બિલ પસંદ કરેલ (Selected)`
                                        : (lang === 'en' ? 'Select All Bills for Batch Print' : 'બધા બિલ પસંદ કરો (Select All)')}
                                </label>
                            </div>

                            {selectedBillIds.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        type="button"
                                        className="btn-action-print"
                                        style={{ padding: '7px 16px', fontSize: '12.5px', fontWeight: 800, background: '#059669', color: '#ffffff', border: 'none', borderRadius: '8px' }}
                                        onClick={() => {
                                            const toPrint = bills.filter(b => selectedBillIds.includes(b.id));
                                            handlePrintInvoice(toPrint);
                                        }}
                                    >
                                        <Printer size={15} />
                                        <span>📄 સંયુક્ત પ્રિન્ટ / PDF ({selectedBillIds.length} Bills)</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ padding: '7px 12px', fontSize: '12px', borderRadius: '8px' }}
                                        onClick={() => setSelectedBillIds([])}
                                    >
                                        ✕ રદ કરો
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Active Filter Clear Banner */}
                    {(filterCompany !== 'all' || filterMonth !== 'all' || filterStatus !== 'all' || searchQuery) && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '10px', marginBottom: '14px', fontSize: '13px', color: '#92400e' }}>
                            <span>🔍 ફિલ્ટર લાગુ છે — {bills.length} બિલ દર્શાવેલ છે.</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setFilterCompany('all');
                                    setFilterMonth('all');
                                    setFilterStatus('all');
                                    setSearchQuery('');
                                }}
                                style={{ background: '#d97706', color: '#ffffff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                ફિલ્ટર સાફ કરો (Clear)
                            </button>
                        </div>
                    )}

                    {/* Bills Table / Cards */}
                    <div className="records-list">
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '48px 20px', background: '#f8fafc', borderRadius: '16px', border: '1.5px solid #e2e8f0', margin: '20px 0' }}>
                                <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#059669' }} />
                                <p style={{ color: '#64748b', fontSize: '14px', fontWeight: 600 }}>
                                    {lang === 'en' ? 'Loading billing records...' : 'બિલ રેકોર્ડ લોડ થઈ રહ્યા છે...'}
                                </p>
                            </div>
                        ) : bills.length === 0 ? (
                            <div className="empty-records" style={{ textAlign: 'center', padding: '48px 20px', background: '#f8fafc', borderRadius: '16px', border: '1.5px dashed #cbd5e1', margin: '20px 0' }}>
                                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                    <FolderClock size={32} />
                                </div>
                                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1e293b', margin: '0 0 6px' }}>
                                    {lang === 'en' ? 'No Billing Records Found' : 'કોઈ બિલ રેકોર્ડ મળ્યા નથી'}
                                </h3>
                                <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '360px', margin: '0 auto 18px', lineHeight: 1.5 }}>
                                    {lang === 'en'
                                        ? 'No solar bills match your selected filter. Create your first bill using the wizard.'
                                        : 'પસંદ કરેલ ફિલ્ટરમાં કોઈ બિલ મળ્યું નથી. નવું બિલ બનાવવા માટે વિઝાર્ડનો ઉપયોગ કરો.'}
                                </p>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => setActiveTab('bill')}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px', fontSize: '13.5px', fontWeight: 700 }}
                                >
                                    <Plus size={16} />
                                    <span>{lang === 'en' ? 'Create New Bill' : '＋ નવું બિલ બનાવો'}</span>
                                </button>
                            </div>
                        ) : (
                            bills.map((bill) => {
                                const isPending = bill.status === 'pending';
                                const isVoid = bill.status === 'void';
                                const live = bill.live_ledger;
                                const isSelected = selectedBillIds.includes(bill.id);

                                return (
                                    <div key={bill.id} className={`bill-record-card ${bill.status}`} style={{ outline: isSelected ? '2px solid #10b981' : 'none' }}>
                                        <div className="record-top-row">
                                            <div className="record-title-col" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input autoComplete="off"
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedBillIds([...selectedBillIds, bill.id]);
                                                        } else {
                                                            setSelectedBillIds(selectedBillIds.filter(id => id !== bill.id));
                                                        }
                                                    }}
                                                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#059669' }}
                                                />
                                                <b className="record-inv-no">{bill.invoice_no}</b>
                                                {bill.prev_invoice_no && (
                                                    <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '2px' }}>
                                                        (ગત: {bill.prev_invoice_no})
                                                    </span>
                                                )}
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

                                        {Number(bill.interest_waived) > 0 && (
                                            <div style={{ marginTop: '6px', fontSize: '12px', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <CheckCircle2 size={13} color="#16a34a" />
                                                <span>વ્યાજ માફ: <b>₹{inr(bill.interest_waived)}</b> {bill.interest_waive_reason ? `(${bill.interest_waive_reason})` : ''}</span>
                                            </div>
                                        )}

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

                                            {!isVoid && isPending && (Number(bill.interest_amt) > 0 || Number(bill.live_ledger?.live_accrued_interest) > 0) && (
                                                <button
                                                    type="button"
                                                    className="btn-sm"
                                                    style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 600 }}
                                                    onClick={() => setWaiveModal({
                                                        open: true,
                                                        bill: bill,
                                                        waiveAmount: String(bill.interest_amt || bill.live_ledger?.live_accrued_interest || ''),
                                                        reason: bill.interest_waive_reason || ''
                                                    })}
                                                    title="ઓવરડ્યુ વ્યાજ માફ કરો"
                                                >
                                                    <ShieldCheck size={14} />
                                                    <span>વ્યાજ માફી</span>
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

            {/* TAB: CHARGE & REBATE MASTER */}
            {activeTab === 'charges' && (
                <div className="billing-charges-container">
                    <div className="card-header-flex" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div>
                            <h3 className="card-title" style={{ margin: 0, fontSize: '18px' }}>
                                {lang === 'en' ? 'Charge & Rebate Master' : 'ચાર્જ & રીબેટ માસ્ટર'}
                            </h3>
                            <small className="form-hint" style={{ marginTop: '2px', display: 'block' }}>
                                {lang === 'en'
                                    ? 'Dynamic charges & rebates engine — configure any charge or rebate without code changes or migrations.'
                                    : 'ડાયનેમિક ચાર્જ & રીબેટ એન્જિન — કોડ કે માઇગ્રેશન બદલ્યા વગર નવા ચાર્જ/રીબેટ ઉમેરો કે રેટ બદલો.'}
                            </small>
                        </div>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setEditingCharge({
                                id: null,
                                name: '',
                                code: '',
                                type: 'rebate',
                                calc_basis: 'per_banking_unit',
                                value: '',
                                company_id: '',
                                effective_from: new Date().toISOString().slice(0, 10),
                                effective_to: '',
                                sort_order: 10,
                                is_active: true,
                                history: false
                            })}
                        >
                            <Plus size={16} /> <span>{lang === 'en' ? 'Add Charge / Rebate' : 'નવો ચાર્જ / રીબેટ ઉમેરો'}</span>
                        </button>
                    </div>

                    {/* Master Info Notice */}
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#166534', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                            <b>માસ્ટર નિયમ:</b> કોઈપણ નવો ચાર્જ કે રીબેટ નવી ROW તરીકે સ્ટોર થાય છે. 
                            બેન્કિંગ ચાર્જ <b>Banking Units</b> પર ગણાય છે (Credited Units પર નહીં). રેટ બદલતી વખતે 'Preserve Rate History' ઓન રાખવાથી જૂના બિલોના ઓડિટ પર કોઈ અસર થતી નથી.
                        </div>
                    </div>

                    {/* Charges Table */}
                    <div className="billing-card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                                        <th style={{ padding: '12px 14px' }}>નામ / કોડ</th>
                                        <th style={{ padding: '12px 14px' }}>પ્રકાર</th>
                                        <th style={{ padding: '12px 14px' }}>ગણતરી આધાર (Basis)</th>
                                        <th style={{ padding: '12px 14px' }}>વેલ્યુ / રેટ</th>
                                        <th style={{ padding: '12px 14px' }}>કંપની સ્કોપ</th>
                                        <th style={{ padding: '12px 14px' }}>સમયગાળો (Effective)</th>
                                        <th style={{ padding: '12px 14px' }}>સ્ટેટસ</th>
                                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>ક્રિયા</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {charges.length === 0 ? (
                                        <tr>
                                            <td colSpan="8" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                                                {chargesLoading ? 'ચાર્જ લોડ થઈ રહ્યા છે...' : 'કોઈ ચાર્જ કે રીબેટ મળ્યા નથી.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        charges.map(c => {
                                            const isRebate = c.type === 'rebate';
                                            const basisLabels = {
                                                per_banking_unit: 'Banking Unit દીઠ',
                                                per_unit: 'Credited Unit દીઠ',
                                                per_peak_unit: 'Peak Unit દીઠ',
                                                per_gen_unit: 'Generated Unit દીઠ',
                                                pct_energy_fca: '% of (Energy + FCA)',
                                                pct_energy: '% of Energy',
                                                pct_board: '% of Board Charge',
                                                fixed: 'Fixed રકમ (₹)'
                                            };
                                            return (
                                                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: c.is_active ? '#ffffff' : '#f8fafc', opacity: c.is_active ? 1 : 0.65 }}>
                                                    <td style={{ padding: '12px 14px' }}>
                                                        <b style={{ color: '#0f172a', display: 'block' }}>{c.name}</b>
                                                        <code style={{ fontSize: '11px', color: '#64748b' }}>{c.code}</code>
                                                    </td>
                                                    <td style={{ padding: '12px 14px' }}>
                                                        <span style={{
                                                            padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                                                            background: isRebate ? '#dcfce7' : '#ffedd5',
                                                            color: isRebate ? '#15803d' : '#c2410c'
                                                        }}>
                                                            {isRebate ? '− રીબેટ (કપાત)' : '+ ચાર્જ (ઉમેરો)'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px 14px', color: '#334155' }}>
                                                        <span style={{ fontWeight: c.calc_basis === 'per_banking_unit' ? 700 : 500, color: c.calc_basis === 'per_banking_unit' ? '#0284c7' : 'inherit' }}>
                                                            {basisLabels[c.calc_basis] || c.calc_basis}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px 14px' }}>
                                                        <b style={{ fontSize: '14px', color: '#0f172a' }}>
                                                            {c.calc_basis.startsWith('pct_') ? `${Number(c.value)}%` : `₹${Number(c.value)}`}
                                                        </b>
                                                    </td>
                                                    <td style={{ padding: '12px 14px' }}>
                                                        {c.company ? (
                                                            <span style={{ background: '#f1f5f9', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
                                                                {c.company.name}
                                                            </span>
                                                        ) : (
                                                            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
                                                                Global (બધી કંપની)
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#64748b' }}>
                                                        <span>{c.effective_from} થી {c.effective_to || 'ચાલુ'}</span>
                                                    </td>
                                                    <td style={{ padding: '12px 14px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                try {
                                                                    await api(`billing/charges/${c.id}/toggle`, { method: 'POST' });
                                                                    fetchCharges();
                                                                } catch (err) {
                                                                    alert(err.message || 'Error toggling charge');
                                                                }
                                                            }}
                                                            style={{
                                                                background: c.is_active ? '#10b981' : '#cbd5e1',
                                                                color: '#ffffff',
                                                                border: 'none',
                                                                padding: '3px 10px',
                                                                borderRadius: '12px',
                                                                fontSize: '11px',
                                                                fontWeight: 700,
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            {c.is_active ? 'ON' : 'OFF'}
                                                        </button>
                                                    </td>
                                                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                        <button
                                                            type="button"
                                                            className="btn-edit-link"
                                                            style={{ marginRight: '8px', cursor: 'pointer' }}
                                                            onClick={() => setEditingCharge({
                                                                ...c,
                                                                value: String(c.value),
                                                                company_id: c.company_id || '',
                                                                history: false
                                                            })}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn-edit-link"
                                                            style={{ color: '#0284c7', cursor: 'pointer' }}
                                                            title="નવા રેટ સાથે નવી હિસ્ટ્રી લાઇન ઉમેરો"
                                                            onClick={() => setEditingCharge({
                                                                ...c,
                                                                value: String(c.value),
                                                                company_id: c.company_id || '',
                                                                effective_from: new Date().toISOString().slice(0, 10),
                                                                effective_to: '',
                                                                history: true
                                                            })}
                                                        >
                                                            નવો રેટ (હિસ્ટ્રી)
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
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
                                <input autoComplete="off"
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={settings.default_discount || '1.25'}
                                    onChange={(e) => setSettings({ ...settings, default_discount: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Annual Interest % (બાકી રકમ પર p.a.)</label>
                                <input autoComplete="off"
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
                                <input autoComplete="off"
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={settings.loss_pct || '6.5'}
                                    onChange={(e) => setSettings({ ...settings, loss_pct: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Payment Due Days (ઇનવોઇસ તારીખથી)</label>
                                <input autoComplete="off"
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
                                <input autoComplete="off"
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={settings.cross_pct || '15.0'}
                                    onChange={(e) => setSettings({ ...settings, cross_pct: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Wheeling Rate (₹/KWH)</label>
                                <input autoComplete="off"
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
                                <input autoComplete="off"
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
                                <input autoComplete="off"
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

                        <input autoComplete="off"
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
                            <input autoComplete="off"
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
                            <input autoComplete="off"
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
                            <input autoComplete="off"
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
                                <input autoComplete="off"
                                    type="text"
                                    className="form-control"
                                    placeholder="24AAAAA0000A1Z5"
                                    value={editingCompany.gstin || ''}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, gstin: e.target.value.toUpperCase() })}
                                />
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Invoice Series Prefix' : 'ઇનવોઇસ પ્રિફિક્સ (દા.ત. RS)'}</label>
                                <input autoComplete="off"
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
                            <input autoComplete="off"
                                type="text"
                                className="form-control"
                                placeholder="Plot No, GIDC, City, Gujarat"
                                value={editingCompany.address || ''}
                                onChange={(e) => setEditingCompany({ ...editingCompany, address: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label>{lang === 'en' ? 'Contact Phone / Mobile' : 'સંપર્ક ફોન / મોબાઇલ'}</label>
                            <input autoComplete="off"
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
                                <input autoComplete="off"
                                    type="text"
                                    className="form-control"
                                    placeholder="State Bank of India"
                                    value={editingCompany.bank_name || ''}
                                    onChange={(e) => setEditingCompany({ ...editingCompany, bank_name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>{lang === 'en' ? 'Bank A/c No.' : 'બેંક એકાઉન્ટ નં.'}</label>
                                <input autoComplete="off"
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
                            <input autoComplete="off"
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
                                <input autoComplete="off"
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
                                <input autoComplete="off"
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
                                <input autoComplete="off"
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
                                <input autoComplete="off"
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
                                <input autoComplete="off"
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
                                <input autoComplete="off"
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
                            <input autoComplete="off"
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
                            <input autoComplete="off"
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
                                <input autoComplete="off"
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
                                <input autoComplete="off"
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

            {/* VIEW BILL / COMBINED BILLS MODAL */}
            {(viewingBill || viewingBills.length > 0) && (() => {
                const activeList = viewingBills.length > 0 ? viewingBills : [viewingBill];
                const isMulti = activeList.length > 1;

                return (
                    <div className="billing-modal-backdrop" onClick={() => { setViewingBill(null); setViewingBills([]); }}>
                        <div className="billing-modal-box large" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header-actions no-print">
                                <h3>
                                    {isMulti
                                        ? `📄 ${activeList.length} સંયુક્ત બિલ (Combined Invoices)`
                                        : (activeList[0].invoice_no || activeList[0].invNo)}
                                </h3>
                                <div className="btn-group">
                                    <button
                                        type="button"
                                        className="btn-action-print"
                                        onClick={() => window.print()}
                                    >
                                        <Printer size={16} /> <span>Print {isMulti ? `All (${activeList.length})` : ''}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => { setViewingBill(null); setViewingBills([]); }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            {activeList.map((b, idx) => (
                                <div
                                    key={b.id || idx}
                                    style={{
                                        pageBreakAfter: idx < activeList.length - 1 ? 'always' : 'auto',
                                        breakAfter: idx < activeList.length - 1 ? 'page' : 'auto',
                                        marginBottom: idx < activeList.length - 1 ? '32px' : '0'
                                    }}
                                >
                                    <ExactSolarBillSheet
                                        company={b.company}
                                        customer={{
                                            name: b.customer_name || b.cust?.name,
                                            address: b.customer_address || b.cust?.address,
                                            gst: b.customer_gstin || b.cust?.gst
                                        }}
                                        invoiceNo={b.invoice_no || b.invNo}
                                        invoiceDate={b.invoice_date || b.invDate}
                                        dueDate={b.due_date || b.dueDate}
                                        month={b.month}
                                        units={b.units_credited || b.units?.credited}
                                        billRate={Number(b.breakdown?.billRate || b.result?.billRate || 0)}
                                        netRate={Number(b.breakdown?.netRate || b.result?.netRate || 0)}
                                        subTotal={Number(b.sub_total || b.result?.net || 0)}
                                        discountRate={Number(b.discount_rate || b.discountRate || b.company?.discount || 1.25)}
                                        discountAmt={Number(b.discount_amt || b.result?.discountAmt || 0)}
                                        prevBal={Number(b.prev_balance || b.prevBal || 0)}
                                        prevInvoiceNo={b.prev_invoice_no || b.prevInvoiceNo || ''}
                                        interest={Number(b.interest_amt || b.interest || 0)}
                                        interestDays={Number(b.interest_days || b.interestDays || 0)}
                                        interestPct={Number(b.company?.interest_pct || settings.interest_pct || 18)}
                                        interestWaived={Number(b.interest_waived || b.interestWaived || 0)}
                                        roundOff={Number(b.round_off || b.result?.roundOff || 0)}
                                        totalOut={Number(b.total_outstanding || b.totalOut || 0)}
                                        note={b.note || ''}
                                        settings={settings}
                                        lang={lang}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* WAIVE OVERDUE INTEREST MODAL */}
            {waiveModal.open && (
                <div className="billing-modal-backdrop" onClick={() => setWaiveModal({ open: false, bill: null, waiveAmount: '', reason: '' })}>
                    <div className="billing-modal-box" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <h3 style={{ margin: 0, color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShieldCheck size={18} color="#b45309" />
                                <span>ઓવરડ્યુ વ્યાજ માફી (Waive Overdue Interest)</span>
                            </h3>
                            <button type="button" className="btn-secondary" style={{ padding: '2px 8px' }} onClick={() => setWaiveModal({ open: false, bill: null, waiveAmount: '', reason: '' })}>✕</button>
                        </div>
                        <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
                            ઇનવોઇસ <b>{waiveModal.bill?.invoice_no}</b> ({waiveModal.bill?.company?.name}) પર ઓવરડ્યુ વ્યાજ માફ કરવા માટે નીચે રકમ અને કારણ દાખલ કરો.
                        </p>
                        <div className="form-group">
                            <label>માફ કરવાની રકમ (Waive Amount ₹):</label>
                            <input autoComplete="off"
                                type="number"
                                step="any"
                                className="form-control"
                                value={waiveModal.waiveAmount}
                                onChange={(e) => setWaiveModal({ ...waiveModal, waiveAmount: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>માફ કરવાનું કારણ (Mandatory Reason - ફરજિયાત):</label>
                            <input autoComplete="off"
                                type="text"
                                className="form-control"
                                placeholder="દા.ત. વહેલી ચુકવણી નિમિત્તે મેનેજમેન્ટે વ્યાજ માફ કરેલ છે"
                                value={waiveModal.reason}
                                onChange={(e) => setWaiveModal({ ...waiveModal, reason: e.target.value })}
                            />
                            <small style={{ fontSize: '11px', color: '#64748b' }}>ઓડિટ લોગમાં આ કારણ કાયમી ધોરણે સચવાશે.</small>
                        </div>
                        <div className="wizard-btn-row" style={{ marginTop: '16px' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setWaiveModal({ open: false, bill: null, waiveAmount: '', reason: '' })}
                            >
                                કેન્સલ
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                style={{ background: '#059669', borderColor: '#059669' }}
                                onClick={async () => {
                                    if (!waiveModal.reason.trim()) {
                                        alert(lang === 'en' ? 'Reason for waiving interest is mandatory' : 'વ્યાજ માફ કરવાનું કારણ લખવું ફરજિયાત છે');
                                        return;
                                    }
                                    const amt = parseFloat(waiveModal.waiveAmount);
                                    if (isNaN(amt) || amt <= 0) {
                                        alert(lang === 'en' ? 'Please enter a valid waive amount' : 'માન્ય માફ રકમ દાખલ કરો');
                                        return;
                                    }
                                    try {
                                        await api(`billing/bills/${waiveModal.bill.id}/waive-interest`, {
                                            method: 'POST',
                                            body: JSON.stringify({
                                                interest_waived: amt,
                                                reason: waiveModal.reason.trim()
                                            })
                                        });
                                        alert(lang === 'en' ? 'Interest waived successfully ✓' : 'વ્યાજ સફળતાપૂર્વક માફ કરવામાં આવ્યું ✓');
                                        setWaiveModal({ open: false, bill: null, waiveAmount: '', reason: '' });
                                        fetchBills();
                                    } catch (err) {
                                        alert(err.message || 'Error waiving interest');
                                    }
                                }}
                            >
                                ખાતરી કરો - વ્યાજ માફ કરો
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT / CREATE CHARGE MODAL */}
            {editingCharge && (
                <div className="billing-modal-backdrop" onClick={() => setEditingCharge(null)}>
                    <div className="billing-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                            <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                                {editingCharge.history
                                    ? 'નવો રેટ દાખલ કરો (Rate History Preservation)'
                                    : editingCharge.id
                                        ? 'ચાર્જ / રીબેટ એડિટ કરો'
                                        : 'નવો ચાર્જ અથવા રીબેટ ઉમેરો'}
                            </h3>
                            <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '13px' }} onClick={() => setEditingCharge(null)}>✕</button>
                        </div>

                        {editingCharge.history && (
                            <div style={{ background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px', fontSize: '12px', color: '#0369a1' }}>
                                <b>દર ઇતિહાસ સાચવણી (Rate History):</b> જૂનો દર '{editingCharge.effective_from}' ની અગાઉ સુધી જ લાગુ રહેશે, અને આ નવો દર નવી ROW તરીકે સેવ થશે. જૂના બિલોના ઓડિટ પર કોઈ અસર થશે નહીં.
                            </div>
                        )}

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>નામ (Name):</label>
                                <input autoComplete="off"
                                    type="text"
                                    className="form-control"
                                    placeholder="દા.ત. Banking Charge"
                                    value={editingCharge.name}
                                    onChange={(e) => setEditingCharge({ ...editingCharge, name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>કોડ (Code - lowercase, underscore):</label>
                                <input autoComplete="off"
                                    type="text"
                                    className="form-control"
                                    placeholder="banking"
                                    disabled={Boolean(editingCharge.id && !editingCharge.history)}
                                    value={editingCharge.code}
                                    onChange={(e) => setEditingCharge({ ...editingCharge, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                                />
                            </div>
                        </div>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>પ્રકાર (Type):</label>
                                <select
                                    className="form-control"
                                    value={editingCharge.type}
                                    onChange={(e) => setEditingCharge({ ...editingCharge, type: e.target.value })}
                                >
                                    <option value="rebate">Rebate (− કપાત / બાદ)</option>
                                    <option value="charge">Charge (+ ઉમેરો)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>ગણતરી આધાર (Calculation Basis):</label>
                                <select
                                    className="form-control"
                                    value={editingCharge.calc_basis}
                                    onChange={(e) => setEditingCharge({ ...editingCharge, calc_basis: e.target.value })}
                                >
                                    <option value="per_banking_unit">per_banking_unit — Banking Unit દીઠ (e.g. 11,497 × 1.50)</option>
                                    <option value="per_unit">per_unit — Credited Unit દીઠ (e.g. 60,392 × 1.25)</option>
                                    <option value="per_gen_unit">per_gen_unit — Generated Unit દીઠ (e.g. Wheeling)</option>
                                    <option value="per_peak_unit">per_peak_unit — Peak Unit દીઠ</option>
                                    <option value="pct_energy_fca">pct_energy_fca — % of (Energy + FCA) (e.g. Cross Subsidy 15%)</option>
                                    <option value="pct_energy">pct_energy — % of Energy Charge</option>
                                    <option value="pct_board">pct_board — % of Board Charge</option>
                                    <option value="fixed">fixed — નક્કી કરેલ ફિક્સ રકમ (₹)</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>વેલ્યુ / રેટ (Value / %):</label>
                                <input autoComplete="off"
                                    type="number"
                                    step="any"
                                    className="form-control"
                                    placeholder="દા.ત. 1.50 અથવા 15"
                                    value={editingCharge.value}
                                    onChange={(e) => setEditingCharge({ ...editingCharge, value: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>કંપની સ્કોપ (Company Scope):</label>
                                <select
                                    className="form-control"
                                    value={editingCharge.company_id || ''}
                                    onChange={(e) => setEditingCharge({ ...editingCharge, company_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                                >
                                    <option value="">Global (બધી કંપનીઓને લાગુ)</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>ક્યારથી લાગુ (Effective From):</label>
                                <input autoComplete="off"
                                    type="date"
                                    className="form-control"
                                    value={editingCharge.effective_from}
                                    onChange={(e) => setEditingCharge({ ...editingCharge, effective_from: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>ક્યારે પૂરું (Effective To - ખાલી = ચાલુ):</label>
                                <input autoComplete="off"
                                    type="date"
                                    className="form-control"
                                    value={editingCharge.effective_to || ''}
                                    onChange={(e) => setEditingCharge({ ...editingCharge, effective_to: e.target.value || null })}
                                />
                            </div>
                        </div>

                        <div className="wizard-btn-row" style={{ marginTop: '16px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setEditingCharge(null)}>
                                કેન્સલ
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={async () => {
                                    if (!editingCharge.name?.trim() || !editingCharge.code?.trim()) {
                                        alert('નામ અને કોડ બંને દાખલ કરવા જરૂરી છે.');
                                        return;
                                    }
                                    if (isNaN(parseFloat(editingCharge.value))) {
                                        alert('માન્ય રેટ દાખલ કરો.');
                                        return;
                                    }
                                    try {
                                        const url = editingCharge.id ? `billing/charges/${editingCharge.id}` : 'billing/charges';
                                        await api(url, {
                                            method: 'POST',
                                            body: JSON.stringify(editingCharge)
                                        });
                                        alert('ચાર્જ/રીબેટ સફળતાપૂર્વક સેવ થયો ✓');
                                        setEditingCharge(null);
                                        fetchCharges();
                                    } catch (err) {
                                        alert(err.message || 'Error saving charge');
                                    }
                                }}
                            >
                                સેવ કરો
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
