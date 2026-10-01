export const number = value => Number(value || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});

export const fixedTwo = value => value === '' || value === null || value === undefined
    ? ''
    : Number(value).toFixed(2);

export const shortDate = value => value ? new Date(value).toLocaleDateString('en-GB') : '—';
