import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { IS_MOCK } from '../utils/env';

export const MAPBOX_ACCESS_TOKEN = IS_MOCK ? '' : String(Constants.expoConfig?.extra?.mapboxAccessToken ?? '');
export const IS_MAPBOX_AVAILABLE = Platform.OS !== 'web' && Boolean(MAPBOX_ACCESS_TOKEN)
  && Constants.executionEnvironment !== 'storeClient';

// Mapbox's native entry point throws during import in Expo Go. Load it only
// in a custom native build; type-only import keeps the app's fallback usable.
type MapboxModule = typeof import('@rnmapbox/maps').default;
export const Mapbox = (IS_MAPBOX_AVAILABLE ? require('@rnmapbox/maps').default : null) as MapboxModule;

export async function getDrivingRoute(origin:{lat:number;lng:number},destination:{lat:number;lng:number}){
  if(!MAPBOX_ACCESS_TOKEN)throw new Error('Mapbox directions are not configured.');
  const coordinates=`${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url=`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?overview=full&geometries=geojson&access_token=${encodeURIComponent(MAPBOX_ACCESS_TOKEN)}`;
  const response=await fetch(url);if(!response.ok)throw new Error(`Mapbox directions returned ${response.status}.`);
  const body=await response.json();const route=body.routes?.[0];
  if(!route||!Number.isFinite(route.duration)||!Array.isArray(route.geometry?.coordinates))throw new Error('No driving route is available.');
  return {durationMinutes:Math.max(1,Math.round(route.duration/60)),distanceKm:Number(route.distance)/1000,coordinates:route.geometry.coordinates as [number,number][]};
}

if (IS_MAPBOX_AVAILABLE) {
  void Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}
