import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, Warehouse, Leaf, Clock, DollarSign, BarChart3, Receipt, Ban, Menu, ChevronLeft, History, Users, X } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { navItems } from '../../config/navigation';
import { branding } from '../../config/branding';

export default function Sidebar() {
  const { sidebarOpen, mobileMenuOpen, toggleSidebar, setMobileMenuOpen } = useUiStore();
  const { currentStaff } = useAuthStore();
  const role = currentStaff?.role || 'cashier';

  const filteredNav = navItems.filter(item => item.roles.includes(role));

  return (
    <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-icon">{branding.logoShort}</div>
        <h1>{branding.logoSubtitle}</h1>
        <button className="btn btn-ghost btn-icon mobile-only close-drawer" onClick={() => setMobileMenuOpen(false)}>
          <X size={20} />
        </button>
      </div>
      <nav className="sidebar-nav">
        {filteredNav.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <item.icon />
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button className="btn btn-ghost btn-icon" onClick={toggleSidebar} title={sidebarOpen ? 'Collapse' : 'Expand'}>
          {sidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
        </button>
      </div>
    </aside>
  );
}
