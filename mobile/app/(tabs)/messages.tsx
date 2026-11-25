import { showPermissionDenied } from '@/utils/permissionPrompt';
import { RemoteImage, prefetchPhotos } from '../../components/RemoteImage';
import { appAlert } from '@/components/AppDialog';
import React, { useEffect, useState, useRef } from 'react';
import { Audio } from 'expo-av';
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

} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingList } from '../../components/LoadingList';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Send, MessageSquare, ImagePlus, Mic, Play, Pause, Square, X, MoreHorizontal, Flag } from 'lucide-react-native';
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
import { uploadChatPhoto, uploadChatVoiceNote } from '../../services/storage';
import { callFunction } from '../../services/functions';
import { ChatMessage } from '../../types';

const QUICK_REPLIES = ['On my way!', 'Sounds good', "I'm here", 'Thank you!'];
const MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_VOICE_NOTE_MS = 60_000;
const messageTime = (value: any) => value?.toDate?.().getTime?.() ?? new Date(value).getTime();

interface Conversation {
  jobId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserPhoto: string;
  lastMessage: string;
  lastMessageAt: any;
  unreadCount: number;
  jobStatus: string;
}

export default function MessagesScreen() {
  const { user, profile } = useAuth();
  const userId = user?.uid;
  const params = useLocalSearchParams<{ jobId?: string }>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(params.jobId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [now, setNow] = useState(Date.now());
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [conversationError, setConversationError] = useState('');
  const [chatRetry, setChatRetry] = useState(0);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [chatError, setChatError] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedMe, setBlockedMe] = useState(false);
  const conversationBlocked = blockedByMe || blockedMe;
  const [safetyStateLoading, setSafetyStateLoading] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
    setPlayingMessageId(null);
    playbackMessageRef.current = null;
    return () => {
      playbackGenerationRef.current += 1;
      const recording = voiceRecordingRef.current;
      voiceRecordingRef.current = null;
      if (recording) void recording.stopAndUnloadAsync().catch(() => undefined);
      const sound = playbackSoundRef.current;
      playbackSoundRef.current = null;
      if (sound) void sound.unloadAsync().catch(() => undefined);
      void Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => undefined);
    };
  }, [activeJobId]);
  const flatListRef = useRef<FlatList>(null);
  const preserveChatScrollRef = useRef(false);
  const reachedHistoryStartRef = useRef(false);
  const pendingMessageIntentsRef = useRef(new Map<string, { key: string; storageKey: string; imagePath?: string }>());
  const voiceRecordingRef = useRef<Audio.Recording | null>(null);
  const playbackSoundRef = useRef<Audio.Sound | null>(null);
  const playbackMessageRef = useRef<string | null>(null);
  const playbackGenerationRef = useRef(0);
  const activeConversation = conversations.find(conversation => conversation.jobId === activeJobId);
  const chatReadOnly = !activeConversation?.otherUserId || ['CANCELLED', 'CANCELED'].includes(activeConversation.jobStatus);

  useEffect(() => {
    if (!activeJobId || !userId) { setBlockedByMe(false); setBlockedMe(false); return; }
    let active = true;
    setBlockedByMe(false); setBlockedMe(false);
    setSafetyStateLoading(true);
    void Promise.resolve(supabase.rpc('get_message_safety_state', { p_job_id: activeJobId })).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.warn('Could not load conversation safety settings:', error.message);
        return;
      }
      setBlockedByMe(data?.blockedByMe === true);
      setBlockedMe(data?.blockedMe === true);
    }).catch((error: unknown) => {
      if (active) console.warn('Could not load conversation safety settings:', error);
    }).finally(() => { if (active) setSafetyStateLoading(false); });
    return () => { active = false; };
  }, [activeJobId, userId]);

  const submitSafetyReport = async (category: string, message?: ChatMessage) => {
    if (!activeJobId || !activeConversation?.otherUserId) return;
    try {
      await callFunction('reportUserContent', {
        jobId: activeJobId,
        targetUserId: activeConversation.otherUserId,
        category,
        messageId: message?.id,
      });
      appAlert('Report sent', 'Detail support received your report. You can also block this person from the conversation menu.');
    } catch (error) {
      appAlert('Could not send report', error instanceof Error ? error.message : 'Try again or contact Detail support.');
    }
  };

  const chooseReportReason = (message?: ChatMessage) => appAlert(
    message ? 'Report this message' : 'Report this person',
    'Choose the reason that best describes the safety concern.',
    [
      { text: 'Harassment or bullying', onPress: () => void submitSafetyReport('HARASSMENT', message) },
      { text: 'Scam or off-app payment request', onPress: () => void submitSafetyReport('SCAM_OR_OFF_PLATFORM_REQUEST', message) },
      { text: 'Inappropriate message or media', onPress: () => void submitSafetyReport('INAPPROPRIATE_CONTENT', message) },
      { text: 'Other safety concern', onPress: () => void submitSafetyReport('OTHER_SAFETY_CONCERN', message) },
      { text: 'Cancel', style: 'cancel' },
    ],
  );

  const blockConversationPartner = () => {
    if (!activeJobId || !activeConversation?.otherUserId) return;
    if (blockedByMe) {
      appAlert('Unblock this person?', 'They will be able to send messages for this booking again.', [
        { text: 'Unblock', onPress: async () => {
          const { error } = await supabase.rpc('unblock_user', { p_target_user_id: activeConversation.otherUserId });
          if (error) { appAlert('Could not unblock person', error.message); return; }
          setBlockedByMe(false);
        } },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    appAlert('Block this person?', 'They will not be able to send you messages in Detail. Your booking history and existing messages stay available.', [
      { text: 'Block person', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('block_user', { p_job_id: activeJobId, p_target_user_id: activeConversation.otherUserId });
        if (error) { appAlert('Could not block person', error.message); return; }
        setBlockedByMe(true);
      } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const getPendingMessageIntent = async (kind: 'text' | 'photo' | 'voice', value: string) => {
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
            otherUserId: isCustomer ? job.cleanerId : job.customerId,
            otherUserName: isCustomer
              ? job.cleanerName ?? 'Cleaner'
              : job.customerName ?? 'Customer',
            otherUserPhoto: isCustomer ? job.cleanerPhoto ?? '' : job.customerPhoto ?? '',
            lastMessage: job.lastMessageAt && messageTime(job.lastMessageAt) < Date.now() - MESSAGE_RETENTION_MS ? 'No recent messages' : job.lastMessage ?? 'No messages yet',
            lastMessageAt: job.lastMessageAt,
            unreadCount: job.lastMessageAt && messageTime(job.lastMessageAt) < Date.now() - MESSAGE_RETENTION_MS ? 0 : job[unreadField] ?? 0,
            jobStatus: String(job.status ?? '').toUpperCase(),
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
      where('createdAt', '>=', new Date(Date.now() - MESSAGE_RETENTION_MS)),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    setMessages([]);
    setHasOlderMessages(false);
    setChatError('');
    reachedHistoryStartRef.current = false;
    return onSnapshot(q, (snap) => {
      setChatError('');
      const page = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage))
        .filter(message => messageTime(message.createdAt) >= Date.now() - MESSAGE_RETENTION_MS)
        .reverse();
      setHasOlderMessages(snap.size === 100);
      setMessages(current => {
        const merged = new Map(current.map(message => [message.id, message]));
        page.forEach(message => merged.set(message.id, message));
        return [...merged.values()].filter(message => messageTime(message.createdAt) >= Date.now() - MESSAGE_RETENTION_MS).sort((left, right) => messageTime(left.createdAt) - messageTime(right.createdAt));
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
        where('createdAt', '>=', new Date(Date.now() - MESSAGE_RETENTION_MS)),
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
    if (!text || !activeJobId || !user || chatReadOnly || conversationBlocked) return;
    try {
      const { intent, pending } = await getPendingMessageIntent('text', text);
      const { error } = await supabase.rpc('send_job_message', { p_job_id: activeJobId, p_text: text, p_image_path: null, p_idempotency_key: pending.key });
      if (error) throw error;
      await clearPendingMessageIntent(intent, pending);
      if (!override) setInputText('');
    } catch (error) {
      console.error('Could not send message:', error);
      const detail = error instanceof Error ? error.message : '';
      const blocked = detail.includes('MESSAGING_BLOCKED');
      const filtered = detail.includes('CHAT_CONTENT_FILTERED');
      appAlert(blocked || filtered ? 'Message unavailable' : 'Message not sent', blocked
        ? 'A participant has blocked this conversation. Existing history remains available.'
        : filtered ? 'Please remove abusive language and send a respectful message.' : 'Check your connection and try again.');
    }
  };

  const [isSendingPhoto, setIsSendingPhoto] = useState(false);

  const uploadAndSend = async (uri: string) => {
    if (!activeJobId || !user || chatReadOnly || conversationBlocked) return;
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
      appAlert('Photo not sent', 'Check your connection and try again.');
    } finally {
      setIsSendingPhoto(false);
    }
  };

  const uploadAndSendVoice = async (uri: string) => {
    if (!activeJobId || !user || chatReadOnly || conversationBlocked) return;
    setIsSendingVoice(true);
    try {
      const { intent, pending } = await getPendingMessageIntent('voice', uri);
      const mediaPath = pending.imagePath ?? await uploadChatVoiceNote(uri, activeJobId);
      pending.imagePath = mediaPath;
      await savePendingMessageIntent(intent, pending);
      const { error } = await supabase.rpc('send_job_message', {
        p_job_id: activeJobId,
        p_text: 'Voice message',
        p_image_path: mediaPath,
        p_idempotency_key: pending.key,
      });
      if (error) throw error;
      await clearPendingMessageIntent(intent, pending);
    } catch (error) {
      console.error('Could not send chat voice note:', error);
      appAlert('Voice note not sent', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setIsSendingVoice(false);
    }
  };

  const finishVoiceRecording = async (send: boolean) => {
    const recording = voiceRecordingRef.current;
    if (!recording) return;
    voiceRecordingRef.current = null;
    setIsRecordingVoice(false);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      if (send && uri) await uploadAndSendVoice(uri);
    } catch (error) {
      console.warn('Could not finish chat voice recording:', error instanceof Error ? error.message : 'unknown error');
      if (send) appAlert('Voice note not saved', 'Try recording again.');
    } finally {
      setRecordingSeconds(0);
    }
  };

  const startVoiceRecording = async () => {
    if (Platform.OS === 'web' || !activeJobId || !user || chatReadOnly || conversationBlocked || isSendingVoice) return;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        showPermissionDenied('Allow microphone access to record a voice note.', permission.canAskAgain);
        return;
      }
      const playback = playbackSoundRef.current;
      playbackSoundRef.current = null;
      playbackMessageRef.current = null;
      setPlayingMessageId(null);
      if (playback) await playback.unloadAsync().catch(() => undefined);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, shouldDuckAndroid: true, playThroughEarpieceAndroid: false });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        status => {
          if (!status.isRecording) return;
          const elapsed = Math.floor(status.durationMillis / 1000);
          setRecordingSeconds(elapsed);
          if (status.durationMillis >= MAX_VOICE_NOTE_MS) void finishVoiceRecording(true);
        },
        250,
      );
      voiceRecordingRef.current = recording;
      setRecordingSeconds(0);
      setIsRecordingVoice(true);
    } catch (error) {
      console.warn('Could not start chat voice recording:', error instanceof Error ? error.message : 'unknown error');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => undefined);
      appAlert('Could not record voice note', error instanceof Error ? error.message : 'Check microphone permissions and try again.');
    }
  };

  const toggleVoicePlayback = async (messageId: string, uri: string) => {
    try {
      const currentSound = playbackSoundRef.current;
      if (playbackMessageRef.current === messageId && currentSound) {
        const status = await currentSound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await currentSound.pauseAsync();
          setPlayingMessageId(null);
        } else if (status.isLoaded) {
          await currentSound.playAsync();
          setPlayingMessageId(messageId);
        }
        return;
      }
      playbackGenerationRef.current += 1;
      const generation = playbackGenerationRef.current;
      const previous = playbackSoundRef.current;
      playbackSoundRef.current = null;
      playbackMessageRef.current = messageId;
      setPlayingMessageId(messageId);
      if (previous) await previous.unloadAsync().catch(() => undefined);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, shouldDuckAndroid: true });
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true }, status => {
        if (generation !== playbackGenerationRef.current || !status.isLoaded) return;
        if (status.didJustFinish) {
          const finishedSound = playbackSoundRef.current;
          playbackSoundRef.current = null;
          playbackMessageRef.current = null;
          setPlayingMessageId(null);
          if (finishedSound) void finishedSound.unloadAsync().catch(() => undefined);
        }
      });
      if (generation !== playbackGenerationRef.current) {
        await sound.unloadAsync().catch(() => undefined);
        return;
      }
      playbackSoundRef.current = sound;
    } catch (error) {
      playbackGenerationRef.current += 1;
      const failedSound = playbackSoundRef.current;
      playbackSoundRef.current = null;
      playbackMessageRef.current = null;
      setPlayingMessageId(null);
      if (failedSound) await failedSound.unloadAsync().catch(() => undefined);
      appAlert('Could not play voice note', error instanceof Error ? error.message : 'Try again in a moment.');
    }
  };

  const sendPhoto = async () => {
    if (!activeJobId || !user || chatReadOnly || conversationBlocked) return;

    const pickFromLibrary = async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showPermissionDenied('Allow access to your photo library.', perm.canAskAgain); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (!result.canceled && result.assets?.[0]) uploadAndSend(result.assets[0].uri);
    };

    const takePhoto = async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { showPermissionDenied('Allow camera access to take photos.', perm.canAskAgain); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets?.[0]) uploadAndSend(result.assets[0].uri);
    };

    appAlert('Send Photo', undefined, [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Conversation safety options"
              disabled={!activeConversation?.otherUserId || safetyStateLoading}
              onPress={() => appAlert('Conversation safety', 'Report a safety concern to Detail or block this person.', [
                { text: 'Report person', onPress: () => chooseReportReason() },
                { text: blockedByMe ? 'Unblock person' : 'Block person', style: blockedByMe ? 'default' : 'destructive', onPress: blockConversationPartner },
                { text: 'Cancel', style: 'cancel' },
              ])}
              className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
            >
              <MoreHorizontal size={20} color="#334155" />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          {chatError ? <View className="items-center px-4 py-2"><Text accessibilityRole="alert" className="text-center text-xs text-rose-700">{chatError}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setChatRetry(value => value + 1)} className="mt-1 rounded-full bg-rose-50 px-3 py-1"><Text className="text-xs font-bold text-rose-800">Retry messages</Text></TouchableOpacity></View> : null}
        {chatReadOnly ? <View className="mx-4 mt-3 rounded-2xl bg-slate-100 px-4 py-3"><Text className="text-xs font-bold text-slate-700">{activeConversation ? 'This booking is cancelled. Recent messages are read-only.' : 'Chat is available once a cleaner is assigned.'}</Text></View> : null}
        {conversationBlocked ? <View className="mx-4 mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3"><Text className="text-xs font-bold text-rose-900">{blockedByMe ? 'You blocked this person' : 'This person blocked you'}</Text><Text className="mt-1 text-xs leading-5 text-rose-800">Existing history stays available. New messages, photos and voice notes are disabled{blockedByMe ? ' until you unblock them from the conversation menu.' : ' in this conversation.'}</Text></View> : null}
        <View className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Text className="text-xs font-bold text-amber-950">Stay safe on Detail</Text>
          <Text className="mt-1 text-xs leading-5 text-amber-900">Messages stay visible to booking participants for 24 hours. After that, only authorized Detail admins can access the retained conversation for support and safety. Abusive language is screened automatically. Keep booking communication in Detail and arrange payment directly with your cleaner. Never share verification codes. Use the conversation menu to report or block someone; you can also report a message below.</Text>
        </View>
        <FlatList
            ref={flatListRef}
          data={messages.filter(message => messageTime(message.createdAt) >= now - MESSAGE_RETENTION_MS)}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 8 }}
            onContentSizeChange={() => { if (preserveChatScrollRef.current) { preserveChatScrollRef.current = false; return; } flatListRef.current?.scrollToEnd({ animated: false }); }}
            ListHeaderComponent={hasOlderMessages ? <TouchableOpacity accessibilityRole="button" disabled={isLoadingOlder} onPress={loadOlderMessages} className="self-center rounded-full bg-slate-100 px-4 py-2"><Text className="text-xs font-bold text-slate-700">{isLoadingOlder ? 'Loading older messages…' : 'Load older messages'}</Text></TouchableOpacity> : null}
            renderItem={({ item }) => {
              const isMe = item.senderId === user?.uid;
              return (
                <View className={`flex-row ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <View className="max-w-[78%]">
                    {item.imageUrl && item.imageUrl.includes('/chat-audio/') ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={playingMessageId === item.id ? 'Pause voice note' : 'Play voice note'}
                        onPress={() => void toggleVoicePlayback(item.id, item.imageUrl!)}
                        className={`min-w-[176px] flex-row items-center gap-3 rounded-3xl px-4 py-3 ${isMe ? 'bg-accent rounded-tr-sm' : 'bg-slate-100 rounded-tl-sm'}`}
                      >
                        {playingMessageId === item.id ? <Pause size={19} color={isMe ? '#fff' : '#3906d2'} /> : <Play size={19} color={isMe ? '#fff' : '#3906d2'} />}
                        <Text className={`text-sm font-semibold ${isMe ? 'text-white' : 'text-slate-900'}`}>Voice note</Text>
                      </TouchableOpacity>
                    ) : item.imageUrl ? (
                      <RemoteImage uri={item.imageUrl} style={{ width: 180, height: 180, borderRadius: 20, overflow: 'hidden' }} />
                    ) : (
                      <View className={`px-4 py-3 rounded-3xl ${isMe ? 'bg-accent rounded-tr-sm' : 'bg-slate-100 rounded-tl-sm'}`}>
                        <Text className={`text-sm font-medium ${isMe ? 'text-white' : 'text-slate-900'}`}>{item.text}</Text>
                      </View>
                    )}
                    {!isMe ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Report this message" onPress={() => chooseReportReason(item)} className="mt-1 self-start flex-row items-center gap-1 py-1"><Flag size={12} color="#64748b" /><Text className="text-[11px] font-semibold text-slate-500">Report</Text></TouchableOpacity> : null}
                  </View>
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
                  disabled={conversationBlocked || chatReadOnly}
                  className="bg-slate-100 px-4 py-2 rounded-full border border-slate-200"
                >
                  <Text className="font-sans text-xs font-bold text-slate-600">{reply}</Text>
                </TouchableOpacity>
              )}
            />
          </View>

          {/* Input */}
          <View className="flex-row items-center gap-3 px-4 py-3 border-t border-slate-100">
            {isRecordingVoice ? (
              <>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel voice note" onPress={() => void finishVoiceRecording(false)} className="w-11 h-11 rounded-2xl items-center justify-center bg-slate-100">
                  <X size={19} color="#64748b" />
                </TouchableOpacity>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900">Recording voice note</Text>
                  <Text className="mt-0.5 text-xs font-medium text-slate-500">{String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')} / 01:00</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Stop and send voice note" onPress={() => void finishVoiceRecording(true)} className="w-11 h-11 rounded-2xl items-center justify-center bg-accent">
                  <Square size={17} color="#fff" fill="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Send photo"
                  onPress={sendPhoto}
                  disabled={isSendingPhoto || isSendingVoice || conversationBlocked || chatReadOnly}
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
                  editable={!conversationBlocked && !chatReadOnly && !isSendingVoice}
                  multiline
                  maxLength={500}
                  onSubmitEditing={() => sendMessage()}
                  returnKeyType="send"
                />
                {Platform.OS !== 'web' ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Record voice note"
                    onPress={() => void startVoiceRecording()}
                    disabled={isSendingPhoto || isSendingVoice || conversationBlocked || chatReadOnly}
                    className="w-11 h-11 rounded-2xl items-center justify-center bg-accent/10"
                  >
                    {isSendingVoice ? <ActivityIndicator size="small" color="#3906D2" /> : <Mic size={18} color="#3906D2" />}
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => sendMessage()}
                  disabled={!inputText.trim() || conversationBlocked || chatReadOnly || isSendingVoice}
                  className={`w-11 h-11 rounded-2xl items-center justify-center ${inputText.trim() ? 'bg-accent' : 'bg-slate-100'}`}
                >
                  <Send size={18} color={inputText.trim() ? '#fff' : '#94a3b8'} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas">
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
          data={conversations.map(conversation => conversation.lastMessageAt && messageTime(conversation.lastMessageAt) < now - MESSAGE_RETENTION_MS
            ? { ...conversation, lastMessage: 'No recent messages', unreadCount: 0 }
            : conversation)}
          keyExtractor={(c) => c.jobId}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => openConversation(item.jobId)}
              className="bg-white rounded-3xl p-4 flex-row items-center gap-4 border border-slate-100 shadow-sm"
              activeOpacity={0.8}
            >
              <View className="w-12 h-12 bg-accent/10 rounded-2xl items-center justify-center">
                <MessageSquare size={22} color="#3906D2" />
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
