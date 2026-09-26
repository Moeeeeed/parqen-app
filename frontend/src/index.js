import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { captureReferralFromUrl } from './utils/referral';

// Safely handle benign third-party rejections (Google GSI / OneSignal / Extension scripts)
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = typeof reason === 'string' ? reason : (reason?.message || reason?.type || JSON.stringify(reason) || '');
    if (
      msg.includes('gsi') ||
      msg.includes('google') ||
      msg.includes('OneSignal') ||
      msg.includes('client_id') ||
      msg.includes('id_token')
    ) {
      console.warn('[SDK Notice Handled]:', reason);
      event.preventDefault();
    }
  });
}

// Remember an affiliate link (?ref=code) the moment someone lands, on any page,
// so the code is still there when they get to the signup form.
if (typeof window !== 'undefined') captureReferralFromUrl(window.location.search);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <App />
);

serviceWorkerRegistration.register();
