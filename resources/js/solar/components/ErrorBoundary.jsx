import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getLanguage } from '../utils/translations';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('SolarFlow Uncaught App Error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReload = () => {
        window.localStorage.removeItem('solar_notif_cleared_date');
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                    background: '#f8fafc',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                    <div style={{
                        maxWidth: '460px',
                        width: '100%',
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '28px 24px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                        textAlign: 'center',
                        border: '1px solid #e2e8f0'
                    }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            background: '#fee2e2',
                            color: '#dc2626',
                            display: 'grid',
                            placeItems: 'center',
                            margin: '0 auto 16px'
                        }}>
                            <AlertTriangle size={30}/>
                        </div>

                        <h2 style={{fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px'}}>
                            {getLanguage() === 'en' ? 'Application Loading Issue' : 'એપ્લિકેશનમાં લોડિંગ સમસ્યા આવી'}
                        </h2>

                        <p style={{fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.5}}>
                            {getLanguage() === 'en' ? 'This might be due to browser caching after an update. Please reload using the button below.' : 'નવા અપડેટ પછી બ્રાઉઝર કેશ અથવા ડેટાના કારણે આ થઈ શકે છે. નીચેનું બટન દબાવીને રિફ્રેશ કરો.'}
                        </p>

                        {this.state.error && (
                            <div style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                fontSize: '11.5px',
                                color: '#991b1b',
                                textAlign: 'left',
                                marginBottom: '20px',
                                wordBreak: 'break-word',
                                maxHeight: '100px',
                                overflowY: 'auto'
                            }}>
                                {this.state.error.toString()}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={this.handleReload}
                            style={{
                                width: '100%',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                background: 'linear-gradient(135deg, #15803d, #166534)',
                                color: '#ffffff',
                                border: 'none',
                                padding: '12px 20px',
                                borderRadius: '10px',
                                fontSize: '14px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(21, 128, 61, 0.25)'
                            }}
                        >
                            <RefreshCw size={16}/>
                            {getLanguage() === 'en' ? 'Reload Application' : 'સાઇટ રિફ્રેશ કરો (Reload App)'}
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
