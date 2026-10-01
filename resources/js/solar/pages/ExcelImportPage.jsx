import React, {useState} from 'react';
import {FileSpreadsheet, Upload} from 'lucide-react';
import {api} from '../api';

export default function ExcelImportPage() {
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const submit = async event => {
        event.preventDefault();
        if (!file) return;
        setBusy(true);
        setResult(null);
        try {
            const form = new FormData();
            form.append('file', file);
            setResult({type: 'success', ...await api('import/excel', {method: 'POST', body: form})});
        } catch (error) {
            setResult({type: 'error', message: error.message});
        } finally {
            setBusy(false);
        }
    };

    return <div className="import-layout"><form className="panel import-card" onSubmit={submit}><div className="upload-mark"><Upload/></div><h2>Import legacy Excel workbook</h2><p>Upload an .xlsx or .xls file. Sheet names are matched to company names. The importer reads dates, inverter generation and raw meter readings, then recalculates units using the four multipliers saved in each company profile.</p><label className="file-drop"><input type="file" accept=".xlsx,.xls" onChange={event => setFile(event.target.files[0] || null)}/><FileSpreadsheet/><span>{file ? file.name : 'Choose Excel workbook'}</span><small>Maximum file size: 20 MB</small></label><button className="primary" disabled={!file || busy}>{busy ? 'Importing and recalculating…' : 'Import workbook'}</button>{result && <div className={result.type === 'success' ? 'success' : 'error'}><b>{result.message}</b>{result.details && <ul>{result.details.map(item => <li key={item}>{item}</li>)}</ul>}</div>}</form><section className="panel import-help"><h2>Import rules</h2><ol><li>Company names must match existing company profiles.</li><li>Rows without a date or any readings are skipped.</li><li>Existing entries for the same company and date are updated.</li><li>Excel unit formulas are ignored; SolarFlow recalculates units from raw readings.</li><li>Missing meter columns stay unchanged on existing records.</li></ol></section></div>;
}
