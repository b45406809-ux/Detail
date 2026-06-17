import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Send, MessageSquare } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  orderBy,
  serverTimestamp,
} from '../../services/firebase';
import { ChatMessage } from '../../types';
import { Image } from 'expo-image';

interface Conversation {
  jobId: string;
  otherUserName: string;
  otherUserPhoto: string;
  lastMessage: string;
  lastMessageAt: any;
  unread: number;
}

export default function MessagesScreen() {
  const { user, profile } = useAuth();
  const params = useLocalSearchParams<{ jobId?: string }>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(params.jobId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Load conversations (jobs the user is part of that have messages)
  useEffect(() => {
    if (!user) return;
    const field = profile?.role === 'CUSTOMER' ? 'customerId' : 'cleanerId';
    const q = query(collection(db, 'jobs'), where(field, '==', user.uid));
    return onSnapshot(q, (snap) => {
      const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      const convos: Conversation[] = jobs.map((job: any) => ({
        jobId: job.id,
        otherUserName:
          profile?.role === 'CUSTOMER'
            ? job.cleanerName ?? 'Cleaner'
            : job.customerName ?? 'Customer',
        otherUserPhoto:
          profile?.role === 'CUSTOMER' ? job.cleanerPhoto ?? '' : job.customerPhoto ?? '',
        lastMessage: job.lastMessage ?? 'No messages yet',
        lastMessageAt: job.lastMessageAt,
        unread: job.unreadCount ?? 0,
      }));
      setConversations(convos);
      setIsLoading(false);
    });
  }, [user, profile]);

  // Load messages for active job
  useEffect(() => {
    if (!activeJobId) return;
    const q = query(
      collection(db, 'messages'),
      where('jobId', '==', activeJobId),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage)));
    });
  }, [activeJobId]);

  const sendMessage = async () => {
    if (!inputText.trim() || !activeJobId || !user) return;
    const text = inputText.trim();
    setInputText('');
    await addDoc(collection(db, 'messages'), {
      jobId: activeJobId,
      senderId: user.uid,
      senderName: profile?.displayName,
      text,
      createdAt: serverTimestamp(),
    });
  };

  if (activeJobId) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Chat header */}
          <View className="flex-row items-center gap-3 px-4 py-3 border-b border-slate-100">
            <TouchableOpacity
              onPress={() => setActiveJobId(null)}
              className="w-10 h-10 items-center justify-center"
            >
              <ArrowLeft size={22} color="#0f172a" />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-base font-black text-slate-900">
                {conversations.find((c) => c.jobId === activeJobId)?.otherUserName ?? 'Chat'}
              </Text>
              <Text className="text-xs text-slate-400 font-medium">Job #{activeJobId.slice(-6)}</Text>
            </View>
          </View>

          {/* Messages */}
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerClassName="px-4 py-4 gap-3"
            renderItem={({ item }) => {
              const isMe = item.senderId === user?.uid;
              return (
                <View className={`flex-row ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <View
                    className={`max-w-[78%] px-4 py-3 rounded-3xl ${
                      isMe
                        ? 'bg-accent rounded-tr-sm'
                        : 'bg-slate-100 rounded-tl-sm'
                    }`}
                  >
                    <Text className={`text-sm font-medium ${isMe ? 'text-white' : 'text-slate-900'}`}>
                      {item.text}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          {/* Input */}
          <View className="flex-row items-center gap-3 px-4 py-3 border-t border-slate-100">
            <TextInput
              className="flex-1 bg-slate-50 rounded-2xl px-4 py-3 text-sm font-medium text-slate-900 border border-slate-100"
              placeholder="Type a message…"
              placeholderTextColor="#94a3b8"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={sendMessage}
              disabled={!inputText.trim()}
              className={`w-11 h-11 rounded-2xl items-center justify-center ${
                inputText.trim() ? 'bg-accent' : 'bg-slate-100'
              }`}
            >
              <Send size={18} color={inputText.trim() ? '#fff' : '#94a3b8'} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F2F1F5]">
      {/* Header */}
      <View className="px-5 pt-4 pb-4">
        <Text className="text-2xl font-black text-slate-900 tracking-tight">Messages</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#3906d2" />
        </View>
      ) : conversations.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-20 h-20 bg-slate-100 rounded-3xl items-center justify-center mb-4">
            <MessageSquare size={36} color="#94a3b8" />
          </View>
          <Text className="text-lg font-black text-slate-700 text-center">No conversations yet</Text>
          <Text className="text-sm text-slate-400 font-medium text-center mt-2">
            Messages with your cleaners will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.jobId}
          contentContainerClassName="px-5 gap-3 pb-8"
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setActiveJobId(item.jobId)}
              className="bg-white rounded-3xl p-4 flex-row items-center gap-4 border border-slate-100 shadow-sm"
              activeOpacity={0.8}
            >
              <View className="w-12 h-12 bg-accent/10 rounded-2xl items-center justify-center">
                <Text className="text-xl">💬</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-black text-slate-900">{item.otherUserName}</Text>
                <Text className="text-xs text-slate-400 font-medium mt-0.5" numberOfLines={1}>
                  {item.lastMessage}
                </Text>
              </View>
              {item.unread > 0 && (
                <View className="w-5 h-5 bg-accent rounded-full items-center justify-center">
                  <Text className="text-[10px] font-black text-white">{item.unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}
