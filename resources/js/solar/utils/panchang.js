import { getLanguage } from './translations';

export const GUJARATI_WEEKDAYS = ['સોમ', 'મંગળ', 'બુધ', 'ગુરુ', 'શુક્ર', 'શનિ', 'રવિ'];
export const ENGLISH_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const GUJARATI_WEEKDAYS_FULL = ['રવિવાર', 'સોમવાર', 'મંગળવાર', 'બુધવાર', 'ગુરુવાર', 'શુક્રવાર', 'શનિવાર'];
export const ENGLISH_WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const GUJARATI_MONTHS = [
    'જાન્યુઆરી', 'ફેબ્રુઆરી', 'માર્ચ', 'એપ્રિલ', 'મે', 'જૂન',
    'જુલાઈ', 'ઓગસ્ટ', 'સપ્ટેમ્બર', 'ઓક્ટોબર', 'નવેમ્બર', 'ડિસેમ્બર'
];

export const ENGLISH_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export const GUJARATI_DIGITS = ['૦', '૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯'];

export function toGujaratiDigits(num) {
    if (num === null || num === undefined) return '';
    return String(num).replace(/[0-9]/g, d => GUJARATI_DIGITS[d]);
}

// Synodic lunar month calculation (29.53058867 days)
// Reference known new moon: 2026-01-18 21:52 UTC
const LUNAR_EPOCH = new Date(Date.UTC(2026, 0, 18, 21, 52, 0)).getTime();
const SYNODIC_MONTH_MS = 29.53058867 * 24 * 60 * 60 * 1000;

const TITHI_NAMES_GU = [
    'પડવો', 'બીજ', 'ત્રીજ', 'ચોથ', 'પાંચમ',
    'છઠ', 'સાતમ', 'આઠમ', 'નોમ', 'દશમ',
    'અગિયારસ', 'બારસ', 'તેરસ', 'ચૌદશ'
];

const TITHI_NAMES_EN = [
    'Padva', 'Beej', 'Trij', 'Choth', 'Pancham',
    'Chhath', 'Satam', 'Aatham', 'Nom', 'Dasham',
    'Ekadashi', 'Baras', 'Teras', 'Chaudas'
];

// Special fixed and floating Gujarat & Indian bank holidays / festivals
const HOLIDAYS_MAP = {
    // Fixed annual dates (MM-DD)
    '01-14': { name: 'ઉત્તરાયણ / મકરસંક્રાંતિ', nameEn: 'Makar Sankranti / Uttarayan', isBankHoliday: true, isFestival: true, icon: '🪁' },
    '01-15': { name: 'વાસી ઉત્તરાયણ', nameEn: 'Vasi Uttarayan', isBankHoliday: false, isFestival: true, icon: '🪁' },
    '01-26': { name: 'પ્રજાસત્તાક દિન (Republic Day)', nameEn: 'Republic Day', isBankHoliday: true, isFestival: false, icon: '🇮🇳' },
    '05-01': { name: 'ગુજરાત સ્થાપના દિન / મજૂર દિન', nameEn: 'Gujarat Day / Labour Day', isBankHoliday: true, isFestival: false, icon: '🚩' },
    '08-15': { name: 'સ્વાતંત્ર્ય દિન (Independence Day)', nameEn: 'Independence Day', isBankHoliday: true, isFestival: false, icon: '🇮🇳' },
    '10-02': { name: 'ગાંધી જયંતી', nameEn: 'Gandhi Jayanti', isBankHoliday: true, isFestival: false, icon: '🕊️' },
    '10-31': { name: 'સરદાર પટેલ જયંતી', nameEn: 'Sardar Patel Jayanti', isBankHoliday: true, isFestival: false, icon: '🇮🇳' },
    '12-25': { name: 'નાતાલ (Christmas)', nameEn: 'Christmas', isBankHoliday: true, isFestival: true, icon: '🎄' },

    // 2026 specific festival calendar dates (YYYY-MM-DD)
    '2026-02-15': { name: 'મહા શિવરાત્રી', nameEn: 'Maha Shivratri', isBankHoliday: true, isFestival: true, icon: '🔱' },
    '2026-03-03': { name: 'હોળી / ધૂળેટી', nameEn: 'Holi / Dhuleti', isBankHoliday: true, isFestival: true, icon: '🔥' },
    '2026-03-27': { name: 'રામ નવમી', nameEn: 'Ram Navami', isBankHoliday: true, isFestival: true, icon: '🏹' },
    '2026-03-31': { name: 'મહાવીર જયંતી', nameEn: 'Mahavir Jayanti', isBankHoliday: true, isFestival: false, icon: '🪔' },
    '2026-04-03': { name: 'ગુડ ફ્રાઈડે (Good Friday)', nameEn: 'Good Friday', isBankHoliday: true, isFestival: false, icon: '✝️' },
    '2026-04-14': { name: 'ડૉ. આંબેડકર જયંતી', nameEn: 'Dr. Ambedkar Jayanti', isBankHoliday: true, isFestival: false, icon: '⚖️' },
    '2026-08-28': { name: 'રક્ષાબંધન (બળેવ)', nameEn: 'Raksha Bandhan', isBankHoliday: false, isFestival: true, icon: '🪢' },
    '2026-09-04': { name: 'શ્રીકૃષ્ણ જન્માષ્ટમી', nameEn: 'Janmashtami', isBankHoliday: true, isFestival: true, icon: '🦚' },
    '2026-09-14': { name: 'ગણેશ ચતુર્થી', nameEn: 'Ganesh Chaturthi', isBankHoliday: true, isFestival: true, icon: '🐘' },
    '2026-10-20': { name: 'વિજયાદશમી (દશેરા)', nameEn: 'Dussehra', isBankHoliday: true, isFestival: true, icon: '🏹' },
    '2026-11-06': { name: 'ધનતેરસ', nameEn: 'Dhanteras', isBankHoliday: false, isFestival: true, icon: '🪔' },
    '2026-11-07': { name: 'કાળી ચૌદશ', nameEn: 'Kali Chaudas', isBankHoliday: false, isFestival: true, icon: '🪔' },
    '2026-11-08': { name: 'દિવાળી / લક્ષ્મી પૂજન', nameEn: 'Diwali', isBankHoliday: true, isFestival: true, icon: '🪔' },
    '2026-11-09': { name: 'બેસતું વર્ષ (નૂતન વર્ષાભિનંદન)', nameEn: 'Gujarati New Year', isBankHoliday: true, isFestival: true, icon: '🪔' },
    '2026-11-10': { name: 'ભાઈબીજ', nameEn: 'Bhai Dooj', isBankHoliday: true, isFestival: true, icon: '🪔' },
    '2026-11-20': { name: 'દેવ દિવાળી / તુલસી વિવાહ', nameEn: 'Dev Diwali', isBankHoliday: false, isFestival: true, icon: '🪔' },

    // 2025 dates support
    '2025-02-26': { name: 'મહા શિવરાત્રી', nameEn: 'Maha Shivratri', isBankHoliday: true, isFestival: true, icon: '🔱' },
    '2025-03-14': { name: 'હોળી / ધૂળેટી', nameEn: 'Holi / Dhuleti', isBankHoliday: true, isFestival: true, icon: '🔥' },
    '2025-04-06': { name: 'રામ નવમી', nameEn: 'Ram Navami', isBankHoliday: true, isFestival: true, icon: '🏹' },
    '2025-08-09': { name: 'રક્ષાબંધન', nameEn: 'Raksha Bandhan', isBankHoliday: false, isFestival: true, icon: '🪢' },
    '2025-08-16': { name: 'જન્માષ્ટમી', nameEn: 'Janmashtami', isBankHoliday: true, isFestival: true, icon: '🦚' },
    '2025-10-02': { name: 'દશેરા / ગાંધી જયંતી', nameEn: 'Dussehra / Gandhi Jayanti', isBankHoliday: true, isFestival: true, icon: '🏹' },
    '2025-10-20': { name: 'દિવાળી', nameEn: 'Diwali', isBankHoliday: true, isFestival: true, icon: '🪔' },
    '2025-10-22': { name: 'બેસતું વર્ષ', nameEn: 'Gujarati New Year', isBankHoliday: true, isFestival: true, icon: '🪔' }
};

/**
 * Check if a specific Saturday is 2nd or 4th Saturday of the month
 */
function isSecondOrFourthSaturday(date) {
    if (date.getDay() !== 6) return false;
    const day = date.getDate();
    return (day >= 8 && day <= 14) || (day >= 22 && day <= 28);
}

/**
 * Get detailed Panchang info for any JavaScript Date
 */
export function getPanchangDetails(dateObj) {
    if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        dateObj = new Date();
    }

    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const dateNum = dateObj.getDate();
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, ...

    // Format keys
    const mmDd = `${String(month + 1).padStart(2, '0')}-${String(dateNum).padStart(2, '0')}`;
    const yyyyMmDd = `${year}-${mmDd}`;

    // Lunar calculations
    const timeMs = dateObj.getTime();
    let diffMs = (timeMs - LUNAR_EPOCH) % SYNODIC_MONTH_MS;
    if (diffMs < 0) diffMs += SYNODIC_MONTH_MS;

    const lunarDays = diffMs / (24 * 60 * 60 * 1000);
    const tithiIndex = Math.floor(lunarDays); // 0 to 29

    let pakshaGu = '';
    let pakshaEn = '';
    let tithiNameGu = '';
    let tithiNameEn = '';
    let isEkadashi = false;
    let isPoonam = false;
    let isAmavasya = false;

    if (tithiIndex < 14) {
        pakshaGu = 'સુદ';
        pakshaEn = 'Sud';
        tithiNameGu = TITHI_NAMES_GU[tithiIndex] || 'પડવો';
        tithiNameEn = TITHI_NAMES_EN[tithiIndex] || 'Padva';
        if (tithiIndex === 10) isEkadashi = true;
    } else if (tithiIndex === 14) {
        pakshaGu = 'સુદ';
        pakshaEn = 'Sud';
        tithiNameGu = 'પૂનમ';
        tithiNameEn = 'Purnima';
        isPoonam = true;
    } else if (tithiIndex < 29) {
        pakshaGu = 'વદ';
        pakshaEn = 'Vad';
        tithiNameGu = TITHI_NAMES_GU[tithiIndex - 15] || 'પડવો';
        tithiNameEn = TITHI_NAMES_EN[tithiIndex - 15] || 'Padva';
        if (tithiIndex === 25) isEkadashi = true;
    } else {
        pakshaGu = 'વદ';
        pakshaEn = 'Vad';
        tithiNameGu = 'અમાસ';
        tithiNameEn = 'Amavasya';
        isAmavasya = true;
    }

    // Check Holiday or Festival
    const holidayInfo = HOLIDAYS_MAP[yyyyMmDd] || HOLIDAYS_MAP[mmDd] || null;

    const isSunday = dayOfWeek === 0;
    const isSat2or4 = isSecondOrFourthSaturday(dateObj);
    const isBankHoliday = isSunday || isSat2or4 || (holidayInfo?.isBankHoliday ?? false);

    let bankHolidayReasonGu = '';
    let bankHolidayReasonEn = '';
    if (holidayInfo?.isBankHoliday) {
        bankHolidayReasonGu = holidayInfo.name;
        bankHolidayReasonEn = holidayInfo.nameEn || holidayInfo.name;
    } else if (isSunday) {
        bankHolidayReasonGu = 'રવિવાર (સાપ્તાહિક રજા)';
        bankHolidayReasonEn = 'Sunday (Weekly Off)';
    } else if (isSat2or4) {
        const satNo = dateNum <= 14 ? 'બીજો' : 'ચોથો';
        const satNoEn = dateNum <= 14 ? '2nd' : '4th';
        bankHolidayReasonGu = `${satNo} શનિવાર (બેંક રજા)`;
        bankHolidayReasonEn = `${satNoEn} Saturday (Bank Holiday)`;
    }

    const currentLanguage = getLanguage();
    const bankHolidayReason = currentLanguage === 'en' ? (bankHolidayReasonEn || bankHolidayReasonGu) : bankHolidayReasonGu;
    const festivalName = currentLanguage === 'en' ? (holidayInfo?.nameEn || holidayInfo?.name || null) : (holidayInfo?.name || null);

    return {
        dateStr: yyyyMmDd,
        dayNameGu: GUJARATI_WEEKDAYS_FULL[dayOfWeek],
        dayNameEn: ENGLISH_WEEKDAYS_FULL[dayOfWeek],
        monthNameGu: GUJARATI_MONTHS[month],
        monthNameEn: ENGLISH_MONTHS[month],
        dayOfMonth: dateNum,
        year: year,
        paksha: currentLanguage === 'en' ? pakshaEn : pakshaGu,
        tithiName: currentLanguage === 'en' ? tithiNameEn : tithiNameGu,
        tithiFull: currentLanguage === 'en' ? `${pakshaEn} ${tithiNameEn}` : `${pakshaGu} ${tithiNameGu}`,
        isEkadashi,
        isPoonam,
        isAmavasya,
        festivalName,
        festivalIcon: holidayInfo?.icon || (isEkadashi ? '✨' : isPoonam ? '🌕' : isAmavasya ? '🌑' : null),
        isBankHoliday,
        bankHolidayReason,
        bankHolidayReasonGu,
        bankHolidayReasonEn,
        isSpecialTithi: isEkadashi || isPoonam || isAmavasya
    };
}

/**
 * Check if tomorrow is a Bank Holiday (Advance Warning with Consecutive Days)
 */
export function getTomorrowBankHolidayAlert(currentDate = new Date(), lang = null) {
    const activeLang = lang || getLanguage();
    const tomorrow = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1);
    const tomorrowDetails = getPanchangDetails(tomorrow);

    if (tomorrowDetails.isBankHoliday) {
        let consecutiveDays = 1;
        const reasonsGu = [tomorrowDetails.bankHolidayReasonGu || tomorrowDetails.bankHolidayReason];
        const reasonsEn = [tomorrowDetails.bankHolidayReasonEn || tomorrowDetails.bankHolidayReason];

        for (let i = 2; i <= 4; i++) {
            const nextDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + i);
            const nextDetails = getPanchangDetails(nextDay);
            if (nextDetails.isBankHoliday) {
                consecutiveDays++;
                if (nextDetails.bankHolidayReasonGu && !reasonsGu.includes(nextDetails.bankHolidayReasonGu)) {
                    reasonsGu.push(nextDetails.bankHolidayReasonGu);
                }
                if (nextDetails.bankHolidayReasonEn && !reasonsEn.includes(nextDetails.bankHolidayReasonEn)) {
                    reasonsEn.push(nextDetails.bankHolidayReasonEn);
                }
            } else {
                break;
            }
        }

        const reasonGuText = reasonsGu.join(' + ');
        const reasonEnText = reasonsEn.join(' + ');
        const dayCountGuText = consecutiveDays > 1 ? `કાલથી ${consecutiveDays} દિવસ` : 'આવતીકાલે';
        const dayCountEnText = consecutiveDays > 1 ? `For ${consecutiveDays} days starting tomorrow,` : 'Tomorrow,';

        if (activeLang === 'en') {
            return {
                active: true,
                tomorrowDate: tomorrowDetails.dateStr,
                tomorrowDay: tomorrowDetails.dayNameEn,
                consecutiveDays,
                reason: reasonEnText,
                title: consecutiveDays > 1 ? `🏦 Bank Closed for ${consecutiveDays} Days` : `🏦 Bank Holiday Tomorrow`,
                message: `${dayCountEnText} banks will remain closed (${reasonEnText}). Please complete all transfers and banking work today.`
            };
        }

        return {
            active: true,
            tomorrowDate: tomorrowDetails.dateStr,
            tomorrowDay: tomorrowDetails.dayNameGu,
            consecutiveDays,
            reason: reasonGuText,
            title: consecutiveDays > 1 ? `🏦 કાલથી ${consecutiveDays} દિવસ બેંક બંધ રહેશે` : `🏦 આવતીકાલે બેંક રજા`,
            message: `${dayCountGuText} બેંક બંધ રહેશે (${reasonGuText}). તમામ પેમેન્ટ / બેંકિંગ કામકાજ આજે જ પૂર્ણ કરી લેવા.`
        };
    }

    return { active: false };
}

/**
 * Vi SIM Recharge Alert (Active between 2nd and 5th of every month)
 */
export function getViRechargeAlert(currentDate = new Date(), lang = null) {
    const activeLang = lang || getLanguage();
    const day = currentDate.getDate();
    if (day >= 2 && day <= 5) {
        if (activeLang === 'en') {
            return {
                active: true,
                dayRange: '2nd to 5th',
                title: '📶 Vi SIM Recharge Alert (Date 2 to 5)',
                message: 'Please recharge Vi SIM cards for all solar plant data loggers (Sunrise, Rajeshwari, Nilkanth) to ensure uninterrupted live cloud monitoring.'
            };
        }
        return {
            active: true,
            dayRange: '૨ થી ૫ તારીખ',
            title: '📶 Vi સિમ કાર્ડ રિચાર્જ એલર્ટ (તારીખ ૨ થી ૫)',
            message: 'તમામ સોલાર પ્લાન્ટ્સ (Sunrise, Rajeshwari, Nilkanth) ના ડેટા લોગર અને ઇન્વર્ટર કમ્યુનિકેશન માટે Vi સિમ કાર્ડ્સનું સમયસર રિચાર્જ કરી લેવું જેથી લાઇવ મોનિટરિંગ ચાલુ રહે.'
        };
    }
    return { active: false };
}

