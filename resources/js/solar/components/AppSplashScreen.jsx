import React, {useEffect, useState} from 'react';
import {Sun, Sparkles, Zap, Building2, CheckCircle2} from 'lucide-react';
import {getLanguage} from '../utils/translations';

export default function AppSplashScreen({user, activeCompany, liveData, onFinish}) {
    const [visible, setVisible] = useState(true);
    const [progress, setProgress] = useState(15);
    const [currentLang, setCurrentLang] = useState(() => getLanguage());

    useEffect(() => {
        const handler = (e) => setCurrentLang(e.detail || getLanguage());
        window.addEventListener('solarflow_language_change', handler);
        return () => window.removeEventListener('solarflow_language_change', handler);
    }, []);

    // Get time-appropriate bilingual greeting
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (currentLang === 'en') {
            if (hour >= 4 && hour < 12) return 'Good Morning';
            if (hour >= 12 && hour < 17) return 'Good Afternoon';
            if (hour >= 17 && hour < 21) return 'Good Evening';
            return 'Good Night';
        }
        if (hour >= 4 && hour < 12) return 'શુભ સવાર';
        if (hour >= 12 && hour < 17) return 'શુભ બપોર';
        if (hour >= 17 && hour < 21) return 'શુભ સાંજ';
        return 'શુભ રાત્રિ';
    };

    const ownerName = activeCompany?.owner_name || user?.name || 'Lakum Jay';
    const ownerTitle = activeCompany?.owner_designation || (user?.role === 'super_admin' ? (currentLang === 'en' ? 'Solar Plant Owner & Director' : 'સોલાર પ્લાન્ટ ઓનર & ડિરેક્ટર') : (currentLang === 'en' ? 'Solar Plant Executive' : 'સોલાર પ્લાન્ટ એક્ઝિક્યુટિવ'));
    const ownerPhoto = activeCompany?.owner_photo_url || null;
    const companyName = activeCompany?.name || 'Nilkanth / Rajeshwari Solar Plant';

    useEffect(() => {
        // Progress bar animation
        const timer1 = setTimeout(() => setProgress(45), 300);
        const timer2 = setTimeout(() => setProgress(80), 800);
        const timer3 = setTimeout(() => setProgress(100), 1300);
        const timer4 = setTimeout(() => {
            setVisible(false);
            if (onFinish) onFinish();
        }, 2200);

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
            clearTimeout(timer4);
        };
    }, [onFinish]);

    if (!visible) return null;

    return (
        <div className="solar-splash-overlay" onClick={() => { setVisible(false); if (onFinish) onFinish(); }}>
            <div className="solar-splash-card">
                {/* 1. Golden Glowing 3D Sun Logo & Aura */}
                <div className="splash-sun-wrap">
                    <div className="splash-sun-aura"/>
                    <div className="splash-sun-icon-box">
                        <Sun size={48} className="splash-sun-svg spin-slow"/>
                    </div>
                    <div className="splash-sparkle-tag">
                        <Sparkles size={14}/>
                    </div>
                </div>

                {/* 2. Brand Name & Badge */}
                <div className="splash-brand-row">
                    <h1 className="splash-brand-title">Solar<span className="brand-flow">Flow</span></h1>
                    <span className="splash-brand-pill">{currentLang === 'en' ? '⚡ Live Energy Intelligence' : '⚡ લાઈવ એનર્જી ઇન્ટેલિજન્સ'}</span>
                </div>

                {/* 3. VIP Owner Profile Card with Golden Ring */}
                <div className="splash-owner-card">
                    <div className="splash-owner-avatar-ring">
                        {ownerPhoto ? (
                            <img src={ownerPhoto} alt={ownerName} className="splash-owner-img"/>
                        ) : (
                            <div className="splash-owner-fallback">
                                <span>{ownerName.slice(0, 1).toUpperCase()}</span>
                            </div>
                        )}
                        <span className="splash-vip-crown" title="Owner VIP Profile">👑</span>
                    </div>

                    <div className="splash-owner-details">
                        <div className="splash-greeting-label">
                            {getGreeting()}, <span className="splash-highlight">{ownerName} {currentLang === 'en' ? 'Sir!' : 'સર!'} 👋</span>
                        </div>
                        <p className="splash-owner-role">{ownerTitle}</p>
                        <p className="splash-comp-name"><Building2 size={12}/> {companyName}</p>
                    </div>
                </div>

                {/* 4. Live Plant Connection Progress Bar */}
                <div className="splash-progress-section">
                    <div className="splash-progress-track">
                        <div className="splash-progress-bar" style={{width: `${progress}%`}}/>
                    </div>
                    <div className="splash-progress-status">
                        <span className="splash-status-text">
                            {progress < 100
                                ? (currentLang === 'en' ? 'Plant syncing live in progress...' : 'પ્લાન્ટ લાઈવ સિન્ક થઈ રહ્યો છે...')
                                : (currentLang === 'en' ? '✓ 10 Inverters Connected · Live Flow Active' : '✓ ૧૦ ઇન્વર્ટર્સ કનેક્ટેડ · લાઈવ ફ્લો સક્રિય')}
                        </span>
                        <span className="splash-pct">{progress}%</span>
                    </div>
                </div>

                <div className="splash-tap-hint">
                    {currentLang === 'en' ? 'Tap anywhere to continue' : 'ટેપ કરીને આગળ વધો (Tap to continue)'}
                </div>
            </div>
        </div>
    );
}
