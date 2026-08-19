import React, { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import db from '../db/database';
import { branding } from '../config/branding';

export default function LoginScreen() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const login = useAuthStore(s => s.login);

  const submitPin = useCallback(async (value) => {
    if (value.length !== 6) return;
    const staff = await db.staff.where('pin').equals(value).first();
    if (staff?.role === 'staff') {
      setError('This profile is for time tracking only');
      setTimeout(() => { setPin(''); setError(''); }, 1200);
    } else if (staff) { login(staff); }
    else { setError('Invalid PIN'); setTimeout(() => { setPin(''); setError(''); }, 1000); }
  }, [login]);

  const handleKey = useCallback(async (key) => {
    if (key === 'clear') { setPin(''); setError(''); return; }
    if (key === 'back') { setPin(p => p.slice(0, -1)); setError(''); return; }
    if (key === 'submit') { await submitPin(pin); return; }
    if (!/^\d$/.test(key) || pin.length >= 6) return;

    const newPin = pin + key;
    setPin(newPin);
    if (newPin.length === 6) {
      const staff = await db.staff.where('pin').equals(newPin).first();
      if (staff?.role === 'staff') {
        setError('This profile is for time tracking only');
        setTimeout(() => { setPin(''); setError(''); }, 1200);
      } else if (staff) { login(staff); }
      else { setError('Invalid PIN'); setTimeout(() => { setPin(''); setError(''); }, 1000); }
    }
  }, [login, pin, submitPin]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        handleKey(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        handleKey('back');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        handleKey('clear');
      } else if (event.key === 'Enter') {
        event.preventDefault();
        handleKey('submit');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKey]);

  const keys = ['1','2','3','4','5','6','7','8','9','clear','0','back'];

  return (
    <div className="login-screen">
      <div className="login-card">
        <div style={{ marginBottom: 8 }}>
          <div className="logo-icon login-logo">{branding.logoShort}</div>
        </div>
        <h1>{branding.appName}</h1>
        <p>Enter your PIN to clock in</p>
        <div className="pin-display">{pin.split('').map(() => '●').join(' ') || '○ ○ ○ ○ ○ ○'}</div>
        {error && <p style={{ color: 'var(--danger)', marginBottom: 16, fontSize: '0.85rem' }}>{error}</p>}
        <div className="pin-pad">
          {keys.map(k => (
            <button key={k} className="pin-key" onClick={() => handleKey(k)}>
              {k === 'clear' ? 'C' : k === 'back' ? '←' : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
