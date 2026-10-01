import React, {useState} from 'react';
import {CheckCircle, Clock, HelpCircle, Sun, Cloud, CloudRain, CloudLightning, Wind, AlertTriangle} from 'lucide-react';

export default function ISolarCloudVisualizer({data, weather, isEmployee}) {
    // Interactive weather mode for live testing (Sunny / Rain / Storm)
    const [selectedWeather, setSelectedWeather] = useState(weather.type || 'sunny');

    const realtimeMw = data.realtime_power_mw || '1.41';
    const realtimeKw = data.realtime_power_kw || '1410.41';
    const todayKwh = data.today_units_kwh || '13980.10';
    const installedMwp = data.installed_capacity_mwp || '3.00';
    const revenueRs = data.total_revenue_rs || '53124.38';
    const onlineCount = data.online_count ?? 9;
    const totalInverters = data.total_inverters ?? 10;

    const weatherTemp = selectedWeather === 'storm' ? '24.5°C' : selectedWeather === 'rain' ? '26.8°C' : (weather.temp || '32.9°C');

    return (
        <section className={`isolar-app-card weather-mode-${selectedWeather}`}>
            {/* Top Bar Header */}
            <div className="isolar-card-header">
                <div className="isolar-header-left">
                    <span className={`isolar-status-pill ${selectedWeather === 'storm' ? 'pill-storm' : selectedWeather === 'rain' ? 'pill-rain' : ''}`}>
                        {selectedWeather === 'storm' ? (
                            <><AlertTriangle size={12}/> <span>Storm Mode</span></>
                        ) : selectedWeather === 'rain' ? (
                            <><CloudRain size={12}/> <span>Rain Active</span></>
                        ) : (
                            <><CheckCircle size={12} className="pill-check-icon"/> <span>Normal</span></>
                        )}
                    </span>
                    <span className="isolar-sync-icon" title="Real-time synchronized">
                        <Clock size={12}/>
                    </span>
                </div>

                {/* Weather Test Simulator Buttons (☀️ Sunny | 🌧️ Rain | ⛈️ Tufan) */}
                <div className="isolar-weather-simulator-tabs">
                    <button
                        type="button"
                        className={`weather-sim-btn ${selectedWeather === 'sunny' ? 'active sun-active' : ''}`}
                        onClick={() => setSelectedWeather('sunny')}
                        title="Normal Sunny Clear Weather"
                    >
                        <Sun size={12}/>
                        <span>Sun</span>
                    </button>

                    <button
                        type="button"
                        className={`weather-sim-btn ${selectedWeather === 'rain' ? 'active rain-active' : ''}`}
                        onClick={() => setSelectedWeather('rain')}
                        title="Test Rain (વરસાદ) Animation"
                    >
                        <CloudRain size={12}/>
                        <span>Rain</span>
                    </button>

                    <button
                        type="button"
                        className={`weather-sim-btn ${selectedWeather === 'storm' ? 'active storm-active' : ''}`}
                        onClick={() => setSelectedWeather('storm')}
                        title="Test Tufan / Storm (વાવાઝોડું/તોફાન) Animation"
                    >
                        <CloudLightning size={12}/>
                        <span>Tufan</span>
                    </button>
                </div>
            </div>

            {/* Weather Alert Banner (If Rain or Storm active) */}
            {selectedWeather === 'rain' && (
                <div className="weather-live-banner rain-banner">
                    <CloudRain size={15} className="weather-banner-icon animate-bounce"/>
                    <span>🌧️ લાઈવ વરસાદ શરૂ છે (Rain In Progress): પેનલ પર વરસાદી પાણીથી પાવર મોનિટરિંગ સક્રિય છે.</span>
                </div>
            )}

            {selectedWeather === 'storm' && (
                <div className="weather-live-banner storm-banner">
                    <CloudLightning size={15} className="weather-banner-icon flash-icon"/>
                    <span>⛈️ વાવાઝોડું & તોફાન એલર્ટ (Storm Active): ભારે પવન અને વીજળી સુરક્ષા માટે સેફ્ટી ગ્રીડ મોડ ઓન છે.</span>
                </div>
            )}

            {/* 3D Isometric Energy Flow Canvas with Rain & Storm Lightning Animations */}
            <div className="isolar-canvas-wrapper">
                <svg
                    viewBox="0 0 420 310"
                    className={`isolar-flow-svg svg-weather-${selectedWeather}`}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <defs>
                        {/* Flow Pulse Glow Filter */}
                        <filter id="flow-glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2.5" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>

                        {/* Storm Lightning Filter */}
                        <filter id="lightning-glow" x="-30%" y="-30%" width="160%" height="160%">
                            <feGaussianBlur stdDeviation="3.5" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>

                        {/* Linear Gradient for Active Flow Stream */}
                        <linearGradient id="flow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="50%" stopColor="#60a5fa" />
                            <stop offset="100%" stopColor="#2563eb" />
                        </linearGradient>

                        {/* Panel Shading Gradients */}
                        <linearGradient id="pv-glass-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#1e293b" />
                            <stop offset="40%" stopColor="#0f172a" />
                            <stop offset="100%" stopColor="#1e3a5f" />
                        </linearGradient>

                        <linearGradient id="pv-gloss" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                        </linearGradient>

                        {/* Drop Shadows */}
                        <radialGradient id="shadow-radial" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.18" />
                            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                        </radialGradient>
                    </defs>

                    {/* ========================================================
                        1. BACKGROUND GUIDE & CONNECTION TRACKS
                        ======================================================== */}
                    {/* Building to Solar Panel Track */}
                    <path
                        d="M 85 160 L 85 92 Q 85 82 95 82 L 175 82"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />

                    {/* Building to Grid Tower Track */}
                    <path
                        d="M 160 220 L 290 220"
                        fill="none"
                        stroke="#f1f5f9"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />

                    {/* Solar Panel to Grid Tower Main Flow Track (Background) */}
                    <path
                        d="M 230 92 L 305 92 Q 320 92 320 107 L 320 190"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />

                    {/* ========================================================
                        2. ACTIVE ENERGY PULSE LASER FLOWS
                        ======================================================== */}
                    {/* Pulsing Energy Dot on Panel Output */}
                    <circle cx="286" cy="92" r="4.5" fill="#3b82f6" opacity="0.9" filter="url(#flow-glow)">
                        <animate attributeName="r" values="3.5;5.5;3.5" dur="1.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.7;1;0.7" dur="1.8s" repeatCount="indefinite" />
                    </circle>

                    {/* Animated Blue Electrical Flow Beam */}
                    <path
                        d="M 230 92 L 305 92 Q 320 92 320 107 L 320 190"
                        fill="none"
                        stroke="url(#flow-grad)"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        className="isolar-flow-laser"
                        filter="url(#flow-glow)"
                    />

                    {/* ========================================================
                        3. TOP CENTER: 3D ISOMETRIC SOLAR PV PANEL
                        ======================================================== */}
                    <g transform="translate(145, 55)">
                        {/* 3D Drop Shadow */}
                        <ellipse cx="60" cy="85" rx="55" ry="12" fill="url(#shadow-radial)" />

                        {/* Metallic Mounting Rack Post & Base */}
                        <polygon points="56,70 64,70 64,82 56,82" fill="#64748b" />
                        <polygon points="46,80 74,80 78,85 42,85" fill="#94a3b8" />
                        <line x1="60" y1="55" x2="60" y2="76" stroke="#475569" strokeWidth="4" strokeLinecap="round" />
                        <line x1="42" y1="62" x2="78" y2="62" stroke="#64748b" strokeWidth="2.5" />

                        {/* 3D Solar Panel Bezel Frame (Silver Aluminium) */}
                        <polygon
                            points="45,4 115,28 65,72 -5,48"
                            fill="#cbd5e1"
                            stroke="#94a3b8"
                            strokeWidth="1.2"
                        />

                        {/* 3D Dark Glass Monocrystalline Solar Cells Base */}
                        <polygon
                            points="46,6 113,29 64,71 -3,48"
                            fill="url(#pv-glass-grad)"
                        />

                        {/* Solar Cell Grid Lines (Horizontal Interconnects) */}
                        <line x1="33" y1="17" x2="100" y2="40" stroke="#334155" strokeWidth="0.75" />
                        <line x1="20" y1="28" x2="87" y2="51" stroke="#334155" strokeWidth="0.75" />
                        <line x1="7" y1="39" x2="74" y2="62" stroke="#334155" strokeWidth="0.75" />

                        {/* Solar Cell Grid Lines (Vertical Interconnects) */}
                        <line x1="22" y1="11" x2="-2" y2="48" stroke="#334155" strokeWidth="0.75" />
                        <line x1="40" y1="17" x2="16" y2="54" stroke="#334155" strokeWidth="0.75" />
                        <line x1="58" y1="23" x2="34" y2="60" stroke="#334155" strokeWidth="0.75" />
                        <line x1="76" y1="29" x2="52" y2="66" stroke="#334155" strokeWidth="0.75" />
                        <line x1="94" y1="35" x2="70" y2="72" stroke="#334155" strokeWidth="0.75" />

                        {/* Gloss Reflection Highlights */}
                        <polygon
                            points="46,6 90,21 35,62 -3,48"
                            fill="url(#pv-gloss)"
                        />
                    </g>

                    {/* Solar Generation Text above Panel */}
                    <g transform="translate(262, 82)">
                        <text x="0" y="0" textAnchor="start" className="isolar-mw-text-main">{realtimeMw} <tspan className="isolar-mw-unit">MW</tspan></text>
                    </g>

                    {/* ========================================================
                        4. RIGHT: 3D ISOMETRIC POWER TRANSMISSION GRID TOWER
                        ======================================================== */}
                    <g transform="translate(280, 160)">
                        {/* Tower Base Foundation Shadow */}
                        <ellipse cx="44" cy="108" rx="42" ry="12" fill="url(#shadow-radial)" />

                        {/* 3D Concrete Footing Pads */}
                        <polygon points="20,95 44,107 68,95 44,83" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="0.8" />
                        <polygon points="20,95 44,107 44,112 20,100" fill="#94a3b8" />
                        <polygon points="68,95 44,107 44,112 68,100" fill="#64748b" />

                        {/* High-Voltage Lattice Tower Structure */}
                        <line x1="26" y1="94" x2="42" y2="12" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
                        <line x1="62" y1="94" x2="46" y2="12" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                        <line x1="32" y1="90" x2="43" y2="12" stroke="#93c5fd" strokeWidth="1.5" />
                        <line x1="56" y1="90" x2="45" y2="12" stroke="#2563eb" strokeWidth="1.5" />

                        {/* Crossarms */}
                        <line x1="14" y1="26" x2="74" y2="26" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" />
                        <line x1="22" y1="46" x2="66" y2="46" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" />
                        <line x1="30" y1="68" x2="58" y2="68" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" />

                        {/* Insulator drops */}
                        <line x1="16" y1="26" x2="16" y2="35" stroke="#94a3b8" strokeWidth="1.5" />
                        <line x1="72" y1="26" x2="72" y2="35" stroke="#94a3b8" strokeWidth="1.5" />
                        <line x1="24" y1="46" x2="24" y2="54" stroke="#94a3b8" strokeWidth="1.5" />
                        <line x1="64" y1="46" x2="64" y2="54" stroke="#94a3b8" strokeWidth="1.5" />

                        {/* Lattice Cross Braces */}
                        <line x1="28" y1="84" x2="60" y2="68" stroke="#93c5fd" strokeWidth="1" />
                        <line x1="60" y1="84" x2="28" y2="68" stroke="#93c5fd" strokeWidth="1" />
                        <line x1="31" y1="68" x2="57" y2="46" stroke="#93c5fd" strokeWidth="1" />
                        <line x1="57" y1="68" x2="31" y2="46" stroke="#93c5fd" strokeWidth="1" />
                        <line x1="35" y1="46" x2="53" y2="26" stroke="#93c5fd" strokeWidth="1" />
                        <line x1="53" y1="46" x2="35" y2="26" stroke="#93c5fd" strokeWidth="1" />

                        {/* Spire Peak */}
                        <line x1="44" y1="12" x2="44" y2="2" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
                    </g>

                    {/* Grid Export Text below tower */}
                    <g transform="translate(344, 282)">
                        <text x="0" y="0" textAnchor="middle" className="isolar-mw-text-grid">{realtimeMw} <tspan className="isolar-mw-unit">MW</tspan></text>
                    </g>

                    {/* ========================================================
                        5. BOTTOM LEFT: 3D ISOMETRIC HOUSE / PLANT BUILDING
                        ======================================================== */}
                    <g transform="translate(45, 175)">
                        {/* House Shadow */}
                        <ellipse cx="48" cy="86" rx="46" ry="12" fill="url(#shadow-radial)" />

                        {/* Subtle Trees on left */}
                        <g opacity="0.85">
                            <ellipse cx="6" cy="62" rx="4" ry="7" fill="#94a3b8" />
                            <ellipse cx="16" cy="56" rx="5" ry="9" fill="#cbd5e1" />
                            <ellipse cx="26" cy="52" rx="6" ry="10" fill="#94a3b8" />
                            <line x1="6" y1="68" x2="6" y2="76" stroke="#64748b" strokeWidth="1.5" />
                            <line x1="16" y1="64" x2="16" y2="76" stroke="#64748b" strokeWidth="1.5" />
                            <line x1="26" y1="61" x2="26" y2="76" stroke="#64748b" strokeWidth="1.5" />
                        </g>

                        {/* 3D Isometric Building Structure */}
                        <polygon points="34,44 68,64 68,90 34,70" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />
                        <polygon points="68,64 106,42 106,68 68,90" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
                        
                        {/* Roof */}
                        <polygon points="30,42 50,18 84,38 64,62" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
                        <polygon points="50,18 88,0 112,28 84,38" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />

                        {/* Side Annex */}
                        <polygon points="68,70 94,55 94,76 68,91" fill="#f1f5f9" />
                        <polygon points="68,70 94,55 88,48 62,63" fill="#cbd5e1" />

                        {/* Windows & Doors */}
                        <polygon points="40,54 44,56 44,66 40,64" fill="#94a3b8" opacity="0.6" />
                        <polygon points="58,64 64,68 64,78 58,74" fill="#94a3b8" opacity="0.6" />
                        <polygon points="76,64 80,62 80,70 76,72" fill="#94a3b8" opacity="0.6" />
                    </g>

                    {/* ========================================================
                        🌧️ RAIN WEATHER ANIMATION LAYER (If Rain Active)
                        ======================================================== */}
                    {selectedWeather === 'rain' && (
                        <g className="rain-animation-layer" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" opacity="0.85">
                            {/* Falling animated rain streaks */}
                            <line x1="60" y1="20" x2="48" y2="45" className="rain-streak r-1" />
                            <line x1="120" y1="10" x2="108" y2="35" className="rain-streak r-2" />
                            <line x1="180" y1="30" x2="168" y2="55" className="rain-streak r-3" />
                            <line x1="240" y1="15" x2="228" y2="40" className="rain-streak r-4" />
                            <line x1="300" y1="25" x2="288" y2="50" className="rain-streak r-1" />
                            <line x1="360" y1="10" x2="348" y2="35" className="rain-streak r-2" />

                            <line x1="90" y1="70" x2="78" y2="95" className="rain-streak r-3" />
                            <line x1="150" y1="85" x2="138" y2="110" className="rain-streak r-4" />
                            <line x1="210" y1="75" x2="198" y2="100" className="rain-streak r-1" />
                            <line x1="270" y1="90" x2="258" y2="115" className="rain-streak r-2" />
                            <line x1="330" y1="80" x2="318" y2="105" className="rain-streak r-3" />

                            <line x1="70" y1="140" x2="58" y2="165" className="rain-streak r-4" />
                            <line x1="130" y1="150" x2="118" y2="175" className="rain-streak r-1" />
                            <line x1="200" y1="145" x2="188" y2="170" className="rain-streak r-2" />
                            <line x1="260" y1="160" x2="248" y2="185" className="rain-streak r-3" />
                            <line x1="320" y1="150" x2="308" y2="175" className="rain-streak r-4" />
                        </g>
                    )}

                    {/* ========================================================
                        ⛈️ STORM / TUFAN ANIMATION LAYER (If Storm Active)
                        ======================================================== */}
                    {selectedWeather === 'storm' && (
                        <g className="storm-animation-layer">
                            {/* Flashing Lightning Bolt 1 */}
                            <path
                                d="M 120 15 L 105 55 L 115 58 L 95 105"
                                fill="none"
                                stroke="#fbbf24"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="lightning-bolt-anim l-1"
                                filter="url(#lightning-glow)"
                            />

                            {/* Flashing Lightning Bolt 2 (Near Grid Tower) */}
                            <path
                                d="M 290 10 L 275 45 L 285 48 L 265 90"
                                fill="none"
                                stroke="#a855f7"
                                strokeWidth="2.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="lightning-bolt-anim l-2"
                                filter="url(#lightning-glow)"
                            />

                            {/* Heavy Wind & Rain Streaks */}
                            <g stroke="#93c5fd" strokeWidth="2.2" opacity="0.9">
                                <line x1="80" y1="40" x2="40" y2="80" className="storm-wind-streak" />
                                <line x1="160" y1="30" x2="120" y2="70" className="storm-wind-streak" />
                                <line x1="240" y1="50" x2="200" y2="90" className="storm-wind-streak" />
                                <line x1="320" y1="40" x2="280" y2="80" className="storm-wind-streak" />
                                <line x1="100" y1="110" x2="60" y2="150" className="storm-wind-streak" />
                                <line x1="220" y1="120" x2="180" y2="160" className="storm-wind-streak" />
                            </g>
                        </g>
                    )}
                </svg>
            </div>

            {/* Bottom 3 Column KPI Stats Divider (Clean, Compact, Normal Font Sizes) */}
            <div className="isolar-kpi-footer">
                <div className="isolar-kpi-col">
                    <span className="isolar-kpi-label">Real-time power(MW)</span>
                    <strong className="isolar-kpi-num">{realtimeMw}</strong>
                    <small className="isolar-kpi-sub">{realtimeKw} kW</small>
                </div>

                <div className="isolar-kpi-col isolar-kpi-col-center">
                    <span className="isolar-kpi-label">Today's Total Units</span>
                    <strong className="isolar-kpi-num highlight-units">{todayKwh} <span className="unit-tag">kWh</span></strong>
                    {!isEmployee ? (
                        <small className="isolar-kpi-sub revenue-sub">Revenue: ₹ {revenueRs}</small>
                    ) : (
                        <small className="isolar-kpi-sub">Total Units Today</small>
                    )}
                </div>

                <div className="isolar-kpi-col">
                    <span className="isolar-kpi-label">Installed power(MWp)</span>
                    <strong className="isolar-kpi-num">{installedMwp} <span className="unit-tag">MWp</span></strong>
                    <small className="isolar-kpi-sub">{onlineCount} / {totalInverters} Online</small>
                </div>
            </div>
        </section>
    );
}
