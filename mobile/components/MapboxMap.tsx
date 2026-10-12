import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { MapPin } from 'lucide-react-native';

type Coordinate = { latitude: number; longitude: number };
type Marker = Coordinate & { label?: string; color?: string };

interface MapboxMapProps {
  style?: unknown;
  region: Coordinate;
  markers?: Marker[];
  line?: Coordinate[];
}

const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

/** Interactive Mapbox GL JS map that works in an Expo build without native
 * Google Maps credentials. The public `pk.` token is intentionally safe here. */
export function MapboxMap({ style, region, markers = [], line = [] }: MapboxMapProps) {
  const source = useMemo(() => {
    const model = JSON.stringify({ region, markers, line }).replace(/</g, '\\u003c');
    return `<!doctype html><html><head><meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no"/><link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet"/><style>html,body,#map{margin:0;width:100%;height:100%;} .mapboxgl-ctrl-logo,.mapboxgl-ctrl-attrib{display:none}</style></head><body><div id="map"></div><script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script><script>const d=${model};mapboxgl.accessToken=${JSON.stringify(token)};const map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/streets-v12',center:[d.region.longitude,d.region.latitude],zoom:14,attributionControl:false});d.markers.forEach(m=>new mapboxgl.Marker({color:m.color||'#3906D2'}).setLngLat([m.longitude,m.latitude]).setPopup(new mapboxgl.Popup({offset:24}).setText(m.label||'Location')).addTo(map));if(d.line.length>1){map.on('load',()=>{map.addSource('route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:d.line.map(p=>[p.longitude,p.latitude])}}});map.addLayer({id:'route',type:'line',source:'route',paint:{'line-color':'#3906D2','line-width':4,'line-dasharray':[2,2]}});});}</script></body></html>`;
  }, [region.latitude, region.longitude, markers, line]);

  if (!token.startsWith('pk.')) {
    return <View style={[styles.missing, style as object]}><MapPin size={28} color="#3906D2" /><Text style={styles.message}>Mapbox token required</Text></View>;
  }
  return <WebView style={style as object} source={{ html: source }} originWhitelist={['*']} javaScriptEnabled domStorageEnabled />;
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDEBFA', gap: 8 },
  message: { color: '#3906D2', fontWeight: '700', fontSize: 12 },
});
