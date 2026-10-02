import React, {useEffect, useRef, useState} from 'react';
import {Trophy, Sparkles, X, Share2, Zap, IndianRupee, Sun, CheckCircle2} from 'lucide-react';

export default function MilestoneCelebrationModal({user, activeCompany, liveData}) {
    const [milestone, setMilestone] = useState(null);
    const canvasRef = useRef(null);
    const animationFrameRef = useRef(null);

    const ownerName = activeCompany?.owner_name || user?.name || 'Lakum Jay';
    const ownerTitle = activeCompany?.owner_designation || 'Solar Plant Owner & Director';
    const ownerPhoto = activeCompany?.owner_photo_url || null;

    // 🔊 Synthesized Victory Chime Sound
    const playVictoryChime = () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            
            // Musical chord: C5 -> E5 -> G5 -> C6
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
                gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.6);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.12);
                osc.stop(ctx.currentTime + i * 0.12 + 0.6);
            });
        } catch (e) {}
    };

    // 🎊 Canvas Confetti Particle Engine
    useEffect(() => {
        if (!milestone) return;

        playVictoryChime();
        if (navigator.vibrate) {
            navigator.vibrate([150, 80, 150, 80, 300]);
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#eab308', '#ef4444', '#14b8a6'];
        const particles = [];

        for (let i = 0; i < 120; i++) {
            particles.push({
                x: canvas.width * 0.5,
                y: canvas.height * 0.4,
                w: Math.random() * 12 + 6,
                h: Math.random() * 6 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                vx: (Math.random() - 0.5) * 16,
                vy: (Math.random() - 0.9) * 18 - 4,
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 12,
                gravity: 0.35,
                opacity: 1,
            });
        }

        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let activeCount = 0;

            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.gravity;
                p.rotation += p.rotSpeed;
                p.vx *= 0.98;

                if (p.y < canvas.height + 50) {
                    activeCount++;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate((p.rotation * Math.PI) / 180);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                    ctx.restore();
                }
            });

            if (activeCount > 0) {
                animationFrameRef.current = requestAnimationFrame(render);
            }
        };

        render();

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [milestone]);

    // Check Milestones when liveData arrives
    useEffect(() => {
        if (!liveData) return;
        const todayStr = new Date().toISOString().slice(0, 10);
        const currentUnits = parseFloat(String(liveData.today_units_kwh || '0').replace(/,/g, ''));
        const currentRevenue = parseFloat(String(liveData.total_revenue_rs || '0').replace(/,/g, ''));
        const hour = new Date().getHours();

        // 1. 1,000 kWh Milestone
        if (currentUnits >= 1000 && !localStorage.getItem(`milestone_1000_${todayStr}`)) {
            setMilestone({
                id: '1000',
                todayKey: `milestone_1000_${todayStr}`,
                badge: '🎯 ૧,૦૦૦ યુનિટ્સ માઇલસ્ટોન પૂર્ણ',
                title: 'અભિનંદન ' + ownerName + ' સર!',
                subtitle: 'આજે ૧,૦૦૦ kWh ઉત્પાદન સફળતાપૂર્વક પૂર્ણ થયું છે!',
                units: currentUnits.toFixed(2),
                revenue: currentRevenue.toFixed(2),
                liveKw: liveData.realtime_power_kw || '1805.4',
                color: '#15803d'
            });
            return;
        }

        // 2. 5,000 kWh Milestone
        if (currentUnits >= 5000 && !localStorage.getItem(`milestone_5000_${todayStr}`)) {
            setMilestone({
                id: '5000',
                todayKey: `milestone_5000_${todayStr}`,
                badge: '⚡ ૫,૦૦૦ યુનિટ્સ મેજર રેકોર્ડ',
                title: 'અભિનંદન ' + ownerName + ' સર!',
                subtitle: 'આજે પ્લાન્ટે ૫,૦૦૦ kWh યુનિટ્સનો વિશાળ આંકડો પાર કર્યો!',
                units: currentUnits.toFixed(2),
                revenue: currentRevenue.toFixed(2),
                liveKw: liveData.realtime_power_kw || '1805.4',
                color: '#d97706'
            });
            return;
        }

        // 3. 10,000 kWh Milestone
        if (currentUnits >= 10000 && !localStorage.getItem(`milestone_10000_${todayStr}`)) {
            setMilestone({
                id: '10000',
                todayKey: `milestone_10000_${todayStr}`,
                badge: '🏆 ૧૦,૦૦૦ kWh ગોલ્ડન માઇલસ્ટોન',
                title: 'અભિનંદન ' + ownerName + ' સર!',
                subtitle: 'અદભુત પ્રદર્શન! ૧૦,૦૦૦+ kWh યુનિટ્સનું ઐતિહાસિક ઉત્પાદન!',
                units: currentUnits.toFixed(2),
                revenue: currentRevenue.toFixed(2),
                liveKw: liveData.realtime_power_kw || '1805.4',
                color: '#ca8a04'
            });
            return;
        }

        // 4. End of Day (EOD) Wrap-up Report (After 7:00 PM)
        if (hour >= 19 && currentUnits > 100 && !localStorage.getItem(`milestone_eod_${todayStr}`)) {
            setMilestone({
                id: 'eod',
                todayKey: `milestone_eod_${todayStr}`,
                badge: '🌅 આજનો દૈનિક સૂર્ય ઉર્જા રિપોર્ટ',
                title: 'આજનો દિવસ સફળ રહ્યો, ' + ownerName + ' સર!',
                subtitle: 'આજના દિવસનું કુલ સોલાર ઉત્પાદન અને કમાણી રિપોર્ટ તૈયાર છે.',
                units: currentUnits.toFixed(2),
                revenue: currentRevenue.toFixed(2),
                liveKw: liveData.realtime_power_kw || '0.00',
                color: '#4338ca'
            });
            return;
        }
    }, [liveData, ownerName]);

    const handleDismiss = () => {
        if (milestone?.todayKey) {
            try {
                localStorage.setItem(milestone.todayKey, 'dismissed');
            } catch (e) {}
        }
        setMilestone(null);
    };

    const handleShareWhatsApp = () => {
        if (!milestone) return;
        const text = `🎉 *SolarFlow - Solar Generation Celebration* ⚡\n\n` +
            `👑 *Owner:* ${ownerName} (${ownerTitle})\n` +
            `🏢 *Plant:* ${activeCompany?.name || 'Solar Energy'}\n` +
            `🎯 *Achievement:* ${milestone.badge}\n` +
            `⚡ *Today Units:* ${milestone.units} kWh\n` +
            `💰 *Estimated Revenue:* ₹ ${milestone.revenue}\n\n` +
            `🚀 Powered by SolarFlow Intelligence System`;

        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
        handleDismiss();
    };

    if (!milestone) return null;

    return (
        <div className="milestone-celebration-backdrop" onClick={handleDismiss}>
            {/* Canvas for falling confetti & ribbons */}
            <canvas ref={canvasRef} className="milestone-confetti-canvas"/>

            <div className="milestone-celebration-card" onClick={e => e.stopPropagation()}>
                <button type="button" className="milestone-close-btn" onClick={handleDismiss}>
                    <X size={18}/>
                </button>

                {/* Top Badge & Trophy Glow */}
                <div className="milestone-top-trophy-wrap">
                    <div className="trophy-pulse-aura"/>
                    <div className="trophy-icon-box">
                        <Trophy size={38} className="trophy-golden-svg"/>
                    </div>
                    <span className="milestone-sparkle-l"><Sparkles size={16}/></span>
                    <span className="milestone-sparkle-r"><Sparkles size={16}/></span>
                </div>

                <div className="milestone-badge-pill">
                    {milestone.badge}
                </div>

                {/* Owner Photo & VIP Profile */}
                <div className="milestone-owner-row">
                    <div className="milestone-avatar-ring">
                        {ownerPhoto ? (
                            <img src={ownerPhoto} alt={ownerName} className="milestone-owner-img"/>
                        ) : (
                            <div className="milestone-owner-initial">
                                {ownerName.slice(0, 1).toUpperCase()}
                            </div>
                        )}
                        <span className="milestone-crown-badge">👑</span>
                    </div>
                    <div className="milestone-owner-texts">
                        <h3 className="milestone-heading">{milestone.title}</h3>
                        <p className="milestone-subheading">{milestone.subtitle}</p>
                    </div>
                </div>

                {/* Metrics Highlight Grid */}
                <div className="milestone-metrics-grid">
                    <div className="m-metric-box green">
                        <span className="m-metric-lbl"><Zap size={13}/> કુલ યુનિટ્સ (Generation)</span>
                        <b className="m-metric-val">{milestone.units} <small>kWh</small></b>
                    </div>

                    <div className="m-metric-box gold">
                        <span className="m-metric-lbl"><IndianRupee size={13}/> અંદાજિત કમાણી (Revenue)</span>
                        <b className="m-metric-val">₹ {milestone.revenue}</b>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="milestone-actions-row">
                    <button
                        type="button"
                        className="milestone-btn-whatsapp"
                        onClick={handleShareWhatsApp}
                    >
                        <Share2 size={16}/>
                        <span>WhatsApp પર શેર કરો</span>
                    </button>
                    <button
                        type="button"
                        className="milestone-btn-dismiss"
                        onClick={handleDismiss}
                    >
                        આભાર (Thank You)
                    </button>
                </div>
            </div>
        </div>
    );
}
