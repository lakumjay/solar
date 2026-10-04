// Gujarati Panchang, Tithi, Festivals, and Bank Holiday Helper

export const GUJARATI_WEEKDAYS = ['સોમ', 'મંગળ', 'બુધ', 'ગુરુ', 'શુક્ર', 'શનિ', 'રવિ'];
export const GUJARATI_WEEKDAYS_FULL = ['રવિવાર', 'સોમવાર', 'મંગળવાર', 'બુધવાર', 'ગુરુવાર', 'શુક્રવાર', 'શનિવાર'];

export const GUJARATI_MONTHS = [
    'જાન્યુઆરી', 'ફેબ્રુઆરી', 'માર્ચ', 'એપ્રિલ', 'મે', 'જૂન',
    'જુલાઈ', 'ઓગસ્ટ', 'સપ્ટેમ્બર', 'ઓક્ટોબર', 'નવેમ્બર', 'ડિસેમ્બર'
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

const TITHI_NAMES = [
    'પડવો', 'બીજ', 'ત્રીજ', 'ચોથ', 'પાંચમ',
    'છઠ', 'સાતમ', 'આઠમ', 'નોમ', 'દશમ',
    'અગિયારસ', 'બારસ', 'તેરસ', 'ચૌદશ'
];

// Special fixed and floating Gujarat & Indian bank holidays / festivals
const HOLIDAYS_MAP = {
    // Fixed annual dates (MM-DD)
    '01-14': { name: 'ઉત્તરાયણ / મકરસંક્રાંતિ', isBankHoliday: true, isFestival: true, icon: '🪁' },
    '01-15': { name: 'વાસી ઉત્તરાયણ', isBankHoliday: false, isFestival: true, icon: '🪁' },
    '01-26': { name: 'પ્રજાસત્તાક દિન (Republic Day)', isBankHoliday: true, isFestival: false, icon: '🇮🇳' },
    '05-01': { name: 'ગુજરાત સ્થાપના દિન / મજૂર દિન', isBankHoliday: true, isFestival: false, icon: '🚩' },
    '08-15': { name: 'સ્વાતંત્ર્ય દિન (Independence Day)', isBankHoliday: true, isFestival: false, icon: '🇮🇳' },
    '10-02': { name: 'ગાંધી જયંતી', isBankHoliday: true, isFestival: false, icon: '🕊️' },
    '10-31': { name: 'સરદાર પટેલ જયંતી', isBankHoliday: true, isFestival: false, icon: '🇮🇳' },
    '12-25': { name: 'નાતાલ (Christmas)', isBankHoliday: true, isFestival: true, icon: '🎄' },

    // 2026 specific festival calendar dates (YYYY-MM-DD)
    '2026-02-15': { name: 'મહા શિવરાત્રી', isBankHoliday: true, isFestival: true, icon: '🔱' },
    '2026-03-03': { name: 'હોળી / ધૂળેટી', isBankHoliday: true, isFestival: true, icon: '🔥' },
    '2026-03-27': { name: 'રામ નવમી', isBankHoliday: true, isFestival: true, icon: '🏹' },
    '2026-03-31': { name: 'મહાવીર જયંતી', isBankHoliday: true, isFestival: false, icon: '🪔' },
    '2026-04-03': { name: 'ગુડ ફ્રાઈડે (Good Friday)', isBankHoliday: true, isFestival: false, icon: '✝️' },
    '2026-04-14': { name: 'ડૉ. આંબેડકર જયંતી', isBankHoliday: true, isFestival: false, icon: '⚖️' },
    '2026-08-28': { name: 'રક્ષાબંધન (બળેવ)', isBankHoliday: false, isFestival: true, icon: '🪢' },
    '2026-09-04': { name: 'શ્રીકૃષ્ણ જન્માષ્ટમી', isBankHoliday: true, isFestival: true, icon: '🦚' },
    '2026-09-14': { name: 'ગણેશ ચતુર્થી', isBankHoliday: true, isFestival: true, icon: '🐘' },
    '2026-10-20': { name: 'વિજયાદશમી (દશેરા)', isBankHoliday: true, isFestival: true, icon: '🏹' },
    '2026-11-06': { name: 'ધનતેરસ', isBankHoliday: false, isFestival: true, icon: '🪔' },
    '2026-11-07': { name: 'કાળી ચૌદશ', isBankHoliday: false, isFestival: true, icon: '🪔' },
    '2026-11-08': { name: 'દિવાળી / લક્ષ્મી પૂજન', isBankHoliday: true, isFestival: true, icon: '🪔' },
    '2026-11-09': { name: 'બેસતું વર્ષ (નૂતન વર્ષાભિનંદન)', isBankHoliday: true, isFestival: true, icon: '🪔' },
    '2026-11-10': { name: 'ભાઈબીજ', isBankHoliday: true, isFestival: true, icon: '🪔' },
    '2026-11-20': { name: 'દેવ દિવાળી / તુલસી વિવાહ', isBankHoliday: false, isFestival: true, icon: '🪔' },

    // 2025 dates support
    '2025-02-26': { name: 'મહા શિવરાત્રી', isBankHoliday: true, isFestival: true, icon: '🔱' },
    '2025-03-14': { name: 'હોળી / ધૂળેટી', isBankHoliday: true, isFestival: true, icon: '🔥' },
    '2025-04-06': { name: 'રામ નવમી', isBankHoliday: true, isFestival: true, icon: '🏹' },
    '2025-08-09': { name: 'રક્ષાબંધન', isBankHoliday: false, isFestival: true, icon: '🪢' },
    '2025-08-16': { name: 'જન્માષ્ટમી', isBankHoliday: true, isFestival: true, icon: '🦚' },
    '2025-10-02': { name: 'દશેરા / ગાંધી જયંતી', isBankHoliday: true, isFestival: true, icon: '🏹' },
    '2025-10-20': { name: 'દિવાળી', isBankHoliday: true, isFestival: true, icon: '🪔' },
    '2025-10-22': { name: 'બેસતું વર્ષ', isBankHoliday: true, isFestival: true, icon: '🪔' }
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

    let paksha = '';
    let tithiName = '';
    let isEkadashi = false;
    let isPoonam = false;
    let isAmavasya = false;

    if (tithiIndex < 14) {
        paksha = 'સુદ';
        tithiName = TITHI_NAMES[tithiIndex] || 'પડવો';
        if (tithiIndex === 10) isEkadashi = true;
    } else if (tithiIndex === 14) {
        paksha = 'સુદ';
        tithiName = 'પૂનમ';
        isPoonam = true;
    } else if (tithiIndex < 29) {
        paksha = 'વદ';
        tithiName = TITHI_NAMES[tithiIndex - 15] || 'પડવો';
        if (tithiIndex === 25) isEkadashi = true;
    } else {
        paksha = 'વદ';
        tithiName = 'અમાસ';
        isAmavasya = true;
    }

    // Check Holiday or Festival
    const holidayInfo = HOLIDAYS_MAP[yyyyMmDd] || HOLIDAYS_MAP[mmDd] || null;

    const isSunday = dayOfWeek === 0;
    const isSat2or4 = isSecondOrFourthSaturday(dateObj);
    const isBankHoliday = isSunday || isSat2or4 || (holidayInfo?.isBankHoliday ?? false);

    let bankHolidayReason = '';
    if (holidayInfo?.isBankHoliday) {
        bankHolidayReason = holidayInfo.name;
    } else if (isSunday) {
        bankHolidayReason = 'રવિવાર (સાપ્તાહિક રજા)';
    } else if (isSat2or4) {
        const satNo = dateNum <= 14 ? 'બીજો' : 'ચોથો';
        bankHolidayReason = `${satNo} શનિવાર (બેંક રજા)`;
    }

    return {
        dateStr: yyyyMmDd,
        dayNameGu: GUJARATI_WEEKDAYS_FULL[dayOfWeek],
        monthNameGu: GUJARATI_MONTHS[month],
        dayOfMonth: dateNum,
        year: year,
        paksha: paksha,
        tithiName: tithiName,
        tithiFull: `${paksha} ${tithiName}`,
        isEkadashi,
        isPoonam,
        isAmavasya,
        festivalName: holidayInfo?.name || null,
        festivalIcon: holidayInfo?.icon || (isEkadashi ? '✨' : isPoonam ? '🌕' : isAmavasya ? '🌑' : null),
        isBankHoliday,
        bankHolidayReason,
        isSpecialTithi: isEkadashi || isPoonam || isAmavasya
    };
}

/**
 * Check if tomorrow is a Bank Holiday (Advance Warning)
 */
export function getTomorrowBankHolidayAlert(currentDate = new Date()) {
    const tomorrow = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1);
    const details = getPanchangDetails(tomorrow);

    if (details.isBankHoliday) {
        return {
            active: true,
            tomorrowDate: details.dateStr,
            tomorrowDay: details.dayNameGu,
            reason: details.bankHolidayReason,
            message: `આવતીકાલે (${details.dayNameGu}) બેંક રજા રહેશે: ${details.bankHolidayReason}. પેમેન્ટ / ટ્રાન્ઝેક્શન અગાઉથી આયોજિત કરો.`
        };
    }

    return { active: false };
}
