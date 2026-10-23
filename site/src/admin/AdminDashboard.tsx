import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, BookOpen, CalendarDays, CreditCard, Headphones, LayoutDashboard, LogOut, Mail, Menu, Package, Settings as SettingsIcon, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { supabase } from '../supabase';
import { verifiedAdminClaims } from './api';
import type { AdminClaims, AdminRoute } from './types';
import { Overview } from './Overview';
import { DataModule } from './Modules';
import { Settings } from './Settings';
import { Waitlist } from './Waitlist';
import { Admins } from './Admins';
import { BlogManager } from './BlogManager';
import './admin.css';

const routes: Array<[AdminRoute, string, LucideIcon]> = [
  ['overview', 'Overview', LayoutDashboard], ['bookings', 'Bookings', CalendarDays],
  ['customers', 'Customers', Users], ['cleaners', 'Cleaners', Sparkles],
  ['payments', 'Payments / Refunds', CreditCard], ['products', 'Products', Package],
  ['analytics', 'Analytics', BarChart3], ['support', 'Support Cases', Headphones],
  ['waitlist', 'Waitlist & Email', Mail],
  ['blog', 'Blog & GEO', BookOpen],
  ['admins', 'Admins & Security', ShieldCheck],
  ['settings', 'Settings', SettingsIcon],
];
const routePermissions: Partial<Record<AdminRoute, string>> = {
  bookings: 'bookings.manage',
  customers: 'users.manage', cleaners: 'users.manage',
  payments: 'finance.read', products: 'finance.read', analytics: 'finance.read',
  support: 'support.manage', waitlist: 'marketing.read', blog: 'marketing.read',
  admins: 'admins.manage', settings: '__elevated__',
};

function routeFromLocation(): { route: AdminRoute; focus?: string } {
  const segments = location.pathname.split('/').filter(Boolean);
  const adminIndex = segments.indexOf('admin');
  const candidate = segments[adminIndex + 1] ?? 'overview';
  let focus: string | undefined;
  try { focus = segments[adminIndex + 2] ? decodeURIComponent(segments[adminIndex + 2]) : undefined; } catch { focus = undefined; }
  return { route: routes.some(([key]) => key === candidate) ? candidate as AdminRoute : 'overview', focus };
}

export function AdminDashboard() {
  const initial = routeFromLocation();
  const [route, setRoute] = useState(initial.route);
  const [focus, setFocus] = useState(initial.focus);
  const [claims, setClaims] = useState<AdminClaims>();
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);

  useEffect(() => { verifiedAdminClaims(true).then(setClaims).catch(error => setError(error.message)); }, []);
  useEffect(() => {
    const syncRoute = () => { const next = routeFromLocation(); setRoute(next.route); setFocus(next.focus); setMenu(false); };
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);
  useEffect(() => {
    const permission = routePermissions[route];
    if (!claims || !permission || claims.elevated || (permission !== '__elevated__' && claims.permissions.includes(permission))) return;
    setRoute('overview'); setFocus(undefined); setMenu(false);
    window.history.replaceState(null, '', '/admin/overview');
  }, [claims, route]);
  const visibleRoutes = routes.filter(([id]) => {
    const permission = routePermissions[id];
    return claims?.elevated || !permission || (permission !== '__elevated__' && claims?.permissions.includes(permission));
  });
  const go = (next: string, id?: string) => {
    const valid = routes.some(([key]) => key === next);
    if (!valid) return;
    const permission = routePermissions[next as AdminRoute];
    if (permission && (!claims || (!claims.elevated && (permission === '__elevated__' || !claims.permissions.includes(permission))))) return;
    setRoute(next as AdminRoute); setFocus(id); setMenu(false);
    window.history.pushState(null, '', `/admin/${next}${id ? `/${encodeURIComponent(id)}` : ''}`);
  };

  if (error) return <main className="admin-denied"><h1>Admin access denied</h1><p>{error}</p><p>Only a server-assigned administrator role grants access.</p><button onClick={() => supabase.auth.signOut()}>Sign out</button></main>;
  if (!claims) return <main className="admin-denied"><p>Verifying administrator role…</p></main>;
  return <main className="admin-root">
    <aside className={menu ? 'open' : ''}>
      <div className="brand">DETAIL.<small>ADMIN COMMAND CENTER</small></div>
      <nav>{visibleRoutes.map(([id, label, Icon]) => <button key={id} className={route === id ? 'active' : ''} onClick={() => go(id)}><Icon size={17}/>{label}</button>)}</nav>
      <footer><span>Verified admin · {claims.elevated ? 'Elevated' : 'Standard'}</span><button onClick={() => supabase.auth.signOut()}><LogOut size={14}/> Sign out</button></footer>
    </aside>
    <div className="admin-content"><button className="menu-button" onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button>{route === 'overview' ? <Overview navigate={go}/> : route === 'settings' ? <Settings/> : route === 'waitlist' ? <Waitlist/> : route === 'admins' ? <Admins/> : route === 'blog' ? <BlogManager/> : <DataModule key={`${route}:${focus ?? ''}`} kind={route} focusId={focus} navigate={go}/>}</div>
  </main>;
}
