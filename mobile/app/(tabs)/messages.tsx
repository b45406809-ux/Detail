import React, { useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  ActionSheetIOS,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingList } from '../../components/LoadingList';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Send, MessageSquare, ImagePlus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  getDocs,
  supabase,
} from '../../services/supabase';
import { uploadChatPhoto } from '../../services/storage';
import { ChatMessage } from '../../types';

const QUICK_REPLIES = ['On my way!', 'Sounds good', "I'm here", 'Thank you!'];
const messageTime = (value: any) => value?.toDate?.().getTime?.() ?? new Date(value).getTime();

interface Conversation {
  jobId: string;
  otherUserName: string;
  otherUserPhoto: string;
  lastMessage: string;
  lastMessageAt: any;
  unreadCount: number;
}

export default function MessagesScreen() {
  const { user, profile } = useAuth();
  const userId = user?.uid;
  const params = useLocalSearchParams<{ jobId?: string }>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(params.jobId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [conversationError, setConversationError] = useState('');
  const [chatRetry, setChatRetry] = useState(0);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [chatError, setChatError] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const preserveChatScrollRef = useRef(false);
  const reachedHistoryStartRef = useRef(false);
  const pendingMessageIntentsRef = useRef(new Map<string, { key: string; storageKey: string; imagePath?: string }>());

  const getPendingMessageIntent = async (kind: 'text' | 'photo', value: string) => {
    if (!user || !activeJobId) throw new Error('Open a booking conversation before sending a message.');
    const intent = `${user.uid}:${activeJobId}:${kind}:${value}`;
    const cached = pendingMessageIntentsRef.current.get(intent);
    if (cached) return { intent, pending: cached };
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, intent);
    const storageKey = `detail:pending-chat-message:${user.uid}:${digest}`;
    const raw = await AsyncStorage.getItem(storageKey);
    let pending: { key: string; storageKey: string; imagePath?: string };
    try {
      const saved = raw ? JSON.parse(raw) : null;
      pending = saved?.key ? { ...saved, storageKey } : { key: Crypto.randomUUID(), storageKey };
    } catch {
      pending = { key: Crypto.randomUUID(), storageKey };
    }
    await AsyncStorage.setItem(storageKey, JSON.stringify({ key: pending.key, imagePath: pending.imagePath }));
    pendingMessageIntentsRef.current.set(intent, pending);
    return { intent, pending };
  };

  const savePendingMessageIntent = async (intent: string, pending: { key: string; storageKey: string; imagePath?: string }) => {
    await AsyncStorage.setItem(pending.storageKey, JSON.stringify({ key: pending.key, imagePath: pending.imagePath }));
    pendingMessageIntentsRef.current.set(intent, pending);
  };

  const clearPendingMessageIntent = async (intent: string, pending: { key: string; storageKey: string; imagePath?: string }) => {
    pendingMessageIntentsRef.current.delete(intent);
    await AsyncStorage.removeItem(pending.storageKey).catch(() => undefined);
  };

  const isCustomer = profile?.role === 'CUSTOMER';
  const unreadField = isCustomer ? 'customerUnread' : 'cleanerUnread';

  // Load conversations from jobs the user is part of
  useEffect(() => {
    if (!userId) { setConversations([]); setIsLoading(false); return; }
    setIsLoading(true);
    setConversationError('');
    const field = isCustomer ? 'customerId' : 'cleanerId';
    const q = query(collection(db, 'jobs'), where(field, '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        const convos: Conversation[] = jobs
          .filter((job: any) => job.cleanerId) // only show once a cleaner is assigned
          .map((job: any) => ({
            jobId: job.id,
            otherUserName: isCustomer
              ? job.cleanerName ?? 'Cleaner'
              : job.customerName ?? 'Customer',
            otherUserPhoto: isCustomer ? job.cleanerPhoto ?? '' : job.customerPhoto ?? '',
            lastMessage: job.lastMessage ?? 'No messages yet',
            lastMessageAt: job.lastMessageAt,
            unreadCount: job[unreadField] ?? 0,
          }));
        setConversations(convos);
        setIsLoading(false);
        setConversationError('');
      },
      (err) => { setIsLoading(false); setConversationError(err.message || 'Conversations could not be loaded.'); }
    );
  }, [userId, isCustomer, unreadField, chatRetry]);

  // Load messages for active conversation and reset unread count
  useEffect(() => {
    if (!activeJobId || !userId) return;

    // Read-state writes are authorized and serialized with message writes.
    supabase.rpc('mark_job_messages_read', { p_job_id: activeJobId }).then(({ error }) => {
      if (error) console.warn('Could not mark conversation as read:', error.message);
    });

    const q = query(
      collection(db, 'messages'),
      where('jobId', '==', activeJobId),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    setMessages([]);
    setHasOlderMessages(false);
    setChatError('');
    reachedHistoryStartRef.current = false;
    return onSnapshot(q, (snap) => {
      setChatError('');
      const page = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage)).reverse();
      setHasOlderMessages(snap.size >= 100 && !reachedHistoryStartRef.current);
      setMessages(current => {
        const merged = new Map(current.map(message => [message.id, message]));
        page.forEach(message => merged.set(message.id, message));
        return [...merged.values()].sort((left, right) => messageTime(left.createdAt) - messageTime(right.createdAt));
      });
      // Scroll to bottom on new messages
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, err => setChatError(err.message || 'Messages could not be refreshed.'));
  }, [activeJobId, userId, chatRetry]);

  const loadOlderMessages = async () => {
    const oldest = messages[0];
    if (!activeJobId || !oldest || isLoadingOlder) return;
    const requestedJobId = activeJobId;
    setIsLoadingOlder(true);
    setChatError('');
    try {
      const page = await getDocs(query(
        collection(db, 'messages'),
        where('jobId', '==', activeJobId),
        where('createdAt', '<', oldest.createdAt),
        orderBy('createdAt', 'desc'),
        limit(100)
      ));
      if (activeJobId !== requestedJobId) return;
      const older = page.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)).reverse();
      preserveChatScrollRef.current = true;
      setMessages(current => {
        const merged = new Map(older.map(message => [message.id, message]));
        current.forEach(message => merged.set(message.id, message));
        return [...merged.values()].sort((left, right) => messageTime(left.createdAt) - messageTime(right.createdAt));
      });
      reachedHistoryStartRef.current = page.size < 100;
      setHasOlderMessages(page.size === 100);
    } catch (error: any) {
      setChatError(error.message || 'Older messages could not be loaded.');
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const sendMessage = async (override?: string) => {
    const text = (override ?? inputText).trim();
    if (!text || !activeJobId || !user) return;
    try {
      const { intent, pending } = await getPendingMessageIntent('text', text);
      const { error } = await supabase.rpc('send_job_message', { p_job_id: activeJobId, p_text: text, p_image_path: null, p_idempotency_key: pending.key });
      if (error) throw error;
      await clearPendingMessageIntent(intent, pending);
      if (!override) setInputText('');
    } catch (error) {
      console.error('Could not send message:', error);
      Alert.alert('Message not sent', 'Check your connection and try again.');
    }
  };

  const [isSendingPhoto, setIsSendingPhoto] = useState(false);

  const uploadAndSend = async (uri: string) => {
    if (!activeJobId || !user) return;
    setIsSendingPhoto(true);
    try {
      const { intent, pending } = await getPendingMessageIntent('photo', uri);
      const imageUrl = pending.imagePath ?? await uploadChatPhoto(uri, activeJobId);
      pending.imagePath = imageUrl;
      await savePendingMessageIntent(intent, pending);
      const { error } = await supabase.rpc('send_job_message', { p_job_id: activeJobId, p_text: '', p_image_path: imageUrl, p_idempotency_key: pending.key });
      if (error) throw error;
      await clearPendingMessageIntent(intent, pending);
    } catch (error) {
      console.error('Could not send chat photo:', error);
      Alert.alert('Photo not sent', 'Check your connection and try again.');
    } finally {
      setIsSendingPhoto(false);
    }
  };

  const sendPhoto = async () => {
    if (!activeJobId || !user) return;

    const pickFromLibrary = async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Allow access to your photo library.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (!result.canceled && result.assets?.[0]) uploadAndSend(result.assets[0].uri);
    };

    const takePhoto = async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Allow camera access to take photos.'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets?.[0]) uploadAndSend(result.assets[0].uri);
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (idx) => { if (idx === 1) takePhoto(); else if (idx === 2) pickFromLibrary(); }
      );
    } else {
      // Android: simple Alert-based picker
      Alert.alert('Send Photo', undefined, [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickFromLibrary },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const openConversation = (jobId: string) => {
    setActiveJobId(jobId);
  };

  if (activeJobId) {
    const convo = conversations.find((c) => c.jobId === activeJobId);
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
              <Text className="text-base font-display font-black text-slate-900">
                {convo?.otherUserName ?? 'Chat'}
              </Text>
              <Text className="font-sans text-xs text-slate-400 font-medium">
                Job #{activeJobId.slice(-6).toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Messages */}
          {chatError ? <View className="items-center px-4 py-2"><Text accessibilityRole="alert" className="text-center text-xs text-rose-700">{chatError}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setChatRetry(value => value + 1)} className="mt-1 rounded-full bg-rose-50 px-3 py-1"><Text className="text-xs font-bold text-rose-800">Retry messages</Text></TouchableOpacity></View> : null}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 8 }}
            onContentSizeChange={() => { if (preserveChatScrollRef.current) { preserveChatScrollRef.current = false; return; } flatListRef.current?.scrollToEnd({ animated: false }); }}
            ListHeaderComponent={hasOlderMessages ? <TouchableOpacity accessibilityRole="button" disabled={isLoadingOlder} onPress={loadOlderMessages} className="self-center rounded-full bg-slate-100 px-4 py-2"><Text className="text-xs font-bold text-slate-700">{isLoadingOlder ? 'Loading older messages…' : 'Load older messages'}</Text></TouchableOpacity> : null}
            renderItem={({ item }) => {
              const isMe = item.senderId === user?.uid;
              return (
                <View className={`flex-row ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={{ width: 180, height: 180, borderRadius: 20 }} />
                  ) : (
                    <View
                      className={`max-w-[78%] px-4 py-3 rounded-3xl ${
                        isMe ? 'bg-accent rounded-tr-sm' : 'bg-slate-100 rounded-tl-sm'
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${isMe ? 'text-white' : 'text-slate-900'}`}
                      >
                        {item.text}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }}
          />

          {/* Quick replies */}
          <View className="px-4 pb-2">
            <FlatList
              data={QUICK_REPLIES}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(r) => r}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item: reply }) => (
                <TouchableOpacity
                  onPress={() => sendMessage(reply)}
                  className="bg-slate-100 px-4 py-2 rounded-full border border-slate-200"
                >
                  <Text className="font-sans text-xs font-bold text-slate-600">{reply}</Text>
                </TouchableOpacity>
              )}
            />
          </View>

          {/* Input */}
          <View className="flex-row items-center gap-3 px-4 py-3 border-t border-slate-100">
            <TouchableOpacity
              onPress={sendPhoto}
              disabled={isSendingPhoto}
              className="w-11 h-11 rounded-2xl items-center justify-center bg-accent/10"
            >
              {isSendingPhoto ? <ActivityIndicator size="small" color="#3906D2" /> : <ImagePlus size={18} color="#3906D2" />}
            </TouchableOpacity>
            <TextInput
              className="font-sans flex-1 bg-slate-50 rounded-2xl px-4 py-3 text-sm font-medium text-slate-900 border border-slate-100"
              placeholder="Type a message…"
              placeholderTextColor="#94a3b8"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              onSubmitEditing={() => sendMessage()}
              returnKeyType="send"
            />
            <TouchableOpacity
              onPress={() => sendMessage()}
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
        <Text className="text-2xl font-display font-black text-slate-900 tracking-tight">Messages</Text>
      </View>

      {isLoading ? (
        <LoadingList />
      ) : conversationError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text accessibilityRole="alert" className="text-center text-sm text-rose-700">{conversationError}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => { setIsLoading(true); setChatRetry(value => value + 1); }} className="mt-4 rounded-full bg-accent px-5 py-3"><Text className="font-bold text-white">Try again</Text></TouchableOpacity>
        </View>
      ) : conversations.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-20 h-20 bg-slate-100 rounded-3xl items-center justify-center mb-4">
            <MessageSquare size={36} color="#94a3b8" />
          </View>
          <Text className="text-lg font-display font-black text-slate-700 text-center">No conversations yet</Text>
          <Text className="font-sans text-sm text-slate-400 font-medium text-center mt-2">
            Messages will appear here once a job is accepted
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.jobId}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => openConversation(item.jobId)}
              className="bg-white rounded-3xl p-4 flex-row items-center gap-4 border border-slate-100 shadow-sm"
              activeOpacity={0.8}
            >
              <View className="w-12 h-12 bg-accent/10 rounded-2xl items-center justify-center">
                <Text className="font-sans text-xl">💬</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-display font-black text-slate-900">{item.otherUserName}</Text>
                <Text className="font-sans text-xs text-slate-400 font-medium mt-0.5" numberOfLines={1}>
                  {item.lastMessage}
                </Text>
              </View>
              {item.unreadCount > 0 && (
                <View className="w-5 h-5 bg-accent rounded-full items-center justify-center">
                  <Text className="text-[10px] font-display font-black text-white">
                    {item.unreadCount > 9 ? '9+' : item.unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}
