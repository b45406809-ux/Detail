import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAddressSuggestionUrl } from '../mobile/services/geocoding.ts';

test('address autocomplete remains global when no location is available', () => {
  const url = new URL(buildAddressSuggestionUrl('  Avondale  ', 'test-token'));
  assert.equal(url.hostname, 'api.mapbox.com');
  assert.equal(url.searchParams.get('autocomplete'), 'true');
  assert.equal(url.searchParams.has('country'), false);
  assert.equal(url.searchParams.has('proximity'), false);
  assert.equal(decodeURIComponent(url.pathname.split('/').at(-1)), 'Avondale.json');
});

test('address autocomplete prioritizes the phone location when available', () => {
  const url = new URL(buildAddressSuggestionUrl('Main Street', 'test-token', { latitude: -20.15, longitude: 28.58 }));
  assert.equal(url.searchParams.get('proximity'), '28.58,-20.15');
});

test('invalid device coordinates leave autocomplete global', () => {
  const url = new URL(buildAddressSuggestionUrl('Bulawayo', 'test-token', { latitude: Number.NaN, longitude: 28.58 }));
  assert.equal(url.searchParams.has('proximity'), false);
});
