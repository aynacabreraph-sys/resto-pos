import React, { useState, useEffect } from 'react';
import { LogOut, Bell, Menu } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { useLocation } from 'react-router-dom';

const pageTitles = {
  '/': 'Dashboard', '/pos': 'Point of Sale', '/products': 'Product Management',
  '/inventory': 'Inventory', '/ingredients': 'Ingredients', '/time-tracking': 'Time Tracking',
  '/cash': 'Cash Drawer', '/reports': 'Business Report', '/transactions': 'Transaction Report',
  '/voids': 'Void Log', '/staff': 'Staff Management', '/audit': 'Audit Log', '/maintenance': 'Maintenance',
};

export default function Header() {
  const { currentStaff, logout } = useAuthStore();
  const { toggleMobileMenu } = useUiStore();
  const location = useLocation();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const title = pageTitles[location.pathname] || 'Dashboard';

  return (
    <header className="header">
      <div className="header-left">
        <button className="btn btn-ghost btn-icon menu-toggle" onClick={toggleMobileMenu}>
          <Menu size={20} />
        </button>
        <h2>{title}</h2>
      </div>
      <div className="header-right">
        <span className="header-clock">
          {time.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })} • {time.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
        </span>
        {currentStaff && (
          <div className="header-staff">
            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{currentStaff.name}</span>
            <span className="role-badge">{currentStaff.role}</span>
          </div>
        )}
        <button className="btn btn-ghost btn-icon" onClick={logout} title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
