import { appAlert, AppDialogHost } from '@/components/AppDialog';
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,

} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LoadingList } from '../../components/LoadingList';
import { LoadingError } from '../../components/LoadingError';
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowDownLeft,
  Plus,
  X,
  CreditCard,
  Wallet,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import {
  auth,
  db,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from '../../services/supabase';
import { addFundsToWallet, cancelEcoCashWalletPayment, isTopupFinished, listEcoCashWalletPayments, pendingEcoCashTopup, refreshEcoCashTopup, type EcoCashPayment } from '../../services/payments';
import { callFunction } from '../../services/functions';
import { Job, WalletTransaction } from '../../types';
import { formatDate } from '../../utils/date';

export default function WalletScreen() {
  const { user, profile } = useAuth();
  const isCleaner = profile?.role === 'CLEANER';
  const { verification, returnToCleaner } = useLocalSearchParams<{ verification?: string; returnToCleaner?: string }>();
  const isVerification = verification === '1' && !isCleaner;
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [commissionJobs, setCommissionJobs] = useState<Job[]>([]);
  const [commissionJobsLoading, setCommissionJobsLoading] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState(false);
  const [transactionsRetry, setTransactionsRetry] = useState(0);
  const [transactionLimit, setTransactionLimit] = useState(20);
  const userId = user?.uid;
  const [paymentHistory, setPaymentHistory] = useState<EcoCashPayment[]>([]);
  const [paymentPage, setPaymentPage] = useState<number | null>(null);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState(false);
  const [hiddenPayments, setHiddenPayments] = useState<string[]>([]);
  const [checkingPayment, setCheckingPayment] = useState<string>();
  const historyRequest = React.useRef(0);
  const hiddenPaymentsKey = `detail:hidden-ecocash:${userId}`;
  const loadPaymentHistory = React.useCallback(async (offset = 0) => {
    if (!userId) return;
    const request = ++historyRequest.current;
    const isCurrent = () => historyRequest.current === request && auth.currentUser?.uid === userId;
    setPaymentHistoryLoading(true);
    setPaymentHistoryError(false);
    try {
      const page = await listEcoCashWalletPayments(offset);
      if (!isCurrent()) return;
      setPaymentHistory(current => offset === 0 ? page.payments : [
        ...current,
        ...page.payments.filter(payment => !current.some(row => row.referenceNumber === payment.referenceNumber)),
      ]);
      setPaymentPage(page.nextOffset);
    } catch {
      if (isCurrent()) setPaymentHistoryError(true);
    } finally {
      if (isCurrent()) setPaymentHistoryLoading(false);
    }
  }, [userId]);
  useFocusEffect(React.useCallback(() => {
    void loadPaymentHistory();
  }, [loadPaymentHistory]));
  useEffect(() => {
    setPaymentHistory([]);
    setPaymentPage(null);
    setHiddenPayments([]);
    let active = true;
    if (userId) void AsyncStorage.getItem(hiddenPaymentsKey).then(saved => {
      const values = JSON.parse(saved ?? '[]');
      if (active && Array.isArray(values)) setHiddenPayments(values);
    }).catch(() => {});
    return () => { active = false; };
  }, [hiddenPaymentsKey, userId]);
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [ecoCashPhone, setEcoCashPhone] = useState('');
  const [pendingReference, setPendingReference] = useState<string>();
  const [canRetryPayment, setCanRetryPayment] = useState(false);
  useEffect(() => {
    let active = true;
    setPendingReference(undefined);
    if (userId) void pendingEcoCashTopup(userId).then(reference => {
      if (active) setPendingReference(reference);
    }).catch(() => {});
    return () => { active = false; };
  }, [userId]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'ECOCASH' | 'INNBUCKS' | 'BANK'>('ECOCASH');
  const [payoutName, setPayoutName] = useState('');
  const [payoutDestination, setPayoutDestination] = useState('');

  useEffect(() => {
    if (isVerification) setIsAddFundsOpen(true);
  }, [isVerification]);


  // Real-time transaction feed from Firestore
  useEffect(() => {
    if (!userId) { setTransactions([]); setTransactionsLoading(false); return; }
    setTransactionsLoading(true);
    setTransactionsError(false);
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(transactionLimit)
    );
    return onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WalletTransaction)));
      setTransactionsLoading(false);
      setTransactionsError(false);
    }, () => { setTransactionsLoading(false); setTransactionsError(true); });
  }, [userId, transactionsRetry, transactionLimit]);

  useEffect(() => {
    if (!userId || !isCleaner) { setCommissionJobs([]); setCommissionJobsLoading(false); return; }
    setCommissionJobsLoading(true);
    const q = query(collection(db, 'jobs'), where('cleanerId', '==', userId), where('status', '==', 'COMPLETED'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      setCommissionJobs(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Job)).filter((job) =>
        job.earnings?.commission !== undefined || job.directCommissionPolicyVersion === 1
      ));
      setCommissionJobsLoading(false);
    }, () => setCommissionJobsLoading(false));
  }, [userId, isCleaner]);

  const handleAddFunds = async () => {
    if (!pendingReference && !isCleaner && !isVerification) {
      setIsAddFundsOpen(false);
      router.push({ pathname: '/(tabs)/wallet', params: { verification: '1', returnToCleaner: '1' } });
      return;
    }
    const value = isVerification ? 2.00 : Number(amount);
    const phone = ecoCashPhone.trim().replace(/[ +().-]/g, '').replace(/^263/, '0');
    if (!pendingReference && (!Number.isFinite(value) || value < 0.50 || value > 1000 || Math.round(value * 100) / 100 !== value)) {
      appAlert('Invalid amount', 'Enter an amount from $0.50 to $1,000 USD.');
      return;
    }
    if (!pendingReference && !/^07[78][0-9]{7}$/.test(phone)) {
      appAlert('Invalid number', 'Enter your EcoCash mobile number.');
      return;
    }
    setIsLoading(true);
    try {
      let status: string;
      if (pendingReference) {
        status = await refreshEcoCashTopup(pendingReference);
        if (!isTopupFinished(status)) appAlert('Payment pending', 'Paynow has not confirmed the outcome. If no prompt arrived, check the payment reference in Wallet history.');
      } else {
        const topup = await addFundsToWallet(value, phone, isVerification ? 'VERIFICATION' : 'COMMISSION');
        status = topup.status;
        if (!isTopupFinished(status)) setPendingReference(topup.referenceNumber);
      }
      if (isTopupFinished(status)) {
        setPendingReference(undefined);
        if (status === 'PAID') {
          setCanRetryPayment(false);
          setIsAddFundsOpen(false);
          setAmount('');
          if (isVerification && returnToCleaner === '1') {
            appAlert('Payment confirmed', 'Your verification funds are ready. Continue cleaner registration.', [
              { text: 'Continue', onPress: () => router.replace('/register-cleaner') },
            ]);
          } else {
            appAlert('Payment confirmed', isVerification ? 'Return to cleaner registration to continue.' : 'Your payment has been applied.');
          }
        } else if (status === 'EXPIRED' || status === 'APP_CANCELLED') {
          setCanRetryPayment(true);
          appAlert(status === 'EXPIRED' ? 'Payment expired in Detail' : 'Payment cancelled in Detail',
            'Decline the EcoCash prompt if it still arrives. You can start another payment from Wallet.');
        } else {
          setCanRetryPayment(true);
          appAlert('Payment not completed', 'Check your EcoCash number and USD balance, then tap Retry payment.');
        }
      }
    } catch (error) {
      appAlert('Could not check payment', (error as Error).message || 'Please try again.');
    } finally {
      setIsLoading(false);
      void loadPaymentHistory();
    }
  };

  const checkHistoryPayment = async (payment: EcoCashPayment) => {
    if (checkingPayment || isLoading) return;
    setCheckingPayment(payment.referenceNumber);
    try {
      const status = await refreshEcoCashTopup(payment.referenceNumber);
      if (isTopupFinished(status)) {
        setPendingReference(current => current === payment.referenceNumber ? undefined : current);
      }
      setPaymentHistory(current => current.map(row => row.referenceNumber === payment.referenceNumber ? { ...row, status } : row));
      if (!isTopupFinished(status)) appAlert('Payment still unresolved', payment.canCheck
        ? 'Paynow has not confirmed payment or cancellation. If the EcoCash prompt is still open, decline it on your phone and check again.'
        : 'Detail did not receive a status link from Paynow. Contact support with the payment reference shown in Wallet.');
    } catch (error) {
      appAlert('Could not check payment', (error as Error).message || 'Try again in a moment.');
    } finally {
      setCheckingPayment(undefined);
    }
  };

  const hideHistoryPayment = async (reference: string) => {
    const next = [...hiddenPayments, reference];
    try {
      await AsyncStorage.setItem(hiddenPaymentsKey, JSON.stringify(next));
      setHiddenPayments(next);
    } catch {
      appAlert('Could not hide payment', 'Try again in a moment.');
    }
  };

  const cancelPayment = (reference: string) => {
    if (isLoading || checkingPayment) return;
    appAlert('Cancel payment in Detail?', 'The EcoCash prompt may still arrive. Decline it on your phone too. If you already approved it, Paynow may still charge you.', [
      { text: 'Keep payment', style: 'cancel' },
      { text: 'Cancel payment', style: 'destructive', onPress: async () => {
        setCheckingPayment(reference);
        try {
          const status = await cancelEcoCashWalletPayment(reference);
          if (isTopupFinished(status)) {
            setPendingReference(current => current === reference ? undefined : current);
            setCanRetryPayment(status !== 'PAID');
            if (pendingReference === reference) setIsAddFundsOpen(false);
          }
          if (status === 'PAID') appAlert('Payment already completed', 'Paynow confirmed this payment before it could be cancelled.');
          else if (!isTopupFinished(status)) appAlert('Payment cannot be cancelled', 'Paynow is already processing this payment. Check its status in Wallet.');
        } catch (error) {
          appAlert('Could not cancel payment', (error as Error).message || 'Check your connection and try again.');
        } finally {
          setCheckingPayment(undefined);
          void loadPaymentHistory();
        }
      } },
    ]);
  };

  const balance = isVerification ? Number(profile?.commissionBalance ?? 0) : Number(profile?.balance ?? 0);
  // Commission top-ups are tracked in a separate bucket and must not reduce
  // already-cleared earnings; payout holds debit earningsBalance atomically.
  const availableEarnings = isCleaner
    ? Math.max(0, Number(profile?.earningsBalance ?? 0))
    : 0;

  const requestPayout = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const request={amount:Number(payoutAmount),method:payoutMethod,accountName:payoutName.trim(),accountNumber:payoutDestination.trim()};
      const storageKey=`detail:payout-intent:${user.uid}`;
      const signature=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,JSON.stringify(request));
      let idempotencyKey='';
      try {
        const saved=JSON.parse((await AsyncStorage.getItem(storageKey))??'null') as {signature?:string;key?:string}|null;
        if(saved?.signature===signature&&typeof saved.key==='string')idempotencyKey=saved.key;
      } catch { /* replace a corrupt saved retry record */ }
      if(!idempotencyKey){idempotencyKey=Crypto.randomUUID();await AsyncStorage.setItem(storageKey,JSON.stringify({signature,key:idempotencyKey}));}
      await callFunction('requestCleanerPayout', { ...request, idempotencyKey });
      await AsyncStorage.removeItem(storageKey);
      setIsPayoutOpen(false); setPayoutAmount(''); setPayoutName(''); setPayoutDestination('');
      appAlert('Payout requested', 'Your cleared earnings are reserved. Detail will send the transfer and update the request status.');
    } catch (error: any) {
      appAlert('Could not request payout', error?.message ?? 'Please check the amount and payout details.');
    } finally { setIsLoading(false); }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      {/* Header */}
      <View className="px-5 pt-4 pb-4">
        <View className="flex-row items-center gap-3">
          {isVerification && <TouchableOpacity accessibilityLabel="Back to cleaner registration" onPress={() => router.back()} className="p-2"><ArrowLeft size={22} color="#150256" /></TouchableOpacity>}
          <Text className="text-2xl font-display font-black text-slate-900 tracking-tight">{isVerification ? 'Verification payment' : 'Wallet'}</Text>
        </View>
      </View>

      {/* Balance card */}
      <View className="mx-5 mb-6 bg-accent rounded-4xl p-6 shadow-xl shadow-accent/30">
        <View className="flex-row items-center gap-2 mb-4">
          <Wallet size={18} color="rgba(255,255,255,0.7)" />
          <Text className="text-xs font-display font-black text-white/70 uppercase tracking-widest">
            {isCleaner ? 'Available earnings' : 'Available Balance'}
          </Text>
        </View>
        <Text className="text-4xl font-display font-black text-white mb-1">${(isCleaner ? availableEarnings : balance).toFixed(2)}</Text>
        <Text className="font-sans text-sm text-white/60 font-medium">{isCleaner || isVerification ? `Cleaner commission deposit · $${Number(profile?.commissionBalance ?? 0).toFixed(2)} available` : 'Detail Wallet'}</Text>

        <View className="flex-row gap-3 mt-6">
          {(isCleaner || isVerification || pendingReference) && <TouchableOpacity
            onPress={() => setIsAddFundsOpen(true)}
            className="flex-1 bg-white/20 py-3 rounded-2xl flex-row items-center justify-center gap-2"
            activeOpacity={0.8}
          >
            <Plus size={16} color="#fff" />
            <Text className="text-white font-display font-black text-xs uppercase tracking-wider">{pendingReference ? 'Check EcoCash payment' : isCleaner ? 'Top up commission' : 'Fund verification'}</Text>
          </TouchableOpacity>}
          {isCleaner && <TouchableOpacity
            onPress={() => setIsPayoutOpen(true)}
            className="flex-1 bg-white/20 py-3 rounded-2xl flex-row items-center justify-center gap-2"
            activeOpacity={0.8}
          >
            <ArrowUpRight size={16} color="#fff" />
            <Text className="text-white font-display font-black text-xs uppercase tracking-wider">Request payout</Text>
          </TouchableOpacity>}
        </View>
      </View>

      {isCleaner && <View className="mx-5 mb-6 rounded-2xl bg-white p-4 border border-slate-100"><Text className="font-display font-black text-slate-900">How earnings and commission work</Text><Text className="font-sans text-sm text-slate-600 mt-2">Offline bookings reserve 10% from this prepaid credit when a customer accepts your quote. Your $1 minimum commission deposit covers up to $10 of offline bookings. Cleared earnings appear above when available; request a payout from this screen. Payouts are reviewed and sent manually while integrations are unavailable, so transfer timing is not guaranteed.</Text></View>}

      {(isCleaner && Number(profile?.commissionOwed ?? 0) > 0) && (
        <TouchableOpacity
          onPress={() => setIsAddFundsOpen(true)}
          activeOpacity={0.85}
          className="mx-5 mb-6 bg-red-50 border border-red-100 rounded-3xl p-4 flex-row items-center gap-3"
        >
          <View className="w-10 h-10 bg-red-100 rounded-2xl items-center justify-center">
            <ArrowUpRight size={18} color="#ef4444" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-display font-black text-red-700">Outstanding commission due</Text>
            <Text className="font-sans text-xs text-red-500 font-medium mt-0.5">
              {`You owe $${Number(profile?.commissionOwed ?? 0).toFixed(2)} from earlier bookings. Clear this before accepting new jobs.`}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {isCleaner ? <View className="mx-5 mb-5 rounded-3xl border border-slate-100 bg-white p-4">
        <View className="mb-3 flex-row items-center justify-between">
          <View><Text className="font-display font-black text-slate-900">Jobs with Detail commission</Text><Text className="mt-1 font-sans text-xs text-slate-500">Completed bookings that added to your commission record</Text></View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/activity')}><Text className="font-sans-bold text-xs text-accent">See all</Text></TouchableOpacity>
        </View>
        {commissionJobsLoading ? <ActivityIndicator color="#3906D2" /> : commissionJobs.length === 0 ? <Text className="font-sans text-sm text-slate-500">No completed jobs with commission yet.</Text> : commissionJobs.slice(0, 3).map((job) => {
          const gross = Number(job.earnings?.gross ?? job.price ?? 0);
          const fee = Number(job.earnings?.commission ?? 0);
          const net = Number(job.earnings?.net ?? Math.max(0, gross - fee));
          return <View key={job.id} className="flex-row items-center justify-between border-t border-slate-100 py-3">
            <View className="flex-1 pr-3"><Text className="font-sans-bold text-sm text-slate-800" numberOfLines={1}>{job.serviceType || (job.category === 'CAR' ? 'Car cleaning' : 'House cleaning')}</Text><Text className="mt-0.5 font-sans text-xs text-slate-500">{formatDate(job.createdAt, 'Date unavailable')} · Job ${gross.toFixed(2)}</Text></View>
            <View className="items-end"><Text className="font-sans-bold text-sm text-rose-700">-${fee.toFixed(2)}</Text><Text className="mt-0.5 font-sans text-[10px] text-slate-500">After fee ${net.toFixed(2)}</Text></View>
          </View>;
        })}
      </View> : null}

      {/* Transactions */}
      <View className="flex-1 px-5">
        <FlatList
          data={transactions}
          keyExtractor={(t) => t.id}
          showsVerticalScrollIndicator={false}
          contentContainerClassName="gap-3"
          refreshing={paymentHistoryLoading && paymentHistory.length > 0}
          onRefresh={() => {
            void loadPaymentHistory();
            setTransactionsRetry(value => value + 1);
          }}
          ListHeaderComponent={<View>
            <Text className="text-xs font-display font-black text-slate-400 uppercase tracking-widest mb-3">EcoCash payment history</Text>
            {paymentHistory.filter(payment => !['FAILED', 'CANCELLED'].includes(payment.status) || !hiddenPayments.includes(payment.referenceNumber)).map(payment => {
              const unresolved = !isTopupFinished(payment.status);
              return <View key={payment.referenceNumber} className="bg-white rounded-2xl border border-slate-100 p-4 mb-3">
                <View className="flex-row justify-between gap-3">
                  <Text className="font-display font-black text-slate-900">EcoCash · ${payment.amount.toFixed(2)}</Text>
                  <Text className={unresolved ? 'text-amber-700' : 'text-slate-600'}>{payment.status === 'INITIATING' ? 'Unconfirmed' : payment.status === 'APP_CANCELLED' ? 'Cancelled in Detail' : payment.status.toLowerCase().replace(/_/g, ' ')}</Text>
                </View>
                <Text className="text-xs text-slate-500 mt-1">{formatDate(payment.createdAt, 'Date unavailable')}</Text>
                <Text selectable className="text-xs text-slate-500 mt-1">{payment.referenceNumber}</Text>
                {unresolved && <View className="flex-row flex-wrap gap-4 mt-3">
                  <TouchableOpacity disabled={Boolean(checkingPayment) || isLoading} onPress={() => void checkHistoryPayment(payment)}>
                    <Text className="font-sans-bold text-accent">{checkingPayment === payment.referenceNumber ? 'Checking…' : 'Check status'}</Text>
                  </TouchableOpacity>
                  {['PENDING', 'INITIATING'].includes(payment.status) && <TouchableOpacity disabled={Boolean(checkingPayment) || isLoading} onPress={() => cancelPayment(payment.referenceNumber)}>
                    <Text className="font-sans-bold text-accent">Cancel payment</Text>
                  </TouchableOpacity>}
                </View>}
                {['FAILED', 'CANCELLED'].includes(payment.status) && <TouchableOpacity onPress={() => void hideHistoryPayment(payment.referenceNumber)} className="mt-3">
                  <Text className="font-sans-bold text-accent">Hide from history</Text>
                </TouchableOpacity>}
              </View>;
            })}
            {paymentHistoryLoading && <ActivityIndicator color="#3906D2" />}
            {paymentHistoryError && <LoadingError message="Could not load EcoCash payment history." onRetry={() => void loadPaymentHistory()} />}
            {!paymentHistoryLoading && paymentPage !== null && <TouchableOpacity onPress={() => void loadPaymentHistory(paymentPage)} className="py-3">
              <Text className="font-sans-bold text-accent">Load older payments</Text>
            </TouchableOpacity>}
            <Text className="text-xs font-display font-black text-slate-400 uppercase tracking-widest mt-4 mb-3">Wallet transactions</Text>
          </View>}
          ListEmptyComponent={transactionsLoading ? (
          <LoadingList rows={3} />
        ) : transactionsError ? (
          <LoadingError message="Could not load transactions. Check your connection and try again." onRetry={() => setTransactionsRetry(value => value + 1)} />
        ) : (
          <View className="bg-white rounded-3xl p-8 items-center border border-slate-100">
            <CreditCard size={30} color="#3906D2" style={{ marginBottom: 12 }} />
            <Text className="text-sm font-display font-black text-slate-600 text-center">
              No transactions yet
            </Text>
          </View>
        )}
            ListFooterComponent={transactions.length >= transactionLimit ? <TouchableOpacity onPress={() => setTransactionLimit(value => value + 20)} className="py-3">
              <Text className="font-sans-bold text-accent">Load older wallet transactions</Text>
            </TouchableOpacity> : null}
            renderItem={({ item }) => (
              <View className="bg-white rounded-3xl p-4 flex-row items-center gap-4 border border-slate-100">
                <View
                  className={`w-12 h-12 rounded-2xl items-center justify-center ${
                    item.type === 'CREDIT' ? 'bg-emerald-50' : 'bg-red-50'
                  }`}
                >
                  {item.type === 'CREDIT' ? (
                    <ArrowDownLeft size={22} color="#10b981" />
                  ) : (
                    <ArrowUpRight size={22} color="#ef4444" />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-display font-black text-slate-900">{item.description}</Text>
                  <Text className="font-sans text-xs text-slate-400 font-medium mt-0.5">
                    {formatDate(item.createdAt, 'Date unavailable')}
                  </Text>
                </View>
                <View className="items-end">
                  <Text
                    className={`text-base font-black ${
                      item.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {item.type === 'CREDIT' ? '+' : '-'}${item.amount.toFixed(2)}
                  </Text>
                  {(item as any).status === 'PENDING' && (
                    <Text className="text-[10px] font-display font-black text-amber-500 uppercase tracking-wider mt-0.5">
                      Pending
                    </Text>
                  )}
                </View>
              </View>
            )}
          />
      </View>

      {/* Add Funds Modal */}
      <Modal visible={isAddFundsOpen} transparent animationType="slide" onRequestClose={() => setIsAddFundsOpen(false)}>
        {isAddFundsOpen && <AppDialogHost />}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-center bg-[#150256]/55 px-5">
          <View className="bg-white rounded-[28px] p-6">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xl font-display font-black text-slate-900">Pay with EcoCash</Text>
              <TouchableOpacity accessibilityLabel="Close payment" onPress={() => setIsAddFundsOpen(false)}>
                <X size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            {pendingReference ? (
              <Text className="font-sans text-sm text-slate-600 mb-5">Approve the request on your EcoCash phone, then check its status here. Pending requests expire in Detail after 30 minutes.</Text>
            ) : (
              <>
                <Text className="font-sans text-sm text-slate-600 mb-5">
                  {isVerification ? 'Pay $2.00 USD: $1.00 covers your identity check and $1.00 remains as your minimum cleaner commission deposit.' : 'Top-ups start at $0.50 USD and clear commission due first.'}
                </Text>
                {!isVerification && <>
                  <Text className="font-sans-bold text-sm text-slate-700 mb-2">Amount (USD)</Text>
                  <TextInput accessibilityLabel="Amount in US dollars" className="bg-slate-50 rounded-2xl px-4 py-4 mb-4 font-sans text-slate-900"
                    placeholder="0.50" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
                </>}
                <Text className="font-sans-bold text-sm text-slate-700 mb-2">EcoCash mobile number</Text>
                <TextInput accessibilityLabel="EcoCash mobile number" className="bg-slate-50 rounded-2xl px-4 py-4 mb-5 font-sans text-slate-900"
                  placeholder="077 123 4567" keyboardType="phone-pad" value={ecoCashPhone} onChangeText={setEcoCashPhone} />
              </>
            )}
            <TouchableOpacity onPress={handleAddFunds} disabled={isLoading || Boolean(checkingPayment) || (!pendingReference && (!ecoCashPhone || (!isVerification && !amount)))}
              className="bg-accent py-5 rounded-[32px] items-center">
              {isLoading ? <ActivityIndicator color="#fff" /> : (
                <Text className="text-white font-display font-black text-sm">
                  {pendingReference ? 'Check payment status' : canRetryPayment ? 'Retry payment' : `Pay $${isVerification ? '2.00' : amount || '0.00'}`}
                </Text>
              )}
            </TouchableOpacity>
            {pendingReference && <TouchableOpacity accessibilityRole="button" onPress={() => cancelPayment(pendingReference)} disabled={isLoading || Boolean(checkingPayment)} className="mt-3 rounded-full border border-slate-200 py-4 items-center"><Text className="font-sans-bold text-sm text-accent">Cancel payment</Text></TouchableOpacity>}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={isPayoutOpen} transparent animationType="slide">
        {isPayoutOpen && <AppDialogHost />}
        <View className="flex-1 justify-center bg-[#150256]/55 px-5"><View className="bg-white rounded-[28px] p-6 pb-10">
          <View className="flex-row justify-between items-center mb-4"><Text className="text-xl font-display font-black">Request payout</Text><TouchableOpacity onPress={() => setIsPayoutOpen(false)}><X size={22} color="#94a3b8" /></TouchableOpacity></View>
          <Text className="font-sans text-sm text-slate-500 mb-3">Available cleared earnings: ${availableEarnings.toFixed(2)}. Minimum payout $5. Transfers are sent manually while payout integrations are unavailable.</Text>
          <TextInput className="font-sans border border-slate-200 rounded-xl p-4 mb-3" placeholder="Amount in USD" keyboardType="decimal-pad" value={payoutAmount} onChangeText={setPayoutAmount} />
          <View className="flex-row gap-2 mb-3">{(['ECOCASH','INNBUCKS','BANK'] as const).map(m => <TouchableOpacity key={m} onPress={() => setPayoutMethod(m)} className={`flex-1 p-3 rounded-xl ${payoutMethod === m ? 'bg-accent' : 'bg-slate-100'}`}><Text className={`text-center text-xs font-bold ${payoutMethod === m ? 'text-white' : 'text-slate-700'}`}>{m}</Text></TouchableOpacity>)}</View>
          <TextInput className="font-sans border border-slate-200 rounded-xl p-4 mb-3" placeholder="Account / wallet holder name" value={payoutName} onChangeText={setPayoutName} />
          <TextInput className="font-sans border border-slate-200 rounded-xl p-4 mb-4" placeholder={payoutMethod === 'BANK' ? 'Bank account number and bank' : 'Mobile money number'} value={payoutDestination} onChangeText={setPayoutDestination} />
          <TouchableOpacity disabled={isLoading} onPress={requestPayout} className="bg-accent rounded-2xl p-4 items-center">{isLoading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-display font-black">Submit payout request</Text>}</TouchableOpacity>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}
