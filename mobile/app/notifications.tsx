import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Bell, MessageSquare, DollarSign, Star, Zap, Info } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { db, collection, query, where, onSnapshot, doc, updateDoc, orderBy, limit } from '../services/supabase';
import { AppNotification, NotificationType } from '../types';

const TYPE_ICON: Partial<Record<NotificationType, any>> = {
  NEW_BID: Zap,
  BID_ACCEPTED: Zap,
  BOOKING_CREATED: Zap,
  INSTANT_BOOKING_OFFER: Zap,
  INSTANT_BOOKING_ACCEPTED: Zap,
  INSTANT_MATCH_EXPIRED: Info,
  JOB_UPDATE: Info,
  ASSIGNED: Info,
  EN_ROUTE: Info,
  CLEANER_ARRIVED: Info,
  IN_PROGRESS: Info,
  COMPLETED: Info,
  CANCELLED: Info,
  RESCHEDULED: Info,
  MESSAGE: MessageSquare,
  PAYMENT: DollarSign,
  PAYMENT_ESCROWED: DollarSign,
  PAYMENT_DELIVERED: DollarSign,
  PAYMENT_DISPUTED: DollarSign,
  COMPLETION_DISPUTED: Info,
  COMPLETION_CONFIRMED: Info,
  CANCELLATION_REVIEW: Info,
  SUPPORT_CASE: MessageSquare,
  EMERGENCY: Info,
  RATING: Star,
  SYSTEM: Bell,
};

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification)));
        setIsLoading(false);
      },
      () => setIsLoading(false)
    );
  }, [user]);

  const openNotification = (n: AppNotification) => {
    if (!n.read) updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {});
    if(n.data?.supportCaseId){router.push('/support');return;}
    if(n.type==='INSTANT_BOOKING_OFFER'){router.push('/instant-offers');return;}
    if(n.type==='INSTANT_BOOKING_ACCEPTED'){router.push({pathname:'/booking/offers',params:{jobId:n.jobId}});return;}
    if(['NEW_BID','BOOKING_CREATED'].includes(n.type)){if(n.jobId)router.push({pathname:'/booking/offers',params:{jobId:n.jobId}});return;}
    if (n.jobId) router.push({ pathname: '/tracking/[jobId]', params: { jobId: n.jobId } });
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F3F1FC]">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-4">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-ink/5">
          <ArrowLeft size={18} color="#150256" />
        </TouchableOpacity>
        <Text className="text-xl font-display font-black text-ink">Notifications</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#3906D2" size="large" />
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-20 h-20 bg-accent/10 rounded-3xl items-center justify-center mb-4">
            <Bell size={32} color="#3906D2" />
          </View>
          <Text className="text-lg font-display font-black text-ink text-center">You're all caught up</Text>
          <Text className="font-sans text-sm text-ink/40 font-medium text-center mt-2">
            Job updates, new quotes, and messages will show up here
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerClassName="px-5 pb-10 gap-3"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const Icon = TYPE_ICON[item.type] ?? Bell;
            return (
              <TouchableOpacity
                onPress={() => openNotification(item)}
                activeOpacity={0.85}
                className={`bg-white rounded-3xl p-4 flex-row items-start gap-3 border ${item.read ? 'border-ink/5' : 'border-accent/30'}`}
              >
                <View className={`w-10 h-10 rounded-2xl items-center justify-center ${item.read ? 'bg-ink/5' : 'bg-accent/10'}`}>
                  <Icon size={18} color={item.read ? '#9C94C4' : '#3906D2'} />
                </View>
                <View className="flex-1">
                  <Text className={`text-sm ${item.read ? 'font-bold text-ink/70' : 'font-black text-ink'}`}>{item.title}</Text>
                  <Text className="font-sans text-xs text-ink/40 font-medium mt-0.5">{item.body}</Text>
                </View>
                {!item.read && <View className="w-2 h-2 rounded-full bg-accent mt-1.5" />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
