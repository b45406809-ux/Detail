import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getOverview } from './api';
import type { OverviewData } from './types';

const money = (value: number, currency: string) => new Intl.NumberFormat('en-ZW', { style: 'currency', currency }).format(value / 100);

export function Overview({ navigate }: { navigate: (route: string, id?: string) => void }) {
  const [period, setPeriod] = useState<'7d' | '30d' | '12m'>('30d');
  const [data, setData] = useState<OverviewData>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); setError(''); getOverview(period).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [period]);
  if (loading) return <div className="admin-state">Loading timestamped operational metrics…</div>;
  if (error || !data) return <div className="admin-state error">Metrics unavailable: {error}<button onClick={() => setPeriod(p => p)}>Retry</button></div>;
  const max = Math.max(...data.revenue.map(p => p.amount), 1);
  return <section>
    <header className="module-header"><div><h1>Overview</h1><p>Operational day: <b>{data.timezone}</b> · Currency: <b>{data.currency}</b> · Updated {new Date(data.asOf).toLocaleString()}</p></div><RefreshCw size={18}/></header>
    <div className="metric-grid">{data.metrics.map(metric => <article className="metric" key={metric.label}><span>{metric.label}</span>{metric.error ? <strong className="error">Unavailable</strong> : <strong>{metric.format === 'money' ? money(metric.value, data.currency) : metric.value.toLocaleString()}</strong>}</article>)}</div>
    <article className="panel"><div className="panel-title"><h2>Captured revenue</h2><div>{(['7d','30d','12m'] as const).map(p => <button className={period === p ? 'active' : ''} onClick={() => setPeriod(p)} key={p}>{p}</button>)}</div></div><div className="chart" role="img" aria-label={`Revenue for ${period}`}>{data.revenue.map(point => <div className="bar-slot" key={point.label} title={`${point.label}: ${money(point.amount, data.currency)}`}><div className="bar" style={{height: `${Math.max(3, point.amount / max * 100)}%`}}/><small>{point.label}</small></div>)}</div></article>
    <article className="panel"><div className="panel-title"><h2>Jobs needing attention</h2><span className="alert-count"><AlertTriangle size={14}/>{data.attention.length}</span></div>{data.attention.length === 0 ? <p className="muted">No active operational alerts.</p> : <div className="rows">{data.attention.map(a => <button className="row" key={a.id} onClick={() => navigate(a.caseId ? 'support' : 'bookings', a.caseId || a.bookingId)}><b>{a.rule}</b><span>{a.ageMinutes}m · Open →</span></button>)}</div>}</article>
  </section>;
}
