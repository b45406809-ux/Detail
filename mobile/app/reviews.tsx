import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from '../services/supabase';

interface Review {
  id: string;
  customerId: string;
  customerName: string;
  jobId: string;
  rating: number;
  comment: string;
  createdAt: any;
}

export default function ReviewsScreen() {
  const { user, profile } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'reviews'),
      where('cleanerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review)));
      setIsLoading(false);
    });
    return unsub;
  }, [user]);

  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  return (
    <SafeAreaView className="flex-1 bg-[#F2F1F5]">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-slate-100"
        >
          <ArrowLeft size={18} color="#0f172a" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-black text-slate-900">My Reviews</Text>
          <Text className="text-xs text-slate-400 font-medium">
            Ratings left by customers
          </Text>
        </View>
      </View>

      {/* Summary card */}
      {averageRating !== null && (
        <View className="mx-5 mb-5 bg-white rounded-3xl p-5 flex-row items-center gap-5 border border-slate-100">
          <View className="items-center">
            <Text className="text-4xl font-black text-slate-900">
              {averageRating.toFixed(1)}
            </Text>
            <View className="flex-row mt-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={14}
                  color="#f59e0b"
                  fill={s <= Math.round(averageRating) ? '#f59e0b' : 'transparent'}
                />
              ))}
            </View>
          </View>
          <View className="w-px h-12 bg-slate-100" />
          <View>
            <Text className="text-2xl font-black text-slate-900">{reviews.length}</Text>
            <Text className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Total reviews
            </Text>
          </View>
          <View className="w-px h-12 bg-slate-100" />
          <View>
            <Text className="text-2xl font-black text-slate-900">
              {profile?.jobsCompleted ?? 0}
            </Text>
            <Text className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Jobs done
            </Text>
          </View>
        </View>
      )}

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#3906d2" size="large" />
        </View>
      ) : reviews.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-4xl mb-4">⭐</Text>
          <Text className="text-lg font-black text-slate-900 text-center">
            No reviews yet
          </Text>
          <Text className="text-sm text-slate-400 font-medium text-center mt-2">
            Complete jobs to receive ratings from customers
          </Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View className="bg-white rounded-3xl p-5 border border-slate-100">
              <View className="flex-row items-start justify-between mb-3">
                <View>
                  <Text className="text-sm font-black text-slate-900">
                    {item.customerName || 'Customer'}
                  </Text>
                  <Text className="text-xs text-slate-400 font-medium mt-0.5">
                    {item.createdAt?.toDate?.()?.toLocaleDateString() ?? 'Recent'}
                  </Text>
                </View>
                {/* Star rating */}
                <View className="flex-row gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={14}
                      color="#f59e0b"
                      fill={s <= item.rating ? '#f59e0b' : 'transparent'}
                    />
                  ))}
                </View>
              </View>
              {item.comment ? (
                <Text className="text-sm text-slate-600 font-medium leading-relaxed italic">
                  "{item.comment}"
                </Text>
              ) : (
                <Text className="text-sm text-slate-300 font-medium italic">No comment left</Text>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
