import React, { useEffect, useState, useRef } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Send, MessageSquare, ImagePlus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import {
  db,
  doc,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  orderBy,
  serverTimestamp,
  writeBatch,
  increment,
} from '../../services/firebase';
import { uploadChatPhoto } from '../../services/storage';
import { ChatMessage } from '../../types';

const QUICK_REPLIES = ['On my way!', 'Sounds good', "I'm here", 'Thank you!'];

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
  const params = useLocalSearchParams<{ jobId?: string }>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(params.jobId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const isCustomer = profile?.role === 'CUSTOMER';
  const unreadField = isCustomer ? 'customerUnread' : 'cleanerUnread';

  // Load conversations from jobs the user is part of
  useEffect(() => {
    if (!user) return;
    const field = isCustomer ? 'customerId' : 'cleanerId';
    const q = query(collection(db, 'jobs'), where(field, '==', user.uid));
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
      },
      () => setIsLoading(false)
    );
  }, [user, isCustomer, unreadField]);

  // Load messages for active conversation and reset unread count
  useEffect(() => {
    if (!activeJobId || !user) return;

    // Reset this user's unread count when opening a conversation
    updateDoc(doc(db, 'jobs', activeJobId), { [unreadField]: 0 }).catch(() => {});

    const q = query(
      collection(db, 'messages'),
      where('jobId', '==', activeJobId),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage)));
      // Scroll to bottom on new messages
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
  }, [activeJobId, user, unreadField]);

  const sendMessage = async (override?: string) => {
    const text = (override ?? inputText).trim();
    if (!text || !activeJobId || !user) return;
    if (!override) setInputText('');

    // Use a batch to atomically write the message and update the job's lastMessage + increment other party's unread
    const batch = writeBatch(db);
    const messageRef = doc(collection(db, 'messages'));
    batch.set(messageRef, {
      jobId: activeJobId,
      senderId: user.uid,
      senderName: profile?.displayName,
      text,
      createdAt: serverTimestamp(),
    });

    const otherUnreadField = isCustomer ? 'cleanerUnread' : 'customerUnread';
    const jobRef = doc(db, 'jobs', activeJobId);
    batch.update(jobRef, {
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      // Atomically increment the OTHER user's unread count, reset our own
      [otherUnreadField]: increment(1),
      [unreadField]: 0,
    });

    await batch.commit().catch(() => {});
  };

  const [isSendingPhoto, setIsSendingPhoto] = useState(false);

  const uploadAndSend = async (uri: string) => {
    if (!activeJobId || !user) return;
    setIsSendingPhoto(true);
    try {
      const imageUrl = await uploadChatPhoto(uri, activeJobId);
      const batch = writeBatch(db);
      const messageRef = doc(collection(db, 'messages'));
      batch.set(messageRef, {
        jobId: activeJobId,
        senderId: user.uid,
        senderName: profile?.displayName,
        text: '',
        imageUrl,
        createdAt: serverTimestamp(),
      });
      const otherUnreadField = isCustomer ? 'cleanerUnread' : 'customerUnread';
      batch.update(doc(db, 'jobs', activeJobId), {
        lastMessage: '📷 Photo',
        lastMessageAt: serverTimestamp(),
        [otherUnreadField]: increment(1),
        [unreadField]: 0,
      });
      await batch.commit();
    } catch {
      // Best-effort — chat stays usable even if a photo upload fails
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
              <Text className="text-base font-black text-slate-900">
                {convo?.otherUserName ?? 'Chat'}
              </Text>
              <Text className="text-xs text-slate-400 font-medium">
                Job #{activeJobId.slice(-6).toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 8 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
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
                  <Text className="text-xs font-bold text-slate-600">{reply}</Text>
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
              className="flex-1 bg-slate-50 rounded-2xl px-4 py-3 text-sm font-medium text-slate-900 border border-slate-100"
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
                <Text className="text-xl">💬</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-black text-slate-900">{item.otherUserName}</Text>
                <Text className="text-xs text-slate-400 font-medium mt-0.5" numberOfLines={1}>
                  {item.lastMessage}
                </Text>
              </View>
              {item.unreadCount > 0 && (
                <View className="w-5 h-5 bg-accent rounded-full items-center justify-center">
                  <Text className="text-[10px] font-black text-white">
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
