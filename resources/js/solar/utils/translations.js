// Global Language dictionary for SolarFlow (English and Gujarati)

export const translations = {
    gu: {
        appName: 'સોલારફ્લો',
        dashboard: 'ડેશબોર્ડ',
        liveSolar: 'લાઈવ સોલાર',
        dailyEntry: 'દૈનિક એન્ટ્રી',
        readings: 'રીડિંગ્સ',
        reports: 'રિપોર્ટ',
        employees: 'કર્મચારીઓ',
        attendance: 'હાજરી',
        attendanceReports: 'હાજરી રિપોર્ટ',
        salaries: 'પગાર (સેલેરી)',
        myAttendance: 'મારી હાજરી',
        mySalary: 'મારો પગાર',
        stock: 'સ્ટોક / સામાન',
        expenses: 'શેર્ડ ખર્ચા',
        companies: 'કંપનીઓ',
        users: 'યુઝર્સ',
        excelImport: 'એક્સેલ ઈમ્પોર્ટ',
        activityLog: 'એક્ટિવિટી લોગ',
        leaveHoliday: 'રજા / હોલિડે',
        gallery: 'ગેલેરી',
        reels: 'રીલ્સ / વીડિયો',
        isolarcloud: 'iSolarCloud',
        logout: 'લૉગઆઉટ',
        allCompanies: 'બધી કંપનીઓ',
        callAi: 'AI કોલ (SolarFlow)',
        callStatusDialing: 'ડાયલ થઈ રહ્યું છે...',
        callStatusConnected: 'કોલ કનેક્ટ થયો છે - પૂછો',
        callStatusListening: 'સાંભળી રહ્યું છે...',
        callStatusSpeaking: 'SolarFlow AI બોલી રહ્યું છે...',
        callStatusMuted: 'માઇક મ્યુટ છે',
        callEnd: 'કોલ કટ કરો',
        mute: 'મ્યુટ',
        unmute: 'અનમ્યુટ',
        speaker: 'સ્પીકર',
        language: 'ભાષા',
        gujarati: 'ગુજરાતી',
        english: 'English',
        todayGeneration: 'આજનું જનરેશન',
        todayExport: 'આજનું એક્સપોર્ટ',
        todayImport: 'આજનું ઈમ્પોર્ટ',
        monthGeneration: 'ચાલુ મહિનાનું જનરેશન',
        livePower: 'લાઈવ પાવર',
        onlineInverters: 'ઓનલાઈન ઇન્વર્ટર',
        offlineInverters: 'ઓફલાઈન ઇન્વર્ટર',
        totalRevenue: 'કુલ આવક',
        yesterday: 'ગઈકાલે',
        thisMonth: 'આ મહિને',
        lastMonth: 'ગયા મહિને',
        switchLanguage: 'ભાષા બદલો',
    },
    en: {
        appName: 'SolarFlow',
        dashboard: 'Dashboard',
        liveSolar: 'Live Solar',
        dailyEntry: 'Daily Entry',
        readings: 'Readings',
        reports: 'Reports',
        employees: 'Employees',
        attendance: 'Attendance',
        attendanceReports: 'Attendance Reports',
        salaries: 'Salaries',
        myAttendance: 'My Attendance',
        mySalary: 'My Salary',
        stock: 'Stock / Inventory',
        expenses: 'Shared Expenses',
        companies: 'Companies',
        users: 'Users',
        excelImport: 'Excel Import',
        activityLog: 'Activity Log',
        leaveHoliday: 'Leaves & Holidays',
        gallery: 'Gallery',
        reels: 'Reels / Videos',
        isolarcloud: 'iSolarCloud',
        logout: 'Logout',
        allCompanies: 'All Companies',
        callAi: 'AI Voice Call (SolarFlow)',
        callStatusDialing: 'Dialing SolarFlow AI...',
        callStatusConnected: 'Connected - Speak Now',
        callStatusListening: 'Listening...',
        callStatusSpeaking: 'SolarFlow AI is speaking...',
        callStatusMuted: 'Microphone Muted',
        callEnd: 'End Call',
        mute: 'Mute',
        unmute: 'Unmute',
        speaker: 'Speaker',
        language: 'Language',
        gujarati: 'ગુજરાતી',
        english: 'English',
        todayGeneration: 'Today Generation',
        todayExport: 'Today Export',
        todayImport: 'Today Import',
        monthGeneration: 'Month Generation',
        livePower: 'Live Power',
        onlineInverters: 'Online Inverters',
        offlineInverters: 'Offline Inverters',
        totalRevenue: 'Total Revenue',
        yesterday: 'Yesterday',
        thisMonth: 'This Month',
        lastMonth: 'Last Month',
        switchLanguage: 'Switch Language',
    }
};

let currentLang = 'gu';
try {
    const saved = localStorage.getItem('solarflow_language');
    if (saved && (saved === 'gu' || saved === 'en')) {
        currentLang = saved;
    }
} catch (_) {}

export function getLanguage() {
    return currentLang;
}

export function setLanguage(lang) {
    if (lang === 'gu' || lang === 'en') {
        currentLang = lang;
        try {
            localStorage.setItem('solarflow_language', lang);
            window.dispatchEvent(new CustomEvent('solarflow_language_change', { detail: lang }));
        } catch (_) {}
    }
}

export function t(key) {
    const langDict = translations[currentLang] || translations.gu;
    return langDict[key] || translations.en[key] || key;
}
