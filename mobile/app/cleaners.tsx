import { goBackSafely } from '@/utils/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Heart, Search, Star } from 'lucide-react-native';
import { MapPin } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { db, addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where } from '../services/supabase';
import { callFunction } from '../services/functions';
import { Favorite } from '../types';

type Cleaner = { uid: string; displayName: string; photoURL?: string; ratingAverage?: number; ratingCount?: number; serviceArea?: string; serviceCategories?: string[]; portfolio?: {url:string;caption?:string}[]; available?: boolean; distanceKm?:number|null };

export default function CleanersScreen() {
  const { user } = useAuth();
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [category, setCategory] = useState('');
  const [nearby, setNearby] = useState<{lat:number;lng:number}|null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    const timer = setTimeout(() => {
      callFunction<{ search: string; category:string; lat?:number; lng?:number; radiusKm:number }, { cleaners: Cleaner[] }>('searchVerifiedCleaners', { search, category, radiusKm:25, ...(nearby??{}) })
        .then((result) => { if (active) setCleaners(result.cleaners); })
        .catch(() => { if (active) { setCleaners([]); setLoadError(true); } })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, retry, category, nearby]);

  const findNearby = async () => {
    if(nearby){setNearby(null);return;}
    const permission=await Location.requestForegroundPermissionsAsync();
    if(!permission.granted){Alert.alert('Location permission needed','Allow location access to find verified cleaners within 25 km. You can still search by name or area.');return;}
    try{const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});setNearby({lat:position.coords.latitude,lng:position.coords.longitude});}
    catch{Alert.alert('Location unavailable','Try again or search by city and area.');}
  };

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'favorites'), where('customerId', '==', user.uid)), (snap) => {
      setFavorites(snap.docs.map((item) => ({ id: item.id, ...item.data() } as Favorite)));
    });
  }, [user]);

  const visibleCleaners = useMemo(() => cleaners, [cleaners]);

  const toggleFavorite = async (cleaner: Cleaner) => {
    if (!user) return;
    const saved = favorites.find((item) => item.cleanerId === cleaner.uid);
    try {
      if (saved) await deleteDoc(doc(db, 'favorites', saved.id));
      else await addDoc(collection(db, 'favorites'), { customerId: user.uid, cleanerId: cleaner.uid, cleanerName: cleaner.displayName, cleanerPhoto: cleaner.photoURL ?? '', createdAt: serverTimestamp() });
    } catch {
      // The listener remains the source of truth for favorite state.
    }
  };

  return <SafeAreaView className="flex-1 bg-[#F3F1FC]">
    <View className="flex-row items-center gap-3 px-5 pt-4 pb-4 bg-white">
      <TouchableOpacity onPress={() => goBackSafely()} className="w-10 h-10 bg-ink/5 rounded-2xl items-center justify-center"><ArrowLeft size={18} color="#150256" /></TouchableOpacity>
      <View><Text className="text-xl font-display font-black text-ink">Find Cleaners</Text><Text className="font-sans text-xs text-ink/40">Search verified professionals</Text></View>
    </View>
    <View className="px-5 pt-4 pb-2"><View className="flex-row items-center gap-2 bg-white border border-ink/10 rounded-2xl px-4"><Search size={17} color="#9C94C4" /><TextInput value={search} onChangeText={setSearch} placeholder="Search by name, city or service" placeholderTextColor="#9C94C4" className="font-sans flex-1 py-3.5 text-sm text-ink" autoCorrect={false} /></View><View className="mt-3 flex-row gap-2"><TouchableOpacity onPress={()=>setCategory('')} className={`rounded-xl px-3.5 py-2 ${!category?'bg-accent':'bg-white'}`}><Text className={`font-sans text-xs font-bold ${!category?'text-white':'text-ink/60'}`}>All services</Text></TouchableOpacity>{['HOUSE','CAR'].map(value=><TouchableOpacity key={value} onPress={()=>setCategory(category===value?'':value)} className={`rounded-xl px-3.5 py-2 ${category===value?'bg-accent':'bg-white'}`}><Text className={`font-sans text-xs font-bold ${category===value?'text-white':'text-ink/60'}`}>{value==='HOUSE'?'House':'Car'}</Text></TouchableOpacity>)}<TouchableOpacity onPress={()=>void findNearby()} className={`ml-auto flex-row items-center gap-1 rounded-xl px-3 py-2 ${nearby?'bg-emerald-600':'bg-white'}`}><MapPin size={13} color={nearby?'white':'#3906D2'}/><Text className={`font-sans text-xs font-bold ${nearby?'text-white':'text-accent'}`}>{nearby?'Nearby on':'Nearby'}</Text></TouchableOpacity></View></View>
    {loading ? <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#3906D2" /></View> : <FlatList
      data={visibleCleaners}
      keyExtractor={(item) => item.uid}
      contentContainerClassName="px-5 pb-10 gap-3"
      ListEmptyComponent={<View className="items-center py-16 px-8"><Text className="text-base font-display font-black text-ink">{loadError ? 'Could not load cleaners' : 'No verified cleaners found'}</Text><Text className="font-sans text-sm text-ink/45 text-center mt-2">{loadError ? 'Check your connection and try again.' : 'Try a different name, city, or service.'}</Text>{loadError && <TouchableOpacity onPress={() => setRetry((value) => value + 1)} className="mt-4 rounded-xl bg-accent px-4 py-2"><Text className="text-white text-xs font-display font-black">Try again</Text></TouchableOpacity>}</View>}
      renderItem={({ item }) => {
        const saved = favorites.some((favorite) => favorite.cleanerId === item.uid);
        return <View className="bg-white rounded-3xl p-4 flex-row items-center gap-3 border border-ink/5">
          <View className="w-14 h-14 rounded-2xl bg-accent/10 items-center justify-center overflow-hidden">{item.photoURL ? <Image source={{ uri: item.photoURL }} style={{ width: 56, height: 56 }} /> : <Text className="font-sans text-2xl">🧹</Text>}</View>
          <View className="flex-1">
            <Text className="text-sm font-display font-black text-ink">{item.displayName || 'Detail cleaner'}</Text>
            <View className="flex-row items-center gap-1 mt-1"><Star size={12} color="#f59e0b" fill="#f59e0b" /><Text className="font-sans text-xs font-bold text-ink/60">{item.ratingAverage ? item.ratingAverage.toFixed(1) : 'New'}{item.ratingCount ? ` · ${item.ratingCount} reviews` : ''}</Text></View>
            <Text className="font-sans text-[11px] text-ink/45 mt-1" numberOfLines={1}>{[item.serviceArea, ...(item.serviceCategories ?? [])].filter(Boolean).join(' · ') || 'Identity verified'}{item.distanceKm!==null&&item.distanceKm!==undefined?` · ${item.distanceKm} km away`:''}</Text>
            <Text className={`font-sans text-[10px] font-bold mt-1 ${item.available ? 'text-emerald-700' : 'text-slate-400'}`}>{item.available ? 'Online now' : 'Not online for immediate requests'}</Text>
            {!!item.portfolio?.length && <View className="mt-2 flex-row gap-1.5">{item.portfolio.slice(0,3).map((photo,index)=><Image key={`${item.uid}-portfolio-${index}`} source={{uri:photo.url}} className="h-9 w-11 rounded-lg" resizeMode="cover" accessibilityLabel={photo.caption||'Cleaner work sample'}/>)}</View>}
          </View>
          <TouchableOpacity onPress={() => toggleFavorite(item)} accessibilityLabel={saved ? 'Remove from favorites' : 'Save to favorites'} className={`w-10 h-10 rounded-2xl items-center justify-center ${saved ? 'bg-red-50' : 'bg-accent/10'}`}><Heart size={18} color={saved ? '#E5484D' : '#3906D2'} fill={saved ? '#E5484D' : 'transparent'} /></TouchableOpacity>
        </View>;
      }}
    />}
  </SafeAreaView>;
}
