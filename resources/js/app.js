import './bootstrap';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './solar/App';
import ErrorBoundary from './solar/components/ErrorBoundary';

createRoot(document.getElementById('app')).render(
    React.createElement(ErrorBoundary, null, React.createElement(App))
);
