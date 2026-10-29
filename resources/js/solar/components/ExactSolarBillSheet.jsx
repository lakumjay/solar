import React from 'react';
import { numberToWords } from '../utils/billingEngine';

// Indian Rupee formatting with exactly 2 decimal places e.g. 6,93,920.00
export function inr2(v) {
    const val = Number(v) || 0;
    const isNeg = val < 0;
    const absVal = Math.abs(val);
    const parts = absVal.toFixed(2).split('.');
    let s = parts[0];
    let out = '';
    if (s.length > 3) {
        out = ',' + s.slice(-3);
        s = s.slice(0, -3);
    }
    while (s.length > 2) {
        out = ',' + s.slice(-2) + out;
        s = s.slice(0, -2);
    }
    return (isNeg ? '-' : '') + (s || '0') + out + '.' + parts[1];
}

// Indian Rupee formatting without decimal places for units e.g. 105,715
export function inrUnits(v) {
    const val = Number(v) || 0;
    const isNeg = val < 0;
    let s = Math.abs(Math.round(val)).toString();
    let out = '';
    if (s.length > 3) {
        out = ',' + s.slice(-3);
        s = s.slice(0, -3);
    }
    while (s.length > 2) {
        out = ',' + s.slice(-2) + out;
        s = s.slice(0, -2);
    }
    return (isNeg ? '-' : '') + (s || '0') + out;
}

// Date formatting to DD/MM/YYYY
export function formatDDMMYYYY(d) {
    if (!d) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d;
    const m = String(d).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
        return m[3].padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/' + m[1];
    }
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    return day + '/' + month + '/' + year;
}

// Title Case helper
function toTitleCase(str = '') {
    return str
        .toLowerCase()
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/**
 * ExactSolarBillSheet
 * Pixel-accurate implementation matching Rajeshwari-Solar-Bill.pdf official format.
 */
export default function ExactSolarBillSheet({
    company = {},
    customer = {},
    invoiceNo = '',
    invoiceDate = '',
    dueDate = '',
    month = '',
    units = 0,
    billRate = 0,
    netRate = 0,
    subTotal = 0,
    discountRate = 1.25,
    discountAmt = 0,
    prevBal = 0,
    prevInvoiceNo = '',
    interest = 0,
    interestDays = 0,
    interestPct = 18,
    interestWaived = 0,
    roundOff = 0,
    totalOut = 0,
    note = '',
    settings = {},
    lang = 'gu'
}) {
    const co = company || {};
    const cust = customer || {};
    const sets = settings || {};

    // Brand title split for top-right logo (e.g. "RAJESHWARI" [Green] & "SOLAR" [Orange])
    const compName = co.name || 'RAJESHWARI SOLAR';
    const words = compName.trim().split(/\s+/);
    let brandPart1 = words[0] || 'RAJESHWARI';
    let brandPart2 = words.slice(1).join(' ') || 'SOLAR';

    // Bank Detail display
    const isSunrise = co.name?.toUpperCase().includes('SUNRISE') || (co.logo_path && co.logo_path.includes('sunrise'));
    const bankAccountHolder = toTitleCase(compName);
    const bankNameOnly = (co.bank_name || 'State Bank of India').split(',')[0].trim();
    const bankAc = co.bank_ac || (isSunrise ? '44588738053' : '44295348601');
    const bankIfsc = co.bank_ifsc || 'SBIN0005946';
    const compGstin = co.gstin || (isSunrise ? '24FFNPP9576P1Z4' : '24ABJFR7554G1ZX');

    // Customer fields
    const custName = cust.name || 'Blueart Granito Pvt. Ltd.';
    const custAddress = cust.address || 'S. NO. 93/1P3, B/H. KEDA CERAMIC, PANELI ROAD,\nTAL. MORBI, JAMBUDIYA\nMorbi - 363642';
    const custGstin = cust.gst || cust.gstin || '24AABCO3285B1ZU';
    const placeOfSupply = cust.placeOfSupply || (custGstin && custGstin.startsWith('24') ? '24-Gujarat' : '24-Gujarat');

    // Financial numbers
    const numUnits = Number(units) || 0;
    const numBillRate = Number(billRate) || 0;
    const numNetRate = Number(netRate) || 0;
    const numSubTotal = Number(subTotal) || 0;
    const numDiscount = Number(discountAmt) || 0;
    const numPrevBal = Number(prevBal) || 0;
    const numInterest = Number(interest) || 0;
    const numInterestWaived = Number(interestWaived) || 0;
    const netAppliedInterest = Math.max(0, numInterest - numInterestWaived);

    // Round Current Bill Amt to integer so it matches Grand Total consistently
    const currentBillAmt = Math.round(Math.max(0, numSubTotal - numDiscount));
    const numTotalOut = Number(totalOut) || Math.round(currentBillAmt + numPrevBal + netAppliedInterest + Number(roundOff));

    // Signature path with ON/OFF toggle check
    const isCoSigEnabled = co.signature_enabled !== false;
    const isGlobalSigEnabled = sets.signature_enabled !== false && sets.signature_enabled !== '0';
    const signatureSrc = (co.signature_path && isCoSigEnabled)
        ? co.signature_path
        : (!co.signature_path && sets.signature_url && isGlobalSigEnabled ? sets.signature_url : null);

    return (
        <div className="printable-bill-sheet">
            {/* Top Brand Header (Outside the frame, or 52mm margin if pre-printed) */}
            {co.letterhead_mode === 'preprinted' ? (
                <div className="sheet-preprinted-margin" style={{ height: '52mm' }}>
                    <div className="preprinted-hint-banner no-print">
                        {lang === 'en'
                            ? '⬆ 52mm Blank Margin for Pre-printed Letterhead Paper'
                            : '⬆ પ્રી-પ્રિન્ટેડ લેટરપેડ માટે 52mm ખાલી જગ્યા (પ્રિન્ટમાં નહીં આવે)'}
                    </div>
                </div>
            ) : co.letterhead_mode === 'custom_image' && (co.letterhead_path || co.letterhead_url) ? (
                <div className="sheet-letterhead-banner">
                    <img src={co.letterhead_path || co.letterhead_url} alt="Company Letterhead" />
                </div>
            ) : (
                <div className="exact-bill-brand-top">
                    {co.logo_path && (co.logo_path.includes('sunrise') || co.name?.toUpperCase().includes('SUNRISE')) ? (
                        <div className="exact-bill-brand-wrap sunrise-banner">
                            <img
                                src={co.logo_path || '/images/companies/sunrise-logo.png'}
                                alt={compName}
                                className="exact-bill-logo-banner"
                                style={{ height: '48px', width: 'auto', objectFit: 'contain' }}
                            />
                        </div>
                    ) : (
                        <div className="exact-bill-brand-wrap">
                            {co.logo_path ? (
                                <img src={co.logo_path} alt="Logo" className="exact-bill-logo" />
                            ) : (
                                <img src="/images/companies/rajeshwari-logo.png" alt="Logo" className="exact-bill-logo" />
                            )}
                            <div className="exact-bill-logo-bar" />
                            <div className="exact-bill-brand-text">
                                <span className="brand-title-green">{brandPart1}</span>
                                <span className="brand-title-orange">{brandPart2}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Official Document Outer Frame */}
            <div className="exact-bill-frame">
                {/* 1. Sub Header Bar: Debit Memo | BILL OF SUPPLY | Original */}
                <div className="exact-bill-sub-header">
                    <span>Debit Memo</span>
                    <span className="bill-title">BILL OF SUPPLY</span>
                    <span>Original</span>
                </div>

                {/* 2. Party & Invoice Row */}
                <div className="exact-bill-party-row">
                    <div className="exact-bill-party-left">
                        <div><strong>M/s. : {custName}</strong></div>
                        <div className="exact-cust-address">
                            {custAddress.split('\n').map((line, li) => (
                                <div key={li}>{line}</div>
                            ))}
                        </div>
                        <div>Place of Supply : {placeOfSupply}</div>
                        <div>GSTIN No. : {custGstin}</div>
                    </div>
                    <div className="exact-bill-party-right">
                        <table className="exact-bill-party-meta">
                            <tbody>
                                <tr>
                                    <td style={{ width: '85px' }}><strong>Invoice No.</strong></td>
                                    <td style={{ width: '12px' }}>:</td>
                                    <td><strong>{invoiceNo}</strong></td>
                                </tr>
                                <tr>
                                    <td><strong>Date</strong></td>
                                    <td>:</td>
                                    <td><strong>{formatDDMMYYYY(invoiceDate)}</strong></td>
                                </tr>
                                {dueDate && (
                                    <tr>
                                        <td><strong>Due Date</strong></td>
                                        <td>:</td>
                                        <td><strong>{formatDDMMYYYY(dueDate)}</strong></td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 3. Products / Items Table with 7 Columns */}
                <table className="exact-bill-items-table">
                    <thead>
                        <tr>
                            <th className="col-sr">SrNo</th>
                            <th className="col-name">Product Name</th>
                            <th className="col-hsn">HSN/SAC</th>
                            <th className="col-unit">Unit</th>
                            <th className="col-rate">Rate</th>
                            <th className="col-netrate">Net Rate</th>
                            <th className="col-amt">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="col-sr">1</td>
                            <td className="col-name">Solar Power Generation {month}</td>
                            <td className="col-hsn">2716</td>
                            <td className="col-unit">{inrUnits(numUnits)}</td>
                            <td className="col-rate" title={numBillRate.toFixed(5)}>{numBillRate.toFixed(2)}</td>
                            <td className="col-netrate" title={numNetRate.toFixed(5)}>{numNetRate.toFixed(2)}</td>
                            <td className="col-amt">{inr2(numSubTotal)}</td>
                        </tr>
                        {/* Filler row: vertical lines span the empty document space */}
                        <tr className="exact-bill-filler-row">
                            <td className="col-sr">&nbsp;</td>
                            <td className="col-name">&nbsp;</td>
                            <td className="col-hsn">&nbsp;</td>
                            <td className="col-unit">&nbsp;</td>
                            <td className="col-rate">&nbsp;</td>
                            <td className="col-netrate">&nbsp;</td>
                            <td className="col-amt">&nbsp;</td>
                        </tr>
                    </tbody>
                </table>

                {/* 4. GSTIN No. & Sub Total Row */}
                <div className="exact-bill-subtotal-row">
                    <div className="exact-bill-subtotal-gstin">
                        GSTIN No.: {compGstin}
                    </div>
                    <div className="exact-bill-subtotal-label">
                        Sub Total
                    </div>
                    <div className="exact-bill-subtotal-amt">
                        {inr2(numSubTotal)}
                    </div>
                </div>

                {/* 5. 3-Box Financial Grid: Bank Details | Balances | Discount */}
                <div className="exact-bill-settle-grid">
                    <div className="exact-bill-settle-bank">
                        <div>Bank Detail : {bankAccountHolder}</div>
                        <div>Bank Name : {bankNameOnly}</div>
                        <div>Bank A/c. No. : {bankAc}</div>
                        <div>RTGS/IFSC Code : {bankIfsc}</div>
                    </div>
                    <div className="exact-bill-settle-balances">
                        <div className="exact-kv-row">
                            <span>Previous Bal.{prevInvoiceNo ? ` (Inv ${prevInvoiceNo})` : ''}</span>
                            <span>{inr2(numPrevBal)}</span>
                        </div>
                        <div className="exact-kv-row">
                            <span>Current Bill Amt</span>
                            <span>{inr2(currentBillAmt)}</span>
                        </div>
                        {netAppliedInterest > 0 && (
                            <div className="exact-kv-row">
                                <span>Interest ({interestPct}% {interestDays ? `${interestDays}d` : ''})</span>
                                <span>{inr2(netAppliedInterest)}</span>
                            </div>
                        )}
                        <div className="exact-kv-row bold">
                            <strong>Total Outstanding</strong>
                            <strong>{inr2(numTotalOut)}</strong>
                        </div>
                    </div>
                    <div className="exact-bill-settle-discount">
                        <div className="exact-kv-row">
                            <span>Discount {Number(discountRate) ? `(× ₹${Number(discountRate)})` : ''}</span>
                            <span>{inr2(numDiscount)}</span>
                        </div>
                    </div>
                </div>

                {/* 6. Bill Amount in Words & Round Off */}
                <div className="exact-bill-words-row">
                    <div className="exact-bill-words-left">
                        Bill Amount : <strong>{numberToWords(numTotalOut)}</strong>
                    </div>
                    <div className="exact-bill-round-right">
                        <div className="exact-kv-row">
                            <span>Round Off</span>
                            <span>{Number(roundOff) >= 0 ? `+${Number(roundOff).toFixed(2)}` : Number(roundOff).toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* 7. Note & Grand Total (Highlighted Row) */}
                <div className="exact-bill-note-row">
                    <div className="exact-bill-note-left">
                        Note : {note || ''}
                    </div>
                    <div className="exact-bill-grand-right">
                        <div className="exact-kv-row bold">
                            <strong>Grand Total</strong>
                            <strong>{inr2(numTotalOut)}</strong>
                        </div>
                    </div>
                </div>

                {/* 8. Terms & Conditions and Authorised Signatory */}
                <div className="exact-bill-footer-row">
                    <div className="exact-bill-terms-left">
                        <strong>Terms &amp; Condition :</strong>
                        <div>1. Interest @{interestPct}% p.a. will be charged if payment is not made within due date.</div>
                        <div>2. &quot;Subject to &apos;BOTAD&apos; Jurisdiction only. E.&amp;O.E.&quot;</div>
                    </div>
                    <div className="exact-bill-sign-right">
                        <div><strong>For, {compName}</strong></div>
                        <div className="exact-bill-sign-img-wrap">
                            {signatureSrc ? (
                                <img src={signatureSrc} alt="Signature" className="exact-bill-sig-img" />
                            ) : null}
                        </div>
                        <div className="exact-bill-sign-line" />
                        <div>(Authorised Signatory)</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
