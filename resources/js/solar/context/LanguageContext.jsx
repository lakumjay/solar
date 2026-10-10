import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations, getLanguage, setLanguage as setGlobalLang } from '../utils/translations';

const LanguageContext = createContext({
    lang: 'gu',
    setLang: () => {},
    t: (key, fallback) => fallback || key,
    toggleLanguage: () => {},
});

export function LanguageProvider({ children }) {
    const [lang, setLangState] = useState(() => {
        return getLanguage();
    });

    const setLang = useCallback((newLang) => {
        if (newLang === 'gu' || newLang === 'en') {
            setLangState(newLang);
            setGlobalLang(newLang);
        }
    }, []);

    const toggleLanguage = useCallback(() => {
        const next = lang === 'gu' ? 'en' : 'gu';
        setLang(next);
    }, [lang, setLang]);

    useEffect(() => {
        const handleLangChange = (e) => {
            if (e.detail && e.detail !== lang) {
                setLangState(e.detail);
            }
        };
        window.addEventListener('solarflow_language_change', handleLangChange);
        return () => window.removeEventListener('solarflow_language_change', handleLangChange);
    }, [lang]);

    const t = useCallback((key, fallback = null) => {
        const dict = translations[lang] || translations.gu;
        if (dict && dict[key] !== undefined) return dict[key];
        if (translations.en && translations.en[key] !== undefined) return translations.en[key];
        return fallback !== null ? fallback : key;
    }, [lang]);

    return (
        <LanguageContext.Provider value={{ lang, setLang, toggleLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    return useContext(LanguageContext);
}

export function useTranslation() {
    return useContext(LanguageContext);
}

export default LanguageContext;
