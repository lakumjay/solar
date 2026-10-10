import React, { useState } from 'react';
import { RefreshCw, Home, Copy, Check, AlertTriangle, ChevronDown, ChevronUp, Terminal } from 'lucide-react';

export default function ErrorWireCut({
    error,
    errorInfo,
    onRetry,
    title = 'અરેરે! કનેક્શન વાયર કપાઈ ગયો લાગે છે!',
    subtitle = 'Oops! Connection wire is cut or communication with server stopped.',
    fullScreen = true
}) {
    const [copied, setCopied] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    const errorMessage = typeof error === 'string' 
        ? error 
        : error?.message || 'અણધારી ખામી (Unexpected Error) સર્જાઈ છે.';

    const technicalDetails = error?.stack || (errorInfo?.componentStack ? errorInfo.componentStack : (typeof error === 'object' ? JSON.stringify(error, null, 2) : 'No stack trace available'));

    const handleCopy = () => {
        try {
            navigator.clipboard.writeText(`Error: ${errorMessage}\n\nTechnical Details:\n${technicalDetails}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch (_) {}
    };

    return (
        <div className={`wire-cut-error-container ${fullScreen ? 'full-screen' : 'inline'}`}>
            <div className="wire-cut-card">
                
                {/* Looping Cat & Spark Wire Animation */}
                <div className="wire-cut-scene">
                    <svg viewBox="0 0 420 220" className="wire-cut-svg" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            {/* Electric Spark Gradient */}
                            <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#fef08a" />
                                <stop offset="50%" stopColor="#f59e0b" />
                                <stop offset="100%" stopColor="#ef4444" />
                            </linearGradient>

                            {/* Severed Cable Gradient Left */}
                            <linearGradient id="cableGradLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#1e293b" />
                                <stop offset="100%" stopColor="#334155" />
                            </linearGradient>

                            {/* Glow Filter for Sparks */}
                            <filter id="electricGlow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="3" result="blur" />
                                <feMerge>
                                    <feMergeNode in="blur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* Ground shadow */}
                        <ellipse cx="210" cy="195" rx="170" ry="12" fill="rgba(0,0,0,0.08)" />

                        {/* Left Cable (Connected to wall/source, now hanging loose) */}
                        <path 
                            d="M 10 130 C 60 130, 80 160, 140 162" 
                            stroke="url(#cableGradLeft)" 
                            strokeWidth="10" 
                            strokeLinecap="round" 
                            fill="none" 
                        />
                        {/* Exposed Copper Wires on Left */}
                        <path d="M 140 162 L 152 158" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
                        <path d="M 140 162 L 154 163" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
                        <path d="M 140 162 L 151 167" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />

                        {/* Right Cable (Severed other half) */}
                        <path 
                            d="M 270 164 C 330 160, 350 130, 410 130" 
                            stroke="url(#cableGradLeft)" 
                            strokeWidth="10" 
                            strokeLinecap="round" 
                            fill="none" 
                        />
                        {/* Exposed Copper Wires on Right */}
                        <path d="M 270 164 L 258 160" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
                        <path d="M 270 164 L 256 165" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
                        <path d="M 270 164 L 259 170" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />

                        {/* Sparking Electricity Arcs across the gap */}
                        <g className="electric-sparks" filter="url(#electricGlow)">
                            <path 
                                className="spark-bolt spark-1" 
                                d="M 152 158 Q 185 145 205 162 T 258 160" 
                                fill="none" 
                                stroke="#fef08a" 
                                strokeWidth="3.5" 
                                strokeLinecap="round" 
                            />
                            <path 
                                className="spark-bolt spark-2" 
                                d="M 154 163 Q 200 178 220 152 T 256 165" 
                                fill="none" 
                                stroke="#38bdf8" 
                                strokeWidth="2.5" 
                                strokeLinecap="round" 
                            />
                            <polygon className="spark-star spark-s1" points="200,150 204,158 212,160 204,162 200,170 196,162 188,160 196,158" fill="#fbbf24" />
                            <polygon className="spark-star spark-s2" points="175,165 178,170 184,171 178,173 175,178 172,173 166,171 172,170" fill="#f43f5e" />
                            <polygon className="spark-star spark-s3" points="235,155 237,159 242,160 237,162 235,166 233,162 228,160 233,159" fill="#38bdf8" />
                        </g>

                        {/* Mischievous Cute Cat (Sitting innocently near cut cable) */}
                        <g className="cute-cat" transform="translate(160, 48)">
                            {/* Cat Tail (Wagging) */}
                            <path 
                                className="cat-tail" 
                                d="M 75 110 C 95 105, 105 70, 95 50" 
                                stroke="#f97316" 
                                strokeWidth="8" 
                                strokeLinecap="round" 
                                fill="none" 
                            />

                            {/* Cat Body */}
                            <ellipse cx="48" cy="98" rx="36" ry="26" fill="#fb923c" />
                            <ellipse cx="48" cy="98" rx="22" ry="17" fill="#fed7aa" />

                            {/* Back Paw */}
                            <ellipse cx="20" cy="116" rx="10" ry="6" fill="#ea580c" />
                            <ellipse cx="74" cy="116" rx="10" ry="6" fill="#ea580c" />

                            {/* Front Paws (resting near ground) */}
                            <ellipse cx="38" cy="118" rx="8" ry="5" fill="#ffedd5" />
                            <ellipse cx="58" cy="118" rx="8" ry="5" fill="#ffedd5" />

                            {/* Cat Head */}
                            <circle cx="48" cy="56" r="26" fill="#fb923c" />

                            {/* Ears */}
                            <polygon points="26,42 32,16 45,34" fill="#fb923c" />
                            <polygon points="30,38 33,22 42,34" fill="#fda4af" />
                            <polygon points="70,42 64,16 51,34" fill="#fb923c" />
                            <polygon points="66,38 63,22 54,34" fill="#fda4af" />

                            {/* Eyes (Mischievous / Blinking) */}
                            <g className="cat-eyes">
                                <ellipse cx="38" cy="54" rx="4.5" ry="6" fill="#0f172a" />
                                <circle cx="39.5" cy="52" r="2" fill="#ffffff" />
                                <ellipse cx="58" cy="54" rx="4.5" ry="6" fill="#0f172a" />
                                <circle cx="59.5" cy="52" r="2" fill="#ffffff" />
                            </g>

                            {/* Cute Cat Nose & Mouth */}
                            <polygon points="46,62 50,62 48,65" fill="#fda4af" />
                            <path d="M 44 66 Q 48 70 48 66 Q 48 70 52 66" stroke="#475569" strokeWidth="1.8" fill="none" strokeLinecap="round" />

                            {/* Whiskers */}
                            <line x1="22" y1="62" x2="10" y2="59" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
                            <line x1="22" y1="66" x2="11" y2="67" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
                            <line x1="74" y1="62" x2="86" y2="59" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
                            <line x1="74" y1="66" x2="85" y2="67" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />

                            {/* Small innocent tooth / chewing crumb */}
                            <polygon points="47,67 49,67 48,70" fill="#ffffff" />
                        </g>

                        {/* Floating Question / Oops marks */}
                        <g className="oops-bubble">
                            <text x="260" y="45" fill="#ef4444" fontSize="18" fontWeight="bold" fontFamily="system-ui">⚡ Oops!</text>
                        </g>
                    </svg>
                </div>

                {/* Text Content */}
                <div className="wire-cut-content">
                    <div className="wire-cut-badge">
                        <AlertTriangle size={15} />
                        <span>કનેક્શન લોસ / વાયર કટ એરર</span>
                    </div>

                    <h2 className="wire-cut-title">{title}</h2>
                    <p className="wire-cut-subtitle">{subtitle}</p>

                    <div className="wire-cut-error-box">
                        <span className="error-box-label">એરર વિગત (Reason):</span>
                        <code className="error-box-message">{errorMessage}</code>
                    </div>

                    {/* Action Buttons */}
                    <div className="wire-cut-actions">
                        {onRetry && (
                            <button type="button" className="btn-retry" onClick={onRetry}>
                                <RefreshCw size={17} />
                                <span>ફરી પ્રયાસ કરો (Retry)</span>
                            </button>
                        )}

                        <button 
                            type="button" 
                            className="btn-secondary-action" 
                            onClick={() => {
                                if (typeof window !== 'undefined') {
                                    window.location.href = '/';
                                }
                            }}
                        >
                            <Home size={17} />
                            <span>ડેશબોર્ડ પર જાઓ</span>
                        </button>

                        <button type="button" className="btn-copy-error" onClick={handleCopy}>
                            {copied ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
                            <span>{copied ? 'કોપી થઈ ગયું!' : 'એરર કોપી કરો'}</span>
                        </button>
                    </div>

                    {/* Collapsible Technical Diagnostics */}
                    <div className="wire-cut-tech-details">
                        <button 
                            type="button" 
                            className="btn-toggle-tech" 
                            onClick={() => setShowDetails(!showDetails)}
                        >
                            <span className="flex-row items-center gap-1">
                                <Terminal size={14} />
                                <span>ટેકનિકલ સિસ્ટમ વિગત (Technical Stack)</span>
                            </span>
                            {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>

                        {showDetails && (
                            <pre className="tech-stack-box">
                                {technicalDetails}
                            </pre>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

// React Error Boundary Wrapper
export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        if (this.props.onReset) {
            this.props.onReset();
        } else {
            window.location.reload();
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <ErrorWireCut 
                    error={this.state.error} 
                    errorInfo={this.state.errorInfo} 
                    onRetry={this.handleRetry} 
                    fullScreen={this.props.fullScreen ?? true}
                />
            );
        }
        return this.props.children;
    }
}
