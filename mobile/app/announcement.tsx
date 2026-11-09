import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Megaphone } from 'lucide-react-native';

export default function AnnouncementScreen() {
  const params=useLocalSearchParams<{title?:string;body?:string}>();
  const title=String(params.title??'Detail announcement');
  const body=String(params.body??'');
  return <SafeAreaView className="flex-1 bg-[#F3F1FC]">
    <View className="flex-row items-center px-5 pt-4 pb-4">
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Detail" onPress={()=>router.back()} className="w-10 h-10 bg-white rounded-2xl items-center justify-center border border-ink/5">
        <ArrowLeft size={18} color="#150256" />
      </TouchableOpacity>
      <Text className="flex-1 text-center text-base font-display font-black text-ink mr-10">Announcement</Text>
    </View>
    <ScrollView contentContainerClassName="px-5 pb-10">
      <View className="bg-white rounded-3xl p-6 border border-ink/5">
        <View className="w-12 h-12 bg-accent/10 rounded-2xl items-center justify-center mb-5"><Megaphone size={22} color="#3906D2" /></View>
        <Text accessibilityRole="header" className="text-2xl font-display font-black text-ink">{title}</Text>
        <Text className="font-sans text-base leading-7 text-ink/70 mt-4">{body}</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
