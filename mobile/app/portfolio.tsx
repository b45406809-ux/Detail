import { goBackSafely } from '@/utils/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, Plus, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { callFunction } from '../services/functions';
import { uploadCleanerPortfolioPhoto } from '../services/storage';

type Photo = { id: string; url: string; caption?: string };
export default function CleanerPortfolioScreen() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const response = await callFunction<Record<string, never>, { photos: Photo[] }>('getCleanerPortfolio', {}); setPhotos(response.photos.filter(p => !!p.url)); }
    catch (error: any) { Alert.alert('Portfolio unavailable', error.message || 'Please try again.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const addPhoto = async () => {
    if (photos.length >= 12) { Alert.alert('Portfolio full', 'Remove a photo before adding another.'); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Photo access needed', 'Allow photo library access to add a portfolio image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.82 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      const imagePath = await uploadCleanerPortfolioPhoto(result.assets[0].uri);
      await callFunction('addCleanerPortfolioPhoto', { imagePath, caption: '' });
      await load();
    } catch (error: any) { Alert.alert('Could not add photo', error.message || 'Please try again.'); }
    finally { setBusy(false); }
  };
  const removePhoto = (photo: Photo) => Alert.alert('Remove photo?', 'This image will no longer appear in your portfolio.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { setBusy(true); try { await callFunction('removeCleanerPortfolioPhoto', { photoId: photo.id }); setPhotos(current => current.filter(item => item.id !== photo.id)); } catch (error: any) { Alert.alert('Could not remove photo', error.message || 'Please try again.'); } finally { setBusy(false); } } },
  ]);

  return <SafeAreaView className="flex-1 bg-[#F8F7FC]">
    <View className="flex-row items-center px-5 py-4 bg-white border-b border-slate-100"><TouchableOpacity onPress={() => goBackSafely()} className="mr-4"><ArrowLeft size={22} color="#150256"/></TouchableOpacity><View><Text className="font-display text-xl font-black text-ink">My portfolio</Text><Text className="font-sans text-xs text-ink/50">Show customers examples of your work</Text></View></View>
    <ScrollView contentContainerClassName="p-5 pb-10">
      <View className="rounded-3xl bg-white p-5 mb-5"><Text className="font-display text-base font-black text-ink mb-1">Build trust with photos</Text><Text className="font-sans text-sm leading-5 text-ink/60">Upload up to 12 photos that you have permission to share. Avoid showing people, addresses, documents, or other private information.</Text><TouchableOpacity disabled={busy} onPress={() => void addPhoto()} className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-accent py-4">{busy ? <ActivityIndicator color="white"/> : <><Plus size={18} color="white"/><Text className="font-display font-black text-white">Add a photo</Text></>}</TouchableOpacity></View>
      {photos.length ? <View className="flex-row flex-wrap justify-between">{photos.map(photo => <View key={photo.id} className="mb-3 w-[48%] overflow-hidden rounded-2xl bg-white"><Image source={{ uri: photo.url }} className="h-36 w-full" resizeMode="cover"/><TouchableOpacity onPress={() => removePhoto(photo)} className="flex-row items-center justify-center gap-1.5 py-3"><Trash2 size={15} color="#DC2626"/><Text className="font-sans text-xs font-bold text-red-600">Remove</Text></TouchableOpacity></View>)}</View> : <View className="items-center rounded-3xl border border-dashed border-violet-200 bg-white p-8"><Camera size={30} color="#7B61D1"/><Text className="mt-3 font-display font-black text-ink">Your portfolio is empty</Text><Text className="mt-1 text-center font-sans text-sm text-ink/50">Add a few photos to help customers see the quality of your work.</Text></View>}
    </ScrollView>
  </SafeAreaView>;
}
