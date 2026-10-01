import './bootstrap';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './solar/App';

createRoot(document.getElementById('app')).render(React.createElement(App));
