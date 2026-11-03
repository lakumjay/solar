import React, { useState, useEffect, useMemo } from 'react';
import {
    Zap,
    Calendar,
    ArrowLeft,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    IndianRupee,
    ShieldCheck,
    Building2,
    RefreshCw,
    Download,
    Receipt,
    ChevronDown,
    Activity,
    Info,
    CheckCircle2,
    SlidersHorizontal,
    Sparkles
} from 'lucide-react';
import { api } from '../api';

export default function TodayBillPage({ currentUser, companies = [], onNavigateBilling }) {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        return d.toISOString().split('T')[0];
    });
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const d = new Date();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${d.getFullYear()}-${m}`;
    });
    const [selectedCompanyId, setSelectedCompanyId] = useState('all');
    const [viewMode, setViewMode] = useState('daily'); // 'daily' | 'monthly'
    const [reportData, setReportData] = useState(null);
    const [error, setError] = useState(null);

    const loadReport = async (dateVal, monthVal, companyVal) => {
        try {
            setRefreshing(true);
            setError(null);
            const params = new URLSearchParams();
            if (dateVal) params.set('date', dateVal);
            if (monthVal) params.set('month', monthVal);
            if (companyVal && companyVal !== 'all') params.set('company_id', companyVal);

            const res = await api(`billing/today-loss-report?${params.toString()}`);
            if (res) {
                setReportData(res);
                if (res.selected_date && (!dateVal || dateVal !== res.selected_date)) {
                    setSelectedDate(res.selected_date);
                }
                if (res.selected_month && (!monthVal || monthVal !== res.selected_month)) {
                    setSelectedMonth(res.selected_month);
                }
            }
        } catch (err) {
            console.error('Failed to load today loss report:', err);
            setError(err.message || 'ડેટા લોડ કરવામાં મુશ્કેલી આવી છે.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadReport(selectedDate, selectedMonth, selectedCompanyId);
    }, [selectedDate, selectedMonth, selectedCompanyId]);

    const changeDateBy = (days) => {
        const current = new Date(selectedDate || new Date());
        current.setDate(current.getDate() + days);
        const nextDate = current.toISOString().split('T')[0];
        setSelectedDate(nextDate);
        const m = String(current.getMonth() + 1).padStart(2, '0');
        setSelectedMonth(`${current.getFullYear()}-${m}`);
    };

    const formatINR = (val) => {
        const num = Number(val || 0);
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(num);
    };

    const formatNum = (val, decimals = 1) => {
        const num = Number(val || 0);
        return new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(num);
    };

    const daySummary = reportData?.day_summary || {};
    const monthSummary = reportData?.month_summary || {};
    const companyStats = reportData?.companies_day || [];
    const dailyHistory = reportData?.daily_history || [];
    const availableMonths = reportData?.available_months || [];

    const officialBill = monthSummary?.official_bill;
    const isOfficialView = viewMode === 'monthly' && !!officialBill;

    const displayPlantUnits = isOfficialView 
        ? officialBill.total_plant_units 
        : (viewMode === 'daily' ? daySummary.plant_total : monthSummary.plant_total);

    const displayCreditedUnits = isOfficialView 
        ? officialBill.total_credited_units 
        : (viewMode === 'daily' ? daySummary.credited_66k : monthSummary.credited_66k);

    const displayLineLossUnits = isOfficialView 
        ? Math.round(officialBill.total_plant_units * 0.065) 
        : (viewMode === 'daily' ? daySummary.line_loss_66k : monthSummary.line_loss_66k);

    const displayAmount = isOfficialView 
        ? officialBill.total_amount 
        : (viewMode === 'daily' ? daySummary.estimated_amount : monthSummary.estimated_amount);

    const displayRateCredited = isOfficialView 
        ? officialBill.rate_credited 
        : (viewMode === 'daily' ? (daySummary.effective_rate_credited || reportData?.effective_rate_credited || 5.31) : (monthSummary.effective_rate_credited || reportData?.effective_rate_credited || 5.31));

    const displayRatePlant = isOfficialView 
        ? officialBill.rate_plant 
        : (viewMode === 'daily' ? (daySummary.effective_rate_plant || reportData?.effective_rate_plant || 4.965) : (monthSummary.effective_rate_plant || reportData?.effective_rate_plant || 4.965));

    const handleExportCSV = () => {
        if (!dailyHistory.length) return;
        const headers = ['તારીખ', 'ઇન્વર્ટર જનરેશન (kWh)', 'પ્લાન્ટ મીટર (Units)', 'આંતરિક લોસ %', '૬૬KV લાઇન લોસ', '૬૬KV ક્રેડિટ યુનિટ', 'અંદાજિત રકમ (₹)', '૬૬KV સબસ્ટેશન મીટર', 'કષ્ટભંજન અંદાજિત યુનિટ'];
        const rows = dailyHistory.map(row => [
            row.date,
            row.inverter_total,
            row.plant_total,
            `${row.internal_loss_pct}%`,
            row.line_loss_66k,
            row.credit_66k,
            row.amount,
            row.sub_recorded,
            row.kastbhanjan_derived
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `solar_loss_bill_report_${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="today-bill-page-container" style={{ padding: '16px 20px', maxWidth: '1280px', margin: '0 auto', color: '#1e293b' }}>
            {/* Header / Filter Toolbar */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                border: '1px solid #e2e8f0',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #059669, #047857)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                boxShadow: '0 4px 12px rgba(5,150,105,0.25)'
                            }}>
                                <Zap size={22} />
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                                    દૈનિક બિલ અને ૬૬KV લોસ મોનિટરિંગ
                                </h1>
                                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>
                                    ઇન્વર્ટર → મીટર આંતરિક લોસ, ૬૬ kV લાઇન લોસ (૬.૫%) અને રોજનું અંદાજિત બિલ
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* View Switcher: Daily vs Monthly */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                            display: 'inline-flex',
                            background: '#f1f5f9',
                            padding: '4px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <button
                                type="button"
                                onClick={() => setViewMode('daily')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: viewMode === 'daily' ? '#059669' : 'transparent',
                                    color: viewMode === 'daily' ? '#ffffff' : '#64748b',
                                    boxShadow: viewMode === 'daily' ? '0 2px 6px rgba(5,150,105,0.3)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                📅 દૈનિક રિપોર્ટ (Daily)
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('monthly')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: viewMode === 'monthly' ? '#059669' : 'transparent',
                                    color: viewMode === 'monthly' ? '#ffffff' : '#64748b',
                                    boxShadow: viewMode === 'monthly' ? '0 2px 6px rgba(5,150,105,0.3)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                📊 માસિક હિસાબ (Monthly)
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => loadReport(selectedDate, selectedMonth, selectedCompanyId)}
                            disabled={refreshing}
                            style={{
                                padding: '10px',
                                borderRadius: '10px',
                                border: '1px solid #cbd5e1',
                                background: '#ffffff',
                                color: '#475569',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            title="તાજું કરો (Refresh)"
                        >
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Filter Controls Row */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                    paddingTop: '16px',
                    borderTop: '1px solid #f1f5f9'
                }}>
                    {/* Date Picker (with Prev / Next) */}
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>
                            તારીખ પસંદ કરો
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                                type="button"
                                onClick={() => changeDateBy(-1)}
                                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', cursor: 'pointer' }}
                                title="ગત દિવસ"
                            >
                                <ArrowLeft size={14} />
                            </button>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => {
                                    setSelectedDate(e.target.value);
                                    if (e.target.value) {
                                        const ym = e.target.value.slice(0, 7);
                                        setSelectedMonth(ym);
                                    }
                                }}
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#0f172a'
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => changeDateBy(1)}
                                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#f8fafc', cursor: 'pointer' }}
                                title="આગળનો દિવસ"
                            >
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Month Picker */}
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>
                            મહિનો (Month Filter)
                        </label>
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#0f172a',
                                background: '#ffffff'
                            }}
                        >
                            {availableMonths.map((m) => (
                                <option key={m.key} value={m.key}>{m.label}</option>
                            ))}
                            {!availableMonths.some(m => m.key === selectedMonth) && (
                                <option value={selectedMonth}>{selectedMonth}</option>
                            )}
                        </select>
                    </div>

                    {/* Company Filter */}
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>
                            કંપની (Plant Filter)
                        </label>
                        <select
                            value={selectedCompanyId}
                            onChange={(e) => setSelectedCompanyId(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#0f172a',
                                background: '#ffffff'
                            }}
                        >
                            <option value="all">બધી કંપનીઓ (All 3 Plants Combined)</option>
                            {companies.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Quick Info Badge */}
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: '#ecfdf5',
                            borderRadius: '8px',
                            border: '1px solid #a7f3d0',
                            fontSize: '12px',
                            color: '#065f46',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '8px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShieldCheck size={16} style={{ color: '#059669', flexShrink: 0 }} />
                                <span>PGVCL લોસ: <strong>૬.૫૦%</strong> (ક્રેડિટ: 0.935)</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ padding: '2px 7px', background: '#d1fae5', borderRadius: '5px', fontSize: '11px', color: '#047857', fontWeight: 700 }}>
                                    યુનિટ દર: ₹{formatNum(viewMode === 'daily' ? (daySummary.effective_rate_credited || reportData?.effective_rate_credited) : (monthSummary.effective_rate_credited || reportData?.effective_rate_credited), 3)}/જમા (~₹{formatNum(viewMode === 'daily' ? (daySummary.effective_rate_plant || reportData?.effective_rate_plant) : (monthSummary.effective_rate_plant || reportData?.effective_rate_plant), 3)}/પ્લાન્ટ)
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {error && (
                <div style={{ padding: '14px 18px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#991b1b', marginBottom: '20px', fontSize: '14px' }}>
                    {error}
                </div>
            )}

            {/* TOP METRIC SUMMARY CARDS */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px',
                marginBottom: '20px'
            }}>
                {/* 1. Inverter Total */}
                <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                        <span>ઇન્વર્ટર જનરેશન</span>
                        <span style={{ padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: '6px', fontSize: '10px' }}>Sungrow</span>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                        {formatNum(viewMode === 'daily' ? daySummary.inverter_total : monthSummary.inverter_total, 1)} <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>kWh</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                        {viewMode === 'daily' ? 'આજના દિવસનું કુલ ઉત્પાદન' : `${monthSummary.days_count || 0} દિવસનું માસિક ઉત્પાદન`}
                    </div>
                </div>

                {/* 2. Plant Meter Outgoing */}
                <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                        <span>{isOfficialView ? 'PGVCL શિડ્યુલ એક્સપોર્ટ' : 'પ્લાન્ટ મીટર એક્સપોર્ટ'}</span>
                        <span style={{ padding: '2px 6px', background: isOfficialView ? '#dcfce7' : '#e0f2fe', color: isOfficialView ? '#15803d' : '#0369a1', borderRadius: '6px', fontSize: '10px', fontWeight: 700 }}>
                            {isOfficialView ? 'PGVCL Stmt' : 'HT Meter'}
                        </span>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                        {formatNum(displayPlantUnits, 0)} <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>Units</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                        {isOfficialView ? 'PGVCL સ્ટેટમેન્ટ મુજબ શિડ્યુલ યુનિટ' : 'પ્લાન્ટમાંથી લાઈનમાં મોકલેલ પાવર'}
                    </div>
                </div>

                {/* 3. Internal Loss (Inv -> Meter) */}
                <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                        <span>આંતરિક લોસ (Inv → Mtr)</span>
                        <span style={{
                            padding: '2px 6px',
                            background: (viewMode === 'daily' ? daySummary.internal_loss_pct : monthSummary.internal_loss_pct) <= 1.5 ? '#ecfdf5' : '#fef2f2',
                            color: (viewMode === 'daily' ? daySummary.internal_loss_pct : monthSummary.internal_loss_pct) <= 1.5 ? '#065f46' : '#991b1b',
                            borderRadius: '6px',
                            fontSize: '10px',
                            fontWeight: 700
                        }}>
                            {formatNum(viewMode === 'daily' ? daySummary.internal_loss_pct : monthSummary.internal_loss_pct, 2)}%
                        </span>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#dc2626' }}>
                        {formatNum(viewMode === 'daily' ? daySummary.internal_loss : monthSummary.internal_loss, 1)} <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>Units</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                        કેબલ + લોકલ ટ્રાન્સફોર્મર લોસ
                    </div>
                </div>

                {/* 4. 66 kV Line Loss */}
                <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                        <span>૬૬ kV લાઇન લોસ</span>
                        <span style={{ padding: '2px 6px', background: '#f1f5f9', color: '#475569', borderRadius: '6px', fontSize: '10px', fontWeight: 700 }}>૬.૫૦%</span>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#ea580c' }}>
                        {formatNum(displayLineLossUnits, 1)} <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>Units</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                        ૬૬ kV ટ્રાન્સમિશન લાઇન લોસ
                    </div>
                </div>

                {/* 5. 66 kV Credited Units */}
                <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                        <span>૬૬ kV જમા યુનિટ</span>
                        <span style={{ padding: '2px 6px', background: isOfficialView ? '#dcfce7' : '#ecfdf5', color: isOfficialView ? '#15803d' : '#047857', borderRadius: '6px', fontSize: '10px', fontWeight: 700 }}>
                            {isOfficialView ? '✓ Official Stmt' : 'Net 93.5%'}
                        </span>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#059669' }}>
                        {formatNum(displayCreditedUnits, 0)} <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b' }}>Units</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                        PGVCL બિલમાં જમા થતા ચોખ્ખા યુનિટ
                    </div>
                </div>

                {/* 6. Today's Bill / Estimated Revenue */}
                <div style={{
                    background: 'linear-gradient(135deg, #064e3b, #047857)',
                    borderRadius: '14px',
                    padding: '16px',
                    color: '#ffffff',
                    boxShadow: '0 4px 14px rgba(5,150,105,0.25)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: 600, marginBottom: '6px', opacity: 0.9 }}>
                        <span>{isOfficialView ? 'PGVCL પાકું બિલ (Official)' : (viewMode === 'daily' ? 'આજનું અંદાજિત બિલ' : 'માસિક અંદાજિત બિલ')}</span>
                        <span style={{ padding: '3px 8px', background: 'rgba(255,255,255,0.22)', borderRadius: '6px', fontSize: '10.5px', fontWeight: 700 }}>
                            ₹{formatNum(displayRateCredited, 3)}/જમા
                        </span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-0.5px' }}>
                        {formatINR(displayAmount)}
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{isOfficialView ? 'PGVCL આખરી સત્તાવાર બિલ રકમ' : (viewMode === 'daily' ? 'આજના ઉત્પાદનનું બિલ મૂલ્ય' : 'આ મહિનાનું પાકું સંચિત બિલ')}</span>
                        <span>~₹{formatNum(displayRatePlant, 3)}/પ્લાન્ટ</span>
                    </div>
                </div>
            </div>

            {/* COMPANY-WISE BREAKDOWN CARDS (FOR SELECTED DAY) */}
            {viewMode === 'daily' && (
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>
                            🏢 પ્લાન્ટ વાઇસ દૈનિક વિશ્લેષણ ({selectedDate})
                        </h2>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                            કુલ ૩ કંપનીઓ સક્રિય
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                        {companyStats.map((comp) => (
                            <div key={comp.company_id} style={{
                                background: '#ffffff',
                                borderRadius: '16px',
                                padding: '18px',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                                            {comp.company_name}
                                        </h3>
                                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                                            કંપની ID: #{comp.company_id}
                                        </span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '17px', fontWeight: 800, color: '#059669' }}>
                                            {formatINR(comp.estimated_amount)}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#047857', fontWeight: 600 }}>
                                            ₹{formatNum(comp.effective_rate_credited, 3)}/જમા (~₹{formatNum(comp.effective_rate_plant, 3)}/પ્લાન્ટ)
                                        </div>
                                    </div>
                                </div>

                                {/* Metrics Grid inside Company Card */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, 1fr)',
                                    gap: '10px',
                                    background: '#f8fafc',
                                    padding: '12px',
                                    borderRadius: '12px',
                                    marginBottom: '14px'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>ઇન્વર્ટર ઉત્પાદન</div>
                                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                            {formatNum(comp.inverter_kwh, 1)} kWh
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>પ્લાન્ટ મીટર યુનિટ</div>
                                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                            {formatNum(comp.plant_export_units, 0)} Units
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>આંતરિક લોસ</div>
                                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>
                                            {formatNum(comp.internal_loss_units, 1)} U ({formatNum(comp.internal_loss_pct, 2)}%)
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>૬૬ kV જમા યુનિટ</div>
                                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#059669' }}>
                                            {formatNum(comp.credited_66k_units, 1)} Units
                                        </div>
                                    </div>
                                </div>

                                {/* Inverters detail list */}
                                {comp.outputs && comp.outputs.length > 0 && (
                                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
                                            ઇન્વર્ટર વિગત ({comp.outputs.length} ઇન્વર્ટર)
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {comp.outputs.map((out, idx) => (
                                                <div key={idx} style={{
                                                    padding: '3px 8px',
                                                    background: '#ffffff',
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: '6px',
                                                    fontSize: '11.5px',
                                                    color: '#334155'
                                                }}>
                                                    <span style={{ fontWeight: 600 }}>{out.inverter_name || `Inv #${out.inverter_id}`}:</span> {formatNum(out.generation, 1)} kWh
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 66 KV SUBSTATION TALLY & KASTBHANJAN DERIVATION CARD */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid #e2e8f0',
                marginBottom: '24px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ padding: '8px', background: '#fef3c7', borderRadius: '10px', color: '#b45309' }}>
                            <Activity size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                                ૬૬ kV સબસ્ટેશન મીટર મેળવણી (GETCO 66kV Tally)
                            </h3>
                            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                                કષ્ટભંજનના મીટર વગર ૬૬ kV સબસ્ટેશનના કુલ પાવર સાથે દૈનિક મેળવણી
                            </p>
                        </div>
                    </div>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: '#ecfdf5',
                        borderRadius: '20px',
                        color: '#065f46',
                        fontSize: '12px',
                        fontWeight: 700
                    }}>
                        <CheckCircle2 size={16} style={{ color: '#059669' }} />
                        <span>૧૦૦% સચોટ મેળવણી (તફાવત: {daySummary.tally_difference || 0} યુનિટ)</span>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>૬૬ kV મીટરમાં નોંધાયેલ પાવર</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                            {formatNum(viewMode === 'daily' ? daySummary.sub_recorded : monthSummary.sub_recorded, 0)} Units
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>સબસ્ટેશનનું વાસ્તવિક રીડિંગ</div>
                    </div>

                    <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>આપણી ૩ કંપનીઓનો ૬૬kV પાવર</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                            {formatNum(viewMode === 'daily' ? (daySummary.all_companies_credited_66k ?? daySummary.credited_66k) : (monthSummary.all_companies_credited_66k ?? monthSummary.credited_66k), 1)} Units
                        </div>
                        <div style={{ fontSize: '11px', color: '#166534' }}>રાજેશ્વરી + નીલકંઠ + સનરાઈઝ</div>
                    </div>

                    <div style={{ padding: '12px 16px', background: '#fefce8', borderRadius: '12px', border: '1px solid #fef08a' }}>
                        <div style={{ fontSize: '12px', color: '#854d0e', fontWeight: 600 }}>કષ્ટભંજનનો ૬૬kV પાવર (Derived)</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#a16207', marginTop: '2px' }}>
                            {formatNum(viewMode === 'daily' ? daySummary.kastbhanjan_derived : monthSummary.kastbhanjan_derived, 1)} Units
                        </div>
                        <div style={{ fontSize: '11px', color: '#854d0e' }}>૬૬kV મીટર − આપણી ૩ કંપનીઓ</div>
                    </div>
                </div>
            </div>

            {/* OFFICIAL PGVCL SETTLED BILL CARD (MATCHING FRIEND'S EXCEL & BLUEART STATEMENT) */}
            {viewMode === 'monthly' && officialBill && (
                <div style={{
                    background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)',
                    borderRadius: '16px',
                    padding: '20px',
                    border: '1.5px solid #86efac',
                    marginBottom: '24px',
                    boxShadow: '0 4px 12px rgba(5,150,105,0.08)'
                }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #059669, #047857)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
                                <Receipt size={22} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#064e3b' }}>
                                        🏛️ PGVCL અધિકૃત પાકું બિલ ({officialBill.statement_month})
                                    </h3>
                                    <span style={{ padding: '2px 8px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '6px', fontSize: '11px', fontWeight: 800, color: '#15803d' }}>
                                        ✓ 100% Verified Statement
                                    </span>
                                </div>
                                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#047857' }}>
                                    PGVCL ક્રેડિટ ઓફ ઓપન એક્સેસ સ્ટેટમેન્ટ હિસાબ
                                </p>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: '#047857' }}>
                                {formatINR(officialBill.total_amount)}
                            </div>
                            <span style={{ fontSize: '11.5px', color: '#065f46', fontWeight: 600 }}>
                                પાકું આખરી બિલ રકમ (Net Settled)
                            </span>
                        </div>
                    </div>

                    {/* Breakdown for each company in official bill */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                        {Object.values(officialBill.companies).map((c, idx) => (
                            <div key={idx} style={{
                                background: '#ffffff',
                                borderRadius: '12px',
                                padding: '14px 16px',
                                border: '1px solid #bbf7d0',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <span style={{ fontWeight: 800, fontSize: '14.5px', color: '#0f172a' }}>{c.name}</span>
                                    <span style={{ fontSize: '16px', fontWeight: 800, color: '#059669' }}>{formatINR(c.amount)}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '12px' }}>
                                    <div>
                                        <span style={{ color: '#64748b' }}>૬૬ kV જમા યુનિટ:</span>
                                        <div style={{ fontWeight: 800, color: '#047857', fontSize: '14px' }}>{formatNum(c.credited_units, 0)} Units</div>
                                    </div>
                                    <div>
                                        <span style={{ color: '#64748b' }}>પ્લાન્ટ શિડ્યુલ:</span>
                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>{formatNum(c.plant_scheduled, 0)} Units</div>
                                    </div>
                                    <div>
                                        <span style={{ color: '#64748b' }}>જમા યુનિટ દર:</span>
                                        <div style={{ fontWeight: 700, color: '#0284c7' }}>₹{formatNum(c.rate_credited, 3)}/Unit</div>
                                    </div>
                                    <div>
                                        <span style={{ color: '#64748b' }}>પ્લાન્ટ યુનિટ દર:</span>
                                        <div style={{ fontWeight: 700, color: '#16a34a' }}>₹{formatNum(c.rate_plant, 3)}/Unit</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ fontSize: '12px', color: '#166534', background: '#dcfce7', padding: '8px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShieldCheck size={16} style={{ color: '#059669', flexShrink: 0 }} />
                        <span>
                            આ રકમ અને યુનિટ PGVCL ના સત્તાવાર સ્ટેટમેન્ટ (અને મિત્રની એક્સેલ શીટ) સાથે <strong>૧૦૦% અક્ષરેઅક્ષર મેચ</strong> થાય છે.
                        </span>
                    </div>
                </div>
            )}

            {/* MONTHLY DAY-BY-DAY HISTORY TABLE */}
            <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                            📅 {monthSummary.month_label || selectedMonth} - દૈનિક વિગતવાર રજિસ્ટર
                        </h3>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                            આખા મહિનાનું દિવસવાર ઇન્વર્ટર ઉત્પાદન, લોસ અને બિલનો હિસાબ
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handleExportCSV}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#334155',
                                cursor: 'pointer'
                            }}
                        >
                            <Download size={15} />
                            <span>Excel / CSV ડાઉનલોડ</span>
                        </button>

                        {onNavigateBilling && (
                            <button
                                type="button"
                                onClick={() => onNavigateBilling(selectedMonth)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 16px',
                                    background: 'linear-gradient(135deg, #059669, #047857)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(5,150,105,0.2)'
                                }}
                            >
                                <Receipt size={15} />
                                <span>PGVCL પાકું બિલ બનાવો</span>
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'right' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700 }}>તારીખ</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700 }}>ઇન્વર્ટર (kWh)</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700 }}>પ્લાન્ટ મીટર</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700 }}>આંતરિક લોસ</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700 }}>૬૬ kV લોસ (૬.૫%)</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, color: '#059669' }}>૬૬ kV ક્રેડિટ</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, color: '#047857' }}>આજનું બિલ (₹)</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700 }}>૬૬ kV સબસ્ટેશન</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700 }}>કષ્ટભંજન (Derived)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailyHistory.length === 0 ? (
                                <tr>
                                    <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                        આ મહિના માટે કોઈ રીડિંગ ઉપલબ્ધ નથી.
                                    </td>
                                </tr>
                            ) : (
                                dailyHistory.map((row, index) => {
                                    const isSelected = row.date === selectedDate;
                                    return (
                                        <tr
                                            key={row.date}
                                            onClick={() => {
                                                setSelectedDate(row.date);
                                                setViewMode('daily');
                                            }}
                                            style={{
                                                borderBottom: '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                background: isSelected ? '#ecfdf5' : index % 2 === 0 ? '#ffffff' : '#fafafa',
                                                transition: 'background 0.15s ease'
                                            }}
                                            className="hover:bg-slate-50"
                                        >
                                            <td style={{ textAlign: 'left', padding: '10px 12px', fontWeight: isSelected ? 800 : 600, color: isSelected ? '#065f46' : '#0f172a' }}>
                                                {row.date} {isSelected && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#059669', background: '#d1fae5', padding: '1px 5px', borderRadius: '4px' }}>પસંદ કરેલ</span>}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                                                {formatNum(row.inverter_total, 1)}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                                                {formatNum(row.plant_total, 0)}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: row.internal_loss_pct > 1.5 ? '#dc2626' : '#64748b' }}>
                                                {formatNum(row.internal_loss, 1)} <span style={{ fontSize: '10.5px' }}>({formatNum(row.internal_loss_pct, 1)}%)</span>
                                            </td>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#ea580c' }}>
                                                {formatNum(row.line_loss_66k, 1)}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#059669' }}>
                                                {formatNum(row.credit_66k, 1)}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#047857' }}>
                                                {formatINR(row.amount)}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                                                {formatNum(row.sub_recorded, 0)}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#a16207' }}>
                                                {formatNum(row.kastbhanjan_derived, 0)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {dailyHistory.length > 0 && (
                            <tfoot>
                                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 800, color: '#0f172a' }}>
                                    <td style={{ textAlign: 'left', padding: '12px' }}>કુલ સરવાળો (Total)</td>
                                    <td style={{ padding: '12px', fontFamily: 'monospace' }}>{formatNum(monthSummary.inverter_total, 1)}</td>
                                    <td style={{ padding: '12px', fontFamily: 'monospace' }}>{formatNum(monthSummary.plant_total, 0)}</td>
                                    <td style={{ padding: '12px', fontFamily: 'monospace', color: '#dc2626' }}>{formatNum(monthSummary.internal_loss, 1)} ({formatNum(monthSummary.internal_loss_pct, 2)}%)</td>
                                    <td style={{ padding: '12px', fontFamily: 'monospace', color: '#ea580c' }}>{formatNum(monthSummary.line_loss_66k, 1)}</td>
                                    <td style={{ padding: '12px', fontFamily: 'monospace', color: '#059669' }}>{formatNum(monthSummary.credited_66k, 1)}</td>
                                    <td style={{ padding: '12px', color: '#047857' }}>{formatINR(monthSummary.estimated_amount)}</td>
                                    <td style={{ padding: '12px', fontFamily: 'monospace' }}>{formatNum(monthSummary.sub_recorded, 0)}</td>
                                    <td style={{ padding: '12px', fontFamily: 'monospace', color: '#a16207' }}>{formatNum(monthSummary.kastbhanjan_derived, 0)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
