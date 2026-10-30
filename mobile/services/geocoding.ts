const ZIMBABWE_SEARCH_CENTER = { latitude: -17.8252, longitude: 31.0335 };

export function buildAddressSuggestionUrl(
  address: string,
  token: string,
  proximity?: { latitude: number; longitude: number } | null,
) {
  const center = proximity && Number.isFinite(proximity.latitude) && Number.isFinite(proximity.longitude)
    ? proximity
    : ZIMBABWE_SEARCH_CENTER;
  const params = new URLSearchParams({
    autocomplete: 'true',
    country: 'zw',
    limit: '5',
    language: 'en',
    proximity: `${center.longitude},${center.latitude}`,
    access_token: token,
  });
  return `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address.trim())}.json?${params.toString()}`;
}
