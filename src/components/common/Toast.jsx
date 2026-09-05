import React, { useState, useCallback, createContext, useContext } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const icons = { success: <CheckCircle size={16} />, error: <XCircle size={16} />, info: <Info size={16} /> };

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            {icons[t.type]}<span>{t.message}</span><button className="toast-close" aria-label="Dismiss notification" onClick={() => setToasts(prev => prev.filter(row => row.id !== t.id))}><X size={14}/></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
