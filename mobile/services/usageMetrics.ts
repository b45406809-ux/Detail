import { AppState } from 'react-native';
import { supabase } from './supabase';

type MapboxUsageKind = 'map_view' | 'geocoding' | 'directions';
const pending: Record<MapboxUsageKind, number> = { map_view: 0, geocoding: 0, directions: 0 };
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;

async function flushMapboxUsage() {
  if (flushing || !Object.values(pending).some(count => count > 0)) return;
  flushing = true;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    for (const kind of Object.keys(pending) as MapboxUsageKind[]) {
      const count = pending[kind];
      if (!count) continue;
      const { error } = await supabase.rpc('record_mapbox_usage', { p_kind: kind, p_count: count });
      if (error) break;
      pending[kind] -= count;
    }
  } catch {
    // Keep the in-memory counters and retry on the next event/app foreground.
  } finally {
    flushing = false;
    if (Object.values(pending).some(count => count > 0)) {
      flushTimer = setTimeout(() => void flushMapboxUsage(), 30_000);
    }
  }
}

export function recordMapboxUsage(kind: MapboxUsageKind) {
  pending[kind] += 1;
  if (Object.values(pending).reduce((sum, count) => sum + count, 0) >= 10) {
    void flushMapboxUsage();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => void flushMapboxUsage(), 30_000);
  }
}

AppState.addEventListener('change', state => {
  if (state === 'active') void flushMapboxUsage();
});
