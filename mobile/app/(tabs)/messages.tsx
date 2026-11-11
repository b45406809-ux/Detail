import { showPermissionDenied } from '@/utils/permissionPrompt';
import { appAlert } from '@/components/AppDialog';
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
  PermissionsAndroid,

} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingList } from '../../components/LoadingList';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Send, MessageSquare, ImagePlus, PhoneCall, PhoneOff, MoreHorizontal, Flag } from 'lucide-react-native';
import type { Call, CallInvite, Voice as VoiceClient } from '@twilio/voice-react-native-sdk';
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
import { callFunction } from '../../services/functions';
import { ChatMessage } from '../../types';

const QUICK_REPLIES = ['On my way!', 'Sounds good', "I'm here", 'Thank you!'];
const MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CALL_LIMIT_SECONDS = 300;
const MAX_CALL_LIMIT_SECONDS = 3600;
const messageTime = (value: any) => value?.toDate?.().getTime?.() ?? new Date(value).getTime();

interface VoiceTokenResponse {
  token: string;
  maxCallDurationSeconds: number;
}

async function ensureVoiceMicrophonePermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const status = await PermissionsAndroid.request(permission);
  if (status !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('Microphone access is needed for calls. Allow it in your device settings to continue.');
  }
}

async function requestTwilioVoiceToken(jobId: string): Promise<VoiceTokenResponse> {
  const { data, error } = await supabase.functions.invoke('twilio-voice-token', { body: { jobId, platform: Platform.OS } });
  if (error) {
    let serverMessage = typeof data?.error === 'string' ? data.error : '';
    const context = (error as { context?: unknown }).context;
    if (!serverMessage && context && typeof context === 'object' && 'clone' in context && typeof (context as Response).clone === 'function') {
      try { serverMessage = (await (context as Response).clone().json())?.error || ''; } catch { /* use the safe fallback below */ }
    }
    throw new Error(serverMessage || 'Voice calling is not available right now.');
  }
  if (!data?.token) throw new Error(data?.error || 'Voice calling is not configured yet.');
  if (!data.incomingEnabled) throw new Error('Incoming calls are not configured for this device yet.');
  const configuredLimit = Number(data.maxCallDurationSeconds);
  const maxCallDurationSeconds = Number.isInteger(configuredLimit) && configuredLimit >= 60 && configuredLimit <= MAX_CALL_LIMIT_SECONDS
    ? configuredLimit
    : DEFAULT_CALL_LIMIT_SECONDS;
  return { token: data.token as string, maxCallDurationSeconds };
}

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
  const [callState, setCallState] = useState<'loading' | 'ready' | 'calling' | 'ringing' | 'connected' | 'incoming' | 'unavailable'>('loading');
  const [callError, setCallError] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCaller, setIncomingCaller] = useState('');
  const [voiceIncomingEnabled, setVoiceIncomingEnabled] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedMe, setBlockedMe] = useState(false);
  const conversationBlocked = blockedByMe || blockedMe;
  const [safetyStateLoading, setSafetyStateLoading] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const flatListRef = useRef<FlatList>(null);
  const preserveChatScrollRef = useRef(false);
  const reachedHistoryStartRef = useRef(false);
  const pendingMessageIntentsRef = useRef(new Map<string, { key: string; storageKey: string; imagePath?: string }>());
  const voiceRef = useRef<VoiceClient | null>(null);
  const voiceCallRef = useRef<Call | null>(null);
  const incomingInviteRef = useRef<CallInvite | null>(null);
  const voiceTokenRef = useRef('');
  const connectedAtRef = useRef(0);
  const callDurationLimitRef = useRef(DEFAULT_CALL_LIMIT_SECONDS);
  const activeConversation = conversations.find(conversation => conversation.jobId === activeJobId);

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
      { text: 'Inappropriate message or photo', onPress: () => void submitSafetyReport('INAPPROPRIATE_CONTENT', message) },
      { text: 'Other safety concern', onPress: () => void submitSafetyReport('OTHER_SAFETY_CONCERN', message) },
      { text: 'Cancel', style: 'cancel' },
    ],
  );

  const blockConversationPartner = () => {
    if (!activeJobId || !activeConversation?.otherUserId) return;
    if (blockedByMe) {
      appAlert('Unblock this person?', 'They will be able to send messages and start calls for this booking again.', [
        { text: 'Unblock', onPress: async () => {
          const { error } = await supabase.rpc('unblock_user', { p_target_user_id: activeConversation.otherUserId });
          if (error) { appAlert('Could not unblock person', error.message); return; }
          setBlockedByMe(false);
        } },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    appAlert('Block this person?', 'They will not be able to send you messages or start calls in Detail. Your booking history and existing messages stay available.', [
      { text: 'Block person', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('block_user', { p_job_id: activeJobId, p_target_user_id: activeConversation.otherUserId });
        if (error) { appAlert('Could not block person', error.message); return; }
        setBlockedByMe(true);
        const call = voiceCallRef.current;
        voiceCallRef.current = null;
        if (call) await call.disconnect().catch(() => undefined);
        const invite = incomingInviteRef.current;
        incomingInviteRef.current = null;
        if (invite) await invite.reject().catch(() => undefined);
        const voice = voiceRef.current;
        if (voice && voiceTokenRef.current) void voice.unregister(voiceTokenRef.current).catch(() => undefined);
        voiceRef.current = null;
        voiceTokenRef.current = '';
        setCallState('unavailable');
        setCallError('Calls are disabled because this person is blocked.');
      } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

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
            otherUserId: isCustomer ? job.cleanerId : job.customerId,
            otherUserName: isCustomer
              ? job.cleanerName ?? 'Cleaner'
              : job.customerName ?? 'Customer',
            otherUserPhoto: isCustomer ? job.cleanerPhoto ?? '' : job.customerPhoto ?? '',
            lastMessage: job.lastMessageAt && messageTime(job.lastMessageAt) < Date.now() - MESSAGE_RETENTION_MS ? 'No recent messages' : job.lastMessage ?? 'No messages yet',
            lastMessageAt: job.lastMessageAt,
            unreadCount: job[unreadField] ?? 0,
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
      setHasOlderMessages(false);
      setMessages(current => {
        const merged = new Map(current.map(message => [message.id, message]));
        page.forEach(message => merged.set(message.id, message));
        return [...merged.values()].filter(message => messageTime(message.createdAt) >= Date.now() - MESSAGE_RETENTION_MS).sort((left, right) => messageTime(left.createdAt) - messageTime(right.createdAt));
      });
      // Scroll to bottom on new messages
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, err => setChatError(err.message || 'Messages could not be refreshed.'));
  }, [activeJobId, userId, chatRetry]);

  useEffect(() => {
    if (conversationBlocked) {
      setCallState('unavailable');
      setCallError(blockedByMe ? 'Calls are disabled because this person is blocked.' : 'Calls are unavailable because this person has blocked this account.');
      return;
    }
    if (Platform.OS === 'web' || !activeJobId || !activeConversation?.otherUserId || !userId) {
      setCallState('unavailable');
      return;
    }
    let disposed = false;
    let voice: VoiceClient | null = null;
    let tokenRefreshTimer: ReturnType<typeof setInterval> | undefined;
    const initializeVoice = async () => {
      setCallState('loading');
      setCallError('');
      try {
        const sdk = await import('@twilio/voice-react-native-sdk');
        voice = new sdk.Voice();
        voiceRef.current = voice;
        const tokenResponse = await requestTwilioVoiceToken(activeJobId);
        if (disposed) return;
        voiceTokenRef.current = tokenResponse.token;
        callDurationLimitRef.current = tokenResponse.maxCallDurationSeconds;
        setVoiceIncomingEnabled(true);
        voice.addListener(sdk.Voice.Event.CallInvite as any, (...events: any[]) => {
          const invite = events[0] as CallInvite;
          const parameters = invite.getCustomParameters() as Record<string, string>;
          if ((parameters.jobId ?? parameters.JobId) !== activeJobId || voiceCallRef.current || incomingInviteRef.current) {
            void invite.reject();
            return;
          }
          const incomingLimit = Number(parameters.maxDurationSeconds);
          callDurationLimitRef.current = Number.isInteger(incomingLimit) && incomingLimit >= 60 && incomingLimit <= MAX_CALL_LIMIT_SECONDS
            ? incomingLimit
            : DEFAULT_CALL_LIMIT_SECONDS;
          incomingInviteRef.current = invite;
          setIncomingCaller(invite.getFrom().replace(/^client:/, '').slice(0, 12));
          setCallState('incoming');
        });
        try { await voice.register(tokenResponse.token); }
        catch (registerError) {
          console.warn('Twilio incoming-call registration failed:', registerError instanceof Error ? registerError.message : 'unknown error');
          throw new Error('Incoming calls could not be enabled on this device. Check notification permissions and try again.');
        }
        if (!disposed) {
          setCallState('ready');
          tokenRefreshTimer = setInterval(() => {
            void requestTwilioVoiceToken(activeJobId).then(async refreshed => {
              if (disposed || !voice) return;
              await voice.register(refreshed.token);
              voiceTokenRef.current = refreshed.token;
              callDurationLimitRef.current = refreshed.maxCallDurationSeconds;
            }).catch(error => console.warn('Twilio Voice token refresh failed:', error instanceof Error ? error.message : 'unknown error'));
          }, 45 * 60 * 1000);
        }
      } catch (error) {
        if (!disposed) {
          setCallError(error instanceof Error ? error.message : 'Voice calling is not configured yet.');
          setCallState('unavailable');
        }
      }
    };
    void initializeVoice();
    return () => {
      disposed = true;
      if (tokenRefreshTimer) clearInterval(tokenRefreshTimer);
      const call = voiceCallRef.current;
      voiceCallRef.current = null;
      if (call) void call.disconnect().catch(() => undefined);
      const invite = incomingInviteRef.current;
      incomingInviteRef.current = null;
      if (invite) void invite.reject().catch(() => undefined);
      const currentVoice = voiceRef.current;
      voiceRef.current = null;
      if (currentVoice && voiceTokenRef.current) void currentVoice.unregister(voiceTokenRef.current).catch(() => undefined);
      voiceTokenRef.current = '';
    };
  }, [activeJobId, activeConversation?.otherUserId, userId, conversationBlocked, blockedByMe]);

  const attachCallEvents = async (call: Call) => {
    const sdk = await import('@twilio/voice-react-native-sdk');
    voiceCallRef.current = call;
    if (call.getState() === 'connected') {
      connectedAtRef.current = Date.now();
      setCallDuration(0);
      setCallState('connected');
    } else {
      setCallState('calling');
    }
    call.addListener(sdk.Call.Event.Ringing, () => setCallState('ringing'));
    call.addListener(sdk.Call.Event.Connected, () => {
      connectedAtRef.current = Date.now();
      setCallDuration(0);
      setCallState('connected');
    });
    call.addListener(sdk.Call.Event.Disconnected, () => {
      voiceCallRef.current = null;
      connectedAtRef.current = 0;
      setIncomingCaller('');
      setCallState('ready');
    });
    call.addListener(sdk.Call.Event.ConnectFailure, () => {
      voiceCallRef.current = null;
      connectedAtRef.current = 0;
      setCallError('The call could not connect. Check your connection and try again.');
      setCallState('ready');
    });
  };

  const startVoiceCall = async () => {
    if (conversationBlocked || !activeConversation?.otherUserId || !activeJobId || callState !== 'ready' || !voiceRef.current || !voiceTokenRef.current) return;
    setCallError('');
    setCallState('calling');
    try {
      await ensureVoiceMicrophonePermission();
      const refreshedToken = await requestTwilioVoiceToken(activeJobId);
      await voiceRef.current.register(refreshedToken.token);
      voiceTokenRef.current = refreshedToken.token;
      callDurationLimitRef.current = refreshedToken.maxCallDurationSeconds;
      const call = await voiceRef.current.connect(refreshedToken.token, {
        contactHandle: activeConversation.otherUserName,
        notificationDisplayName: 'Detail booking call',
        params: { To: activeConversation.otherUserId, jobId: activeJobId },
      });
      await attachCallEvents(call);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'The call could not start. Please try again.');
      setCallState('ready');
    }
  };

  const acceptVoiceCall = async () => {
    if (conversationBlocked) return;
    const invite = incomingInviteRef.current;
    if (!invite) return;
    try {
      await ensureVoiceMicrophonePermission();
      const call = await invite.accept();
      incomingInviteRef.current = null;
      await attachCallEvents(call);
    } catch {
      incomingInviteRef.current = null;
      setCallError('The incoming call could not be answered.');
      setCallState('ready');
    }
  };

  const endVoiceCall = async () => {
    const invite = incomingInviteRef.current;
    incomingInviteRef.current = null;
    if (invite) await invite.reject().catch(() => undefined);
    const call = voiceCallRef.current;
    if (call) await call.disconnect().catch(() => undefined);
    voiceCallRef.current = null;
    connectedAtRef.current = 0;
    setIncomingCaller('');
    setCallState('ready');
  };

  useEffect(() => {
    if (callState !== 'connected' || !connectedAtRef.current) return;
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - connectedAtRef.current) / 1000);
      setCallDuration(elapsed);
      // TwiML enforces the same server-side limit if this device pauses.
      if (elapsed >= callDurationLimitRef.current && voiceCallRef.current) void voiceCallRef.current.disconnect();
    }, 1000);
    return () => clearInterval(timer);
  }, [callState]);

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
      appAlert('Photo not sent', 'Check your connection and try again.');
    } finally {
      setIsSendingPhoto(false);
    }
  };

  const sendPhoto = async () => {
    if (!activeJobId || !user) return;

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
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Start booking voice call"
              accessibilityState={{ disabled: conversationBlocked || callState !== 'ready' || !['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(activeConversation?.jobStatus ?? '') }}
              disabled={conversationBlocked || callState !== 'ready' || !['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(activeConversation?.jobStatus ?? '')}
              onPress={() => void startVoiceCall()}
              className="h-10 w-10 items-center justify-center rounded-full bg-accent/10"
            >
              <PhoneCall size={19} color={callState === 'ready' ? '#3906D2' : '#94a3b8'} />
            </TouchableOpacity>
          </View>

          {activeConversation && ['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(activeConversation.jobStatus) ? (
            <View className="mx-4 mt-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-bold text-violet-950">
                    {callState === 'incoming' ? `Incoming call${incomingCaller ? ` · ${incomingCaller}` : ''}` : callState === 'connected' ? 'In-app call' : callState === 'ringing' ? 'Ringing…' : callState === 'calling' ? 'Calling…' : callState === 'loading' ? 'Setting up calls…' : callState === 'unavailable' ? 'Calls unavailable' : 'Call your booking partner'}
                  </Text>
                  <Text className="mt-1 text-xs leading-4 text-violet-800">
                    {callState === 'connected'
                      ? `${Math.floor(callDuration / 60)}:${String(callDuration % 60).padStart(2, '0')} elapsed · calls end at 5 minutes`
                      : callState === 'unavailable'
                        ? callError || 'Voice calling is not configured yet.'
                      : callError || 'Detail calls use your internet connection. Calls end after 5 minutes. Microphone access is requested only when you call or answer.'}
                  </Text>
                  {callState === 'ready' && <Text className="mt-1 text-[11px] leading-4 text-violet-700">{voiceIncomingEnabled ? 'Keep this chat open to receive calls.' : 'Incoming-call push is not configured yet; the other person must keep Detail open.'}</Text>}
                </View>
                {callState === 'incoming' ? (
                  <View className="flex-row gap-2">
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Decline call" onPress={() => void endVoiceCall()} className="h-11 w-11 items-center justify-center rounded-full bg-rose-100"><PhoneOff size={18} color="#be123c" /></TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Answer call" onPress={() => void acceptVoiceCall()} className="h-11 w-11 items-center justify-center rounded-full bg-emerald-600"><PhoneCall size={18} color="#fff" /></TouchableOpacity>
                  </View>
                ) : ['connected', 'ringing', 'calling'].includes(callState) ? (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="End call" onPress={() => void endVoiceCall()} className="h-11 w-11 items-center justify-center rounded-full bg-rose-600"><PhoneOff size={18} color="#fff" /></TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Messages */}
          {chatError ? <View className="items-center px-4 py-2"><Text accessibilityRole="alert" className="text-center text-xs text-rose-700">{chatError}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setChatRetry(value => value + 1)} className="mt-1 rounded-full bg-rose-50 px-3 py-1"><Text className="text-xs font-bold text-rose-800">Retry messages</Text></TouchableOpacity></View> : null}
        {conversationBlocked ? <View className="mx-4 mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3"><Text className="text-xs font-bold text-rose-900">{blockedByMe ? 'You blocked this person' : 'This person blocked you'}</Text><Text className="mt-1 text-xs leading-5 text-rose-800">Existing history stays available. New messages, photos, and calls are disabled{blockedByMe ? ' until you unblock them from the conversation menu.' : ' in this conversation.'}</Text></View> : null}
        <View className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Text className="text-xs font-bold text-amber-950">Stay safe on Detail</Text>
          <Text className="mt-1 text-xs leading-5 text-amber-900">Messages disappear from this chat after 24 hours, but remain stored securely. Abusive language is screened automatically. Keep communication and payments in Detail. Don’t share your phone number, verification codes, or send money outside the app. Use the conversation menu to report or block someone; you can also report a message below.</Text>
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
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={{ width: 180, height: 180, borderRadius: 20 }} />
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
                  disabled={conversationBlocked}
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
              disabled={isSendingPhoto || conversationBlocked}
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
              editable={!conversationBlocked}
              multiline
              maxLength={500}
              onSubmitEditing={() => sendMessage()}
              returnKeyType="send"
            />
            <TouchableOpacity
              onPress={() => sendMessage()}
              disabled={!inputText.trim() || conversationBlocked}
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
