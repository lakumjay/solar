/* SolarFlow Billing — calculation engine (config-driven, zero-safe).
 * Method verified against Blueart Granito.pdf Aug-26 & Sep-26 statements.
 */

const EPS = 1e-9;

export function num(v, d = 0) {
    v = parseFloat(v);
    return isFinite(v) ? v : d;
}

export function safeDiv(a, b) {
    a = num(a);
    b = num(b);
    return Math.abs(b) < EPS ? 0 : a / b;
}

export function round2(v) {
    return Math.round(num(v) * 100) / 100;
}

/* Derive per-unit rates from the PGVCL statement CREDIT OF OPEN ACCESS column.
 * stmt: {unit, energyAmt, fcaAmt, pfAmt, ehvAmt, touAmt, totalPeak, varAmt, boardAmt, dutyAmt}
 * All amounts are the statement CREDIT column values (positive numbers; rebates entered positive). */
export function deriveRates(stmt = {}) {
    const unit = num(stmt.unit);
    const energyAmt = num(stmt.energyAmt);
    const fcaAmt = num(stmt.fcaAmt);

    return {
        energyRate: safeDiv(energyAmt, unit),
        fcaRate: safeDiv(fcaAmt, unit),
        pfPct: safeDiv(num(stmt.pfAmt), energyAmt) * 100,
        ehvPct: safeDiv(num(stmt.ehvAmt), energyAmt) * 100,
        touRate: safeDiv(num(stmt.touAmt), num(stmt.totalPeak)),
        varPct: safeDiv(num(stmt.varAmt), energyAmt + fcaAmt) * 100,
        dutyPct: safeDiv(num(stmt.dutyAmt), num(stmt.boardAmt)) * 100
    };
}

/* Company share of the bill.
 * units: {credited, peak, banking, generated} (generated optional -> derived)
 * rates: output of deriveRates
 * extra: {lossPct, crossPct, wheelRate, bankRate}
 * cfg: {discount} (Rs per unit, per company PPA)
 * Returns full breakdown + warnings array. */
export function companyBill(units = {}, rates = {}, extra = {}, cfg = {}) {
    const warnings = [];
    const credited = num(units.credited);
    const peak = num(units.peak);
    const banking = num(units.banking);
    const lossPct = num(extra.lossPct);
    const discount = num(cfg.discount);

    if (credited <= 0) {
        warnings.push('Credited unit 0 કે ખાલી છે — ગણતરી નહીં થાય.');
    }

    let generated = num(units.generated);
    if (generated <= 0 && credited > 0) {
        generated = safeDiv(credited, 1 - lossPct / 100);
        if (generated <= 0) {
            warnings.push('Generated unit કાઢી શકાયું નહીં (Loss% તપાસો).');
        }
    }

    const energy = credited * num(rates.energyRate);
    const fca = credited * num(rates.fcaRate);
    const pf = energy * num(rates.pfPct) / 100;
    const ehv = energy * num(rates.ehvPct) / 100;
    const tou = peak * num(rates.touRate);
    const vari = (energy + fca) * num(rates.varPct) / 100;
    const board = energy + fca - pf - ehv + tou + vari;
    const duty = board * num(rates.dutyPct) / 100;
    const total = board + duty;
    const cross = (energy + fca) * num(extra.crossPct) / 100;
    const wheel = generated * num(extra.wheelRate);
    const bankChg = banking * num(extra.bankRate);
    const net = total - cross - wheel - bankChg;
    const billRate = safeDiv(net, credited);
    const netRate = billRate - discount;
    const discountAmt = credited * discount;
    const rawGrand = net - discountAmt;
    const grand = Math.round(rawGrand);
    const roundOff = round2(grand - rawGrand);

    const minRate = num(opts?.min_bill_rate || extra?.min_bill_rate) || 6.0;
    const maxRate = num(opts?.max_bill_rate || extra?.max_bill_rate) || 7.2;

    if (billRate > 0 && (billRate < minRate || billRate > maxRate)) {
        warnings.push(`Bill Rate ${billRate.toFixed(2)} — ${minRate.toFixed(1)}-${maxRate.toFixed(1)} ની આસપાસ હોવો જોઈએ; રેટ તપાસો.`);
    }

    return {
        generated: round2(generated),
        energy: round2(energy),
        fca: round2(fca),
        pf: round2(pf),
        ehv: round2(ehv),
        tou: round2(tou),
        variable: round2(vari),
        board: round2(board),
        duty: round2(duty),
        total: round2(total),
        cross: round2(cross),
        wheeling: round2(wheel),
        banking: round2(bankChg),
        net: round2(net),
        billRate: billRate,
        netRate: netRate,
        discountAmt: round2(discountAmt),
        roundOff: roundOff,
        grand: grand,
        warnings: warnings
    };
}

/* Interest on pending amount. pct = annual %, days = overdue days. */
export function computeInterest(pending, daysOverdue, pct) {
    pending = num(pending);
    daysOverdue = num(daysOverdue);
    pct = num(pct);
    if (pending <= 0 || daysOverdue <= 0 || pct <= 0) return 0;
    return round2(pending * (pct / 100) * (daysOverdue / 365));
}

/* Pre-send checks: returns [{ok, text}]. */
export function runChecks(bill, stmt = {}, othersSum = 0, options = {}) {
    const out = [];

    // 1: wheeling split sums to statement total (when statement wheeling is provided)
    const stmtWheel = num(stmt.wheelingAmt);
    if (stmtWheel > 0) {
        const mine = bill.wheeling + num(othersSum);
        out.push({
            ok: Math.abs(mine - stmtWheel) < 2,
            text: `Wheeling check: મારી + બીજી કંપની = ${mine.toFixed(0)} vs સ્ટેટમેન્ટ ${stmtWheel.toFixed(0)}`
        });
    }

    // 2: bill rate sane (configurable threshold from settings)
    const minRate = num(options.min_bill_rate) || 6.0;
    const maxRate = num(options.max_bill_rate) || 7.2;
    out.push({
        ok: bill.billRate >= minRate && bill.billRate <= maxRate,
        text: `Bill Rate ${bill.billRate.toFixed(5)} (${minRate.toFixed(1)} થી ${maxRate.toFixed(1)} ની વચ્ચે હોવો જોઈએ)`
    });

    // 3: grand/generated ratio + roundoff
    const ratio = safeDiv(bill.grand, bill.generated);
    out.push({
        ok: ratio > 4.5 && ratio < 5.5 && Math.abs(bill.roundOff) <= 2,
        text: `Grand/Generated = ${ratio.toFixed(2)} (~4.96), Round-off ${bill.roundOff.toFixed(2)}`
    });

    return out;
}

/* Next invoice no for a company: prefix + '/' + fy + '/' + zero-padded seq. */
export function nextInvoiceNo(company, fy) {
    const seq = num(company.lastSeq || company.last_seq) + 1;
    let s = String(seq);
    while (s.length < 2) s = '0' + s;
    return (company.invPrefix || company.inv_prefix || 'RS') + '/' + fy + '/' + s;
}

/* Indian financial year from date string (Apr-Mar) */
export function fyOf(dstr) {
    const d = new Date(dstr || Date.now());
    const y = d.getFullYear();
    const m = d.getMonth(); // 0-indexed: 3 is April
    return m >= 3 ? String(y).slice(2) + '-' + String(y + 1).slice(2) : String(y - 1).slice(2) + '-' + String(y).slice(2);
}

/* Number to words (Indian numbering system: Crore, Lakh, Thousand) */
export function numberToWords(n) {
    n = Math.round(num(n));
    if (n === 0) return 'Zero';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function two(d) {
        return d < 20 ? ones[d] : tens[Math.floor(d / 10)] + (d % 10 ? ' ' + ones[d % 10] : '');
    }

    function three(d) {
        const h = Math.floor(d / 100);
        const r = d % 100;
        let s = '';
        if (h) s += ones[h] + ' Hundred';
        if (r) s += (s ? ' ' : '') + two(r);
        return s;
    }

    let out = '';
    const cr = Math.floor(n / 1e7);
    n %= 1e7;
    const lk = Math.floor(n / 1e5);
    n %= 1e5;
    const th = Math.floor(n / 1e3);
    n %= 1e3;

    if (cr) out += three(cr) + ' Crore ';
    if (lk) out += two(lk) + ' Lakh ';
    if (th) out += two(th) + ' Thousand ';
    if (n) out += three(n);

    return out.trim() + ' Only';
}

/* Indian Rupee string formatting */
export function inr(v) {
    const isNeg = num(v) < 0;
    let s = Math.abs(Math.round(num(v))).toString();
    let out = '';
    if (s.length > 3) {
        out = ',' + s.slice(-3);
        s = s.slice(0, -3);
    }
    while (s.length > 2) {
        out = ',' + s.slice(-2) + out;
        s = s.slice(0, -2);
    }
    return (isNeg ? '-' : '') + s + out;
}

const BillingEngine = {
    deriveRates,
    companyBill,
    computeInterest,
    runChecks,
    nextInvoiceNo,
    fyOf,
    numberToWords,
    inr,
    safeDiv,
    round2,
    num
};

export default BillingEngine;
