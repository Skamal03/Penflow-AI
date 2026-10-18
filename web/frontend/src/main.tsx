import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from './lib/session';
import { AppRouter } from './router';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SessionProvider>
        <AppRouter />
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
