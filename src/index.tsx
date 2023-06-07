import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { Buffer } from 'buffer';
// @ts-ignore
window.Buffer = Buffer;

const root = ReactDOM.createRoot(document.getElementById('wai_root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
