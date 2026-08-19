import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { ToastProvider } from './components/common/Toast';
import { seedDatabase } from './utils/seedData';
import MainLayout from './components/layout/MainLayout';
import LoginScreen from './pages/LoginScreen';
import Dashboard from './pages/Dashboard';
import PointOfSale from './pages/PointOfSale';
import ProductManagement from './pages/ProductManagement';
import Inventory from './pages/Inventory';
import Ingredients from './pages/Ingredients';
import TimeTracking from './pages/TimeTracking';
import CashManagement from './pages/CashManagement';
import BusinessReport from './pages/BusinessReport';
import TransactionReport from './pages/TransactionReport';
import VoidLog from './pages/VoidLog';
import StaffManagement from './pages/StaffManagement';
import AuditLog from './pages/AuditLog';
import Maintenance from './pages/Maintenance';
import { branding } from './config/branding';

export default function App() {
  const currentStaff = useAuthStore(s => s.currentStaff);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedDatabase().then(() => setReady(true));
  }, []);

  if (!ready) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--accent)', fontFamily: 'Playfair Display, serif', fontSize: '1.5rem' }}>
      Loading {branding.appName}...
    </div>
  );

  if (!currentStaff) return (
    <ToastProvider><LoginScreen /></ToastProvider>
  );

  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pos" element={<PointOfSale />} />
            <Route path="/products" element={<ProductManagement />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/ingredients" element={<Ingredients />} />
            <Route path="/time-tracking" element={<TimeTracking />} />
            <Route path="/cash" element={<CashManagement />} />
            <Route path="/reports" element={<BusinessReport />} />
            <Route path="/transactions" element={<TransactionReport />} />
            <Route path="/voids" element={<VoidLog />} />
            <Route path="/staff" element={<StaffManagement />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/maintenance" element={<Maintenance />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}
