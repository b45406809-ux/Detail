import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAddressSuggestionUrl } from '../mobile/services/geocoding.ts';

test('address autocomplete is restricted to Zimbabwe and defaults near Harare', () => {
  const url = new URL(buildAddressSuggestionUrl('  Avondale  ', 'test-token'));
  assert.equal(url.hostname, 'api.mapbox.com');
  assert.equal(url.searchParams.get('autocomplete'), 'true');
  assert.equal(url.searchParams.get('country'), 'zw');
  assert.equal(url.searchParams.get('proximity'), '31.0335,-17.8252');
  assert.equal(decodeURIComponent(url.pathname.split('/').at(-1)), 'Avondale.json');
});

test('address autocomplete prioritizes the phone location when available', () => {
  const url = new URL(buildAddressSuggestionUrl('Main Street', 'test-token', { latitude: -20.15, longitude: 28.58 }));
  assert.equal(url.searchParams.get('country'), 'zw');
  assert.equal(url.searchParams.get('proximity'), '28.58,-20.15');
});

test('invalid device coordinates fall back to the Zimbabwe search center', () => {
  const url = new URL(buildAddressSuggestionUrl('Bulawayo', 'test-token', { latitude: Number.NaN, longitude: 28.58 }));
  assert.equal(url.searchParams.get('proximity'), '31.0335,-17.8252');
});
