import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Heart, MessageCircle, Star } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { db, collection, query, where, onSnapshot, doc, deleteDoc, orderBy } from '../services/firebase';
import { Favorite } from '../types';

export default function FavoritesScreen() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'favorites'), where('customerId', '==', user.uid), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setFavorites(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Favorite)));
        setIsLoading(false);
      },
      () => setIsLoading(false)
    );
  }, [user]);

  const removeFavorite = (fav: Favorite) => {
    Alert.alert('Remove favorite?', `Remove ${fav.cleanerName ?? 'this cleaner'} from your favorites.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteDoc(doc(db, 'favorites', fav.id)).catch(() => {}) },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F3F1FC]">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-ink/5">
          <ArrowLeft size={18} color="#150256" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-ink">Favorites</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#3906D2" size="large" />
        </View>
      ) : favorites.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-20 h-20 bg-accent/10 rounded-3xl items-center justify-center mb-4">
            <Heart size={32} color="#3906D2" />
          </View>
          <Text className="text-lg font-black text-ink text-center">No favorites yet</Text>
          <Text className="text-sm text-ink/40 font-medium text-center mt-2">
            Tap the heart on a cleaner after a job to save them for quick rebooking
          </Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(f) => f.id}
          contentContainerClassName="px-5 pb-10 gap-3"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View className="bg-white rounded-3xl p-4 flex-row items-center gap-4 border border-ink/5">
              <View className="w-14 h-14 rounded-2xl bg-accent/10 items-center justify-center overflow-hidden">
                {item.cleanerPhoto ? (
                  <Image source={{ uri: item.cleanerPhoto }} style={{ width: 56, height: 56 }} />
                ) : (
                  <Text className="text-2xl">🧹</Text>
                )}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-black text-ink">{item.cleanerName ?? 'Cleaner'}</Text>
                <View className="flex-row items-center gap-1 mt-1">
                  <Star size={11} color="#f59e0b" fill="#f59e0b" />
                  <Text className="text-xs font-bold text-ink/50">Saved cleaner</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/messages', params: { cleanerId: item.cleanerId } })}
                className="w-10 h-10 bg-accent/10 rounded-2xl items-center justify-center"
              >
                <MessageCircle size={16} color="#3906D2" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeFavorite(item)} className="w-10 h-10 bg-red-50 rounded-2xl items-center justify-center">
                <Heart size={16} color="#E5484D" fill="#E5484D" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
