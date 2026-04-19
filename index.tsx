
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminPanel from './components/AdminPanel';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Simple Routing Check
const params = new URLSearchParams(window.location.search);
const isAdmin = params.get('mode') === 'admin';

root.render(
  <React.StrictMode>
    {isAdmin ? <AdminPanel /> : <App />}
  </React.StrictMode>
);
