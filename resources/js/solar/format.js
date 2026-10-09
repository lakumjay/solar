export const number = value => Number(value || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});

import { getLanguage } from './utils/translations';

export const indianAmount = value => {
    const n = Number(value || 0);
    if (n === 0) return '';
    const isEn = getLanguage() === 'en';
    if (n >= 10000000) return `${(n / 10000000).toFixed(2).replace(/\.?0+$/, '')} ${isEn ? 'Cr' : 'કરોડ'}`;
    if (n >= 100000) return `${(n / 100000).toFixed(2).replace(/\.?0+$/, '')} ${isEn ? 'Lakh' : 'લાખ'}`;
    if (n >= 1000) return `${(n / 1000).toFixed(2).replace(/\.?0+$/, '')} ${isEn ? 'k' : 'હજાર'}`;
    return `₹${n.toLocaleString('en-IN')}`;
};

export const fixedTwo = value => value === '' || value === null || value === undefined
    ? ''
    : Number(value).toFixed(2);

export const shortDate = value => value ? new Date(value).toLocaleDateString('en-GB') : '—';
