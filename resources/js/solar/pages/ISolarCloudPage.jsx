import React, {useEffect, useState} from 'react';
import {CheckCircle2, CloudSun, ExternalLink, Key, KeyRound, Radio, RefreshCw, ShieldAlert, Sparkles, Zap} from 'lucide-react';
import {api} from '../api';
import {Empty} from '../components/Common';

export default function ISolarCloudPage({company, companies, user}) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(null);
    const [manualCode, setManualCode] = useState('');
    const [manualToken, setManualToken] = useState('');
    const [manualRefreshToken, setManualRefreshToken] = useState('');
    const [selectedCompanyId, setSelectedCompanyId] = useState(company?.id || companies[0]?.id || '');
    const [liveData, setLiveData] = useState(null);
    const [fetchingLive, setFetchingLive] = useState(false);
    const [submittingManual, setSubmittingManual] = useState(false);

    const loadStatus = async () => {
        try {
            setLoading(true);
            const data = await api('isolarcloud/status');
            setStatus(data);
        } catch (err) {
            setMessage({type: 'error', text: err.message});
        } finally {
            setLoading(false);
        }
    };

    const fetchLiveTelemetry = async () => {
        if (!selectedCompanyId) return;
        setFetchingLive(true);
        setMessage(null);
        try {
            const result = await api(`isolarcloud/live?company_id=${selectedCompanyId}`);
            setLiveData(result);
            if (!result.success) {
                setMessage({type: 'error', text: result.message || result.error});
            } else {
                setMessage({type: 'success', text: `Loaded live data for ${result.devices?.length || 0} inverters.`});
            }
        } catch (err) {
            setMessage({type: 'error', text: err.message});
        } finally {
            setFetchingLive(false);
        }
    };

    useEffect(() => {
        loadStatus();
    }, []);

    useEffect(() => {
        if (selectedCompanyId) {
            fetchLiveTelemetry();
        }
    }, [selectedCompanyId]);

    const handleSaveManual = async e => {
        e.preventDefault();
        setSubmittingManual(true);
        setMessage(null);
        try {
            const payload = {};
            if (manualCode.trim()) payload.code = manualCode.trim();
            if (manualToken.trim()) payload.access_token = manualToken.trim();
            if (manualRefreshToken.trim()) payload.refresh_token = manualRefreshToken.trim();

            const res = await api('isolarcloud/manual-token', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            setMessage({type: 'success', text: res.message || 'Token saved successfully!'});
            setManualCode('');
            setManualToken('');
            setManualRefreshToken('');
            await loadStatus();
            fetchLiveTelemetry();
        } catch (err) {
            setMessage({type: 'error', text: err.message});
        } finally {
            setSubmittingManual(false);
        }
    };

    const openAuthorization = () => {
        if (status?.auth_url) {
            window.open(status.auth_url, '_blank', 'width=800,height=700');
        }
    };

    const activeCompanyObj = companies.find(c => String(c.id) === String(selectedCompanyId));

    return (
        <div className="isolarcloud-page">
            {message && (
                <div className={`info-banner ${message.type === 'error' ? 'error' : ''}`}>
                    {message.text}
                </div>
            )}

            {/* Connection Status Card */}
            <section className="panel">
                <div className="panel-head">
                    <div>
                        <p className="step">SUNGROW OPENAPI</p>
                        <h2>iSolarCloud Connection Status</h2>
                        <p>Authenticate with Sungrow OAuth 2.0 to sync daily generation readings directly.</p>
                    </div>
                    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                        <button type="button" className="secondary" onClick={loadStatus} disabled={loading}>
                            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh Status
                        </button>
                        <button type="button" className="primary" onClick={openAuthorization}>
                            <ExternalLink size={16} /> Connect iSolarCloud
                        </button>
                    </div>
                </div>

                <div className="form-grid" style={{marginTop: '16px'}}>
                    <div className="field">
                        <label>Status</label>
                        <div>
                            {status?.connected ? (
                                <span className="status on" style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px'}}>
                                    <CheckCircle2 size={16}/> Connected & Ready
                                </span>
                            ) : (
                                <span className="status" style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#fee2e2', color: '#991b1b'}}>
                                    <ShieldAlert size={16}/> {status?.is_expired ? 'Expired / Disconnected' : 'Not Connected'}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="field">
                        <label>Token Expiry</label>
                        <div style={{fontWeight: 600, paddingTop: '8px'}}>
                            {status?.expires_in_human || 'No token active'}
                        </div>
                    </div>

                    <div className="field">
                        <label>Configured AppKey</label>
                        <div style={{fontFamily: 'monospace', fontSize: '13px', paddingTop: '8px'}}>
                            {status?.app_key || '—'}
                        </div>
                    </div>

                    <div className="field">
                        <label>Redirect URI</label>
                        <div style={{fontFamily: 'monospace', fontSize: '13px', paddingTop: '8px', wordBreak: 'break-all'}}>
                            {status?.redirect_uri || '—'}
                        </div>
                    </div>
                </div>

                {status?.auth_ps_list && status.auth_ps_list.length > 0 && (
                    <div style={{marginTop: '12px', fontSize: '14px', color: '#475569'}}>
                        Authorized Power Station IDs: <b>{status.auth_ps_list.join(', ')}</b>
                    </div>
                )}
            </section>

            {/* Live Inverter Telemetry */}
            <section className="panel" style={{marginTop: '24px'}}>
                <div className="panel-head">
                    <div>
                        <p className="step">TELEMETRY & MAPPING</p>
                        <h2>Live Inverter Telemetry</h2>
                        <p>View real-time values from Sungrow iSolarCloud for inverters with mapped Serial Numbers.</p>
                    </div>
                    <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
                        <select
                            value={selectedCompanyId}
                            onChange={e => setSelectedCompanyId(e.target.value)}
                            style={{padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1'}}
                        >
                            {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <button type="button" className="secondary" onClick={fetchLiveTelemetry} disabled={fetchingLive}>
                            <RefreshCw size={16} className={fetchingLive ? 'spin' : ''}/> Fetch Live
                        </button>
                    </div>
                </div>

                {activeCompanyObj && (
                    <div style={{marginTop: '16px'}}>
                        {liveData?.devices && liveData.devices.length > 0 ? (
                            <div className="table-responsive">
                                <table className="data-table" style={{width: '100%', textAlign: 'left', borderCollapse: 'collapse'}}>
                                    <thead>
                                        <tr style={{borderBottom: '2px solid #e2e8f0', background: '#f8fafc'}}>
                                            <th style={{padding: '10px'}}>Inverter (System)</th>
                                            <th style={{padding: '10px'}}>Serial Number</th>
                                            <th style={{padding: '10px'}}>Sungrow Device</th>
                                            <th style={{padding: '10px'}}>Status</th>
                                            <th style={{padding: '10px'}}>Grid Run Time (h)</th>
                                            <th style={{padding: '10px'}}>Power / Gen (p3)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {liveData.devices.map(dev => (
                                            <tr key={dev.inverter_id} style={{borderBottom: '1px solid #e2e8f0'}}>
                                                <td style={{padding: '10px', fontWeight: 600}}>{dev.inverter_name}</td>
                                                <td style={{padding: '10px', fontFamily: 'monospace'}}>{dev.serial_number}</td>
                                                <td style={{padding: '10px'}}>{dev.device_name || '—'}</td>
                                                <td style={{padding: '10px'}}>
                                                    {dev.dev_status === 1 ? (
                                                        <span className="status on">Normal</span>
                                                    ) : (
                                                        <span className="status">Status {dev.dev_status}</span>
                                                    )}
                                                </td>
                                                <td style={{padding: '10px'}}>{dev.p1 || '—'}</td>
                                                <td style={{padding: '10px', fontWeight: 600, color: '#047857'}}>{dev.p3 || '—'} kWh</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', color: '#64748b'}}>
                                <Radio size={32} style={{margin: '0 auto 8px', opacity: 0.5}} />
                                <p>No telemetry available yet for {activeCompanyObj.name}.</p>
                                <small>Make sure active inverters have their Serial Number (device_sn, e.g. I2640800649) saved in Company configuration, and iSolarCloud is connected.</small>
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* Manual Token Exchange Form */}
            <section className="panel" style={{marginTop: '24px'}}>
                <div className="panel-head">
                    <div>
                        <p className="step">DIRECT TOKEN / CODE</p>
                        <h2>Manual Token / Authorization Code</h2>
                        <p>If testing on localhost or using Postman, you can paste the OAuth code or access token directly here.</p>
                    </div>
                </div>

                <form onSubmit={handleSaveManual} style={{marginTop: '16px'}}>
                    <div className="form-grid">
                        <div className="field">
                            <label>OAuth Authorization Code (from callback URL ?code=...)</label>
                            <input
                                value={manualCode}
                                onChange={e => setManualCode(e.target.value)}
                            />
                        </div>

                        <div className="field">
                            <label>Or Direct Access Token (from Postman)</label>
                            <input
                                value={manualToken}
                                onChange={e => setManualToken(e.target.value)}
                            />
                        </div>

                        <div className="field">
                            <label>Refresh Token (optional)</label>
                            <input
                                value={manualRefreshToken}
                                onChange={e => setManualRefreshToken(e.target.value)}
                            />
                        </div>
                    </div>

                    <div style={{marginTop: '16px', display: 'flex', justifyContent: 'flex-end'}}>
                        <button type="submit" className="primary" disabled={submittingManual || (!manualCode.trim() && !manualToken.trim())}>
                            <KeyRound size={16} /> Save Token / Exchange Code
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}
