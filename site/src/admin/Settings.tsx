import React, { useEffect, useState } from 'react';
import { mutateAdmin, adminCall } from './api';

const switches = [
  ['bookingLaunch', 'Enable customer bookings'],
  ['maintenance', 'Global maintenance mode'],
  ['bookingCreation', 'Disable booking creation'],
  ['bidAcceptance', 'Disable bid acceptance'],
  ['payments', 'Disable payments'],
] as const;

type SettingsConfig = {
  switches?: Record<string, boolean>;
  supportCopy?: string;
  bookingEnabled?: boolean;
  voiceCallLimitSeconds?: number;
};

export function Settings() {
  const [config, setConfig] = useState<SettingsConfig>({ switches: {}, supportCopy: '', bookingEnabled: false, voiceCallLimitSeconds: 300 });
  const [callLimitMinutes, setCallLimitMinutes] = useState(5);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminCall<SettingsConfig>('adminQuery', { module: 'settings' })
      .then(next => {
        setConfig(next);
        const seconds = Number(next.voiceCallLimitSeconds) || 300;
        setCallLimitMinutes(Math.min(60, Math.max(1, Math.round(seconds / 60))));
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async (key: string, value: unknown) => {
    const reason = prompt('Required reason for this elevated change');
    if (!reason || !confirm('Confirm elevated setting change?')) return;
    setError('');
    try {
      await mutateAdmin('update_kill_switch', { key, value, reason, idempotencyKey: crypto.randomUUID() });
      if (key === 'bookingLaunch') setConfig(current => ({ ...current, bookingEnabled: value === true }));
      else if (key === 'supportCopy') setConfig(current => ({ ...current, supportCopy: String(value ?? '') }));
      else if (key === 'voiceCallLimitSeconds') setConfig(current => ({ ...current, voiceCallLimitSeconds: Number(value) }));
      else setConfig(current => ({ ...current, switches: { ...current.switches, [key]: value === true } }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Setting could not be saved.');
    }
  };

  return <section>
    <header className="module-header">
      <div><h1>Settings</h1><p>Elevated, reasoned and audited operational controls</p></div>
    </header>
    {Object.values(config.switches || {}).some(Boolean) && <div className="maintenance-banner">One or more beta kill switches are active</div>}
    {error && <div className="inline-error">{error}</div>}
    <article className="panel settings-list">
      {switches.map(([key, label]) => <label key={key}>
        <span>
          <b>{label}</b>
          <small>{key === 'bookingLaunch' ? 'Opens customer booking when maintenance and booking-creation stops are off.' : 'Last change and actor are preserved in the audit log.'}</small>
        </span>
        <input type="checkbox" checked={key === 'bookingLaunch' ? !!config.bookingEnabled : !!config.switches?.[key]} onChange={event => void save(key, event.target.checked)} />
      </label>)}
    </article>
    <article className="panel">
      <h2>In-app voice call limit</h2>
      <p className="muted">Choose 1–60 minutes. This limit applies to new calls and is enforced by Twilio and the app. The default is 5 minutes.</p>
      <div className="toolbar">
        <label htmlFor="voice-call-limit-minutes">
          Maximum call duration
          <input
            id="voice-call-limit-minutes"
            type="number"
            min={1}
            max={60}
            step={1}
            value={callLimitMinutes}
            disabled={loading}
            onChange={event => setCallLimitMinutes(Number(event.target.value))}
          />
        </label>
        <span>minutes</span>
        <button disabled={loading || callLimitMinutes < 1 || callLimitMinutes > 60 || !Number.isInteger(callLimitMinutes) || callLimitMinutes * 60 === config.voiceCallLimitSeconds} onClick={() => void save('voiceCallLimitSeconds', callLimitMinutes * 60)}>Save call limit</button>
      </div>
      <small className="muted">Changes require a reason, recent administrator sign-in, and are recorded in the audit log.</small>
    </article>
    <article className="panel">
      <h2>WhatsApp / support fallback copy</h2>
      <textarea value={config.supportCopy || ''} onChange={event => setConfig(current => ({ ...current, supportCopy: event.target.value }))} />
      <button onClick={() => void save('supportCopy', config.supportCopy)}>Save audited copy</button>
    </article>
  </section>;
}
