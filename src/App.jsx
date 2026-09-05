import React, { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { ToastProvider } from './components/common/Toast';
import { seedDatabase } from './utils/seedData';
import MainLayout from './components/layout/MainLayout';
import LoginScreen from './pages/LoginScreen';
import { branding } from './config/branding';
import { ensureDeviceSession } from './db/database';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const PointOfSale = lazy(() => import('./pages/PointOfSale'));
const ProductManagement = lazy(() => import('./pages/ProductManagement'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Ingredients = lazy(() => import('./pages/Ingredients'));
const TimeTracking = lazy(() => import('./pages/TimeTracking'));
const CashManagement = lazy(() => import('./pages/CashManagement'));
const BusinessReport = lazy(() => import('./pages/BusinessReport'));
const TransactionReport = lazy(() => import('./pages/TransactionReport'));
const VoidLog = lazy(() => import('./pages/VoidLog'));
const StaffManagement = lazy(() => import('./pages/StaffManagement'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Maintenance = lazy(() => import('./pages/Maintenance'));

function LoadingScreen({ message = 'Loading…' }) { return <div className="app-loading" role="status">{message}</div>; }
function RoleRoute({ roles, children }) {
  const role = useAuthStore(state => state.currentStaff?.role);
  return roles.includes(role) ? children : <Navigate to="/" replace/>;
}

export default function App() {
  const currentStaff = useAuthStore(s => s.currentStaff);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState('');

  useEffect(() => {
    ensureDeviceSession().then(seedDatabase).then(() => setReady(true)).catch(error => setStartupError(error?.message || 'Could not initialize the application.'));
  }, []);

  if (startupError) return <div className="startup-error" role="alert"><h1>Unable to start {branding.appName}</h1><p>{startupError}</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button></div>;
  if (!ready) return <LoadingScreen message={`Loading ${branding.appName}…`}/>;

  if (!currentStaff) return (
    <ToastProvider><LoginScreen /></ToastProvider>
  );

  return (
    <ToastProvider>
      <HashRouter><Suspense fallback={<LoadingScreen/>}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pos" element={<PointOfSale />} />
            <Route path="/products" element={<RoleRoute roles={['owner']}><ProductManagement /></RoleRoute>} />
            <Route path="/inventory" element={<RoleRoute roles={['owner']}><Inventory /></RoleRoute>} />
            <Route path="/ingredients" element={<RoleRoute roles={['owner']}><Ingredients /></RoleRoute>} />
            <Route path="/time-tracking" element={<TimeTracking />} />
            <Route path="/cash" element={<CashManagement />} />
            <Route path="/reports" element={<RoleRoute roles={['owner']}><BusinessReport /></RoleRoute>} />
            <Route path="/transactions" element={<TransactionReport />} />
            <Route path="/voids" element={<RoleRoute roles={['manager','owner']}><VoidLog /></RoleRoute>} />
            <Route path="/staff" element={<RoleRoute roles={['owner']}><StaffManagement /></RoleRoute>} />
            <Route path="/audit" element={<RoleRoute roles={['owner']}><AuditLog /></RoleRoute>} />
            <Route path="/maintenance" element={<RoleRoute roles={['owner']}><Maintenance /></RoleRoute>} />
          </Route>
        </Routes>
      </Suspense></HashRouter>
    </ToastProvider>
  );
}
