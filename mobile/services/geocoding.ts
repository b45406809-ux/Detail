export function buildAddressSuggestionUrl(
  address: string,
  token: string,
  proximity?: { latitude: number; longitude: number } | null,
) {
  const params = new URLSearchParams({
    autocomplete: 'true',
    limit: '5',
    language: 'en',
    access_token: token,
  });
  if (proximity && Number.isFinite(proximity.latitude) && Number.isFinite(proximity.longitude)) {
    params.set('proximity', `${proximity.longitude},${proximity.latitude}`);
  }
  return `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address.trim())}.json?${params.toString()}`;
}
