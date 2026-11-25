import { appAlert, AppDialogHost } from '@/components/AppDialog';
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useCleanerEarnings } from '../../hooks/useCleanerEarnings';
import { WalletTransaction } from '../../types';
import { formatDate } from '../../utils/date';

export default function WalletScreen() {
  const { user, profile } = useAuth();
  const isCleaner = profile?.role === 'CLEANER';
  const { verification, returnToCleaner, topupAmount } = useLocalSearchParams<{ verification?: string; returnToCleaner?: string; topupAmount?: string }>();
  const isVerification = verification === '1' && !isCleaner;
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState(false);
  const [transactionsRetry, setTransactionsRetry] = useState(0);
  const [transactionLimit, setTransactionLimit] = useState(20);
  const [earningsRetry, setEarningsRetry] = useState(0);
  const userId = user?.uid;
  const { summary: earnings, error: earningsError, loading: earningsLoading } = useCleanerEarnings(isCleaner ? userId : undefined, earningsRetry);
  const [paymentHistory, setPaymentHistory] = useState<EcoCashPayment[]>([]);
  const [paymentPage, setPaymentPage] = useState<number | null>(null);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState(false);
  const [hiddenPayments, setHiddenPayments] = useState<string[]>([]);
  const [checkingPayment, setCheckingPayment] = useState<string>();
  const historyRequest = React.useRef(0);
  const hiddenPaymentsKey = `detail:hidden-ecocash:${userId}`;
  const loadPaymentHistory = React.useCallback(async (offset = 0) => {
    if (!userId || !isCleaner) return;
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
  }, [userId, isCleaner]);
  useFocusEffect(React.useCallback(() => {
    if (isCleaner) void loadPaymentHistory();
  }, [isCleaner, loadPaymentHistory]));
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
    if (!isCleaner || !topupAmount) return;
    const suggested = Number(topupAmount);
    if (!Number.isFinite(suggested) || suggested < 1 || suggested > 1000) return;
    setAmount(suggested.toFixed(2));
    setIsAddFundsOpen(true);
  }, [isCleaner, topupAmount]);
  useEffect(() => {
    let active = true;
    setPendingReference(undefined);
    if (userId) void pendingEcoCashTopup(userId).then(reference => {
      if (active) setPendingReference(reference);
    }).catch(() => {});
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (profile && !isCleaner && !isVerification) router.replace('/(tabs)/home');
  }, [profile, isCleaner, isVerification]);
  const [isLoading, setIsLoading] = useState(false);

  // EcoCash completes outside the app. Refresh the active attempt while the
  // wallet is open so a declined prompt does not remain pending on screen.
  useFocusEffect(React.useCallback(() => {
    if (!userId || !pendingReference || isLoading || checkingPayment) return;
    let active = true;
    let checking = false;
    const refresh = async () => {
      if (checking || auth.currentUser?.uid !== userId) return;
      checking = true;
      try {
        const status = await refreshEcoCashTopup(pendingReference);
        if (!active || auth.currentUser?.uid !== userId || !isTopupFinished(status)) return;
        setPendingReference(current => current === pendingReference ? undefined : current);
        setPaymentHistory(current => current.map(payment => payment.referenceNumber === pendingReference ? { ...payment, status } : payment));
        setCanRetryPayment(status !== 'PAID');
        void loadPaymentHistory();
        if (status === 'PAID') {
          setIsAddFundsOpen(false);
          appAlert('Payment confirmed', isVerification ? 'Return to cleaner registration to continue.' : 'Your payment has been applied.');
        } else if (status === 'CANCELLED' || status === 'FAILED') {
          appAlert('Payment not completed', 'Paynow reports this payment was cancelled or failed. You can retry.');
        }
      } catch {
        // Keep the attempt pending until Paynow can confirm its outcome.
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(() => { void refresh(); }, 30000);
    void refresh();
    return () => { active = false; clearInterval(timer); };
  }, [userId, pendingReference, isVerification, loadPaymentHistory, isLoading, checkingPayment]));

  useEffect(() => {
    if (isVerification) setIsAddFundsOpen(true);
  }, [isVerification]);


  // Real-time transaction feed from Firestore
  useEffect(() => {
    if (!userId || isVerification) { setTransactions([]); setTransactionsLoading(false); return; }
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
  }, [userId, isVerification, transactionsRetry, transactionLimit]);

  const handleAddFunds = async () => {
    if (!pendingReference && !isCleaner && !isVerification) {
      setIsAddFundsOpen(false);
      router.push({ pathname: '/(tabs)/wallet', params: { verification: '1', returnToCleaner: '1' } });
      return;
    }
    const value = isVerification ? 2.00 : Number(amount);
    const phone = ecoCashPhone.trim().replace(/[ +().-]/g, '').replace(/^263/, '0');
    if (!pendingReference && (!Number.isFinite(value) || value < (isVerification ? 2 : 1) || value > 1000 || Math.round(value * 100) / 100 !== value)) {
      appAlert('Invalid amount', isVerification ? 'Cleaner registration requires exactly $2.00 USD.' : 'Enter a commission top-up from $1.00 to $1,000 USD.');
      return;
    }
    if (!pendingReference && !/^07[78][0-9]{7}$/.test(phone)) {
      appAlert('Invalid number', 'Enter your EcoCash mobile number.');
      return;
    }
    setIsLoading(true);
    try {
      let status: string;
      let failureReason: string | undefined;
      if (pendingReference) {
        status = await refreshEcoCashTopup(pendingReference);
        if (!isTopupFinished(status)) appAlert('Payment pending', 'Paynow has not confirmed the outcome. If no prompt arrived, check the payment reference in Wallet history.');
      } else {
        const topup = await addFundsToWallet(value, phone, isVerification ? 'VERIFICATION' : 'COMMISSION');
        status = topup.status;
        failureReason = topup.failureReason;
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
          appAlert('Payment not completed', failureReason || 'Check your EcoCash number and USD balance, then tap Retry payment.');
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

  if (profile && !isCleaner && !isVerification) return null;

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      {/* Header */}
      <View className="px-5 pt-4 pb-4">
        <View className="flex-row items-center gap-3">
          {isVerification && <TouchableOpacity accessibilityLabel="Back to cleaner registration" onPress={() => router.back()} className="p-2"><ArrowLeft size={22} color="#150256" /></TouchableOpacity>}
          <Text className="text-2xl font-display font-black text-slate-900 tracking-tight">{isVerification ? 'Verification payment' : 'Wallet'}</Text>
        </View>
      </View>

      {isCleaner ? <View className="gap-4 px-5 mb-6">
        <View className="bg-accent rounded-4xl p-6 shadow-xl shadow-accent/30">
          <View className="flex-row items-center gap-2 mb-4">
            <Wallet size={18} color="rgba(255,255,255,0.7)" />
            <Text className="text-xs font-display font-black text-white/70 uppercase tracking-widest">Prepaid commission</Text>
          </View>
          <Text className="text-4xl font-display font-black text-white mb-1">${Number(profile?.commissionBalance ?? 0).toFixed(2)}</Text>
          <Text className="font-sans text-sm text-white/70">When a job is marked completed, Detail deducts 10% of the job value from your prepaid commission credit.</Text>
          {Number(profile?.commissionOwed ?? 0) > 0 && <Text className="font-sans-bold text-sm text-white mt-3">Commission due: ${Number(profile?.commissionOwed ?? 0).toFixed(2)} · Clear this before accepting new jobs.</Text>}
          <TouchableOpacity onPress={() => setIsAddFundsOpen(true)} className="mt-5 bg-white/20 py-3 rounded-2xl flex-row items-center justify-center gap-2" activeOpacity={0.8}>
            <Plus size={16} color="#fff" />
            <Text className="text-white font-display font-black text-xs uppercase tracking-wider">{pendingReference ? 'Check EcoCash payment' : 'Top up commission'}</Text>
          </TouchableOpacity>
          <Text className="font-sans text-xs text-white/60 mt-3">Your $1 minimum credit covers up to $10 of accepted bookings.</Text>
        </View>
        <View className="rounded-3xl border border-slate-100 bg-white p-5">
          <Text className="font-display font-black text-slate-900">Total earnings</Text>
          {earningsError ? (
            <View>
              <Text className="mt-2 font-sans text-sm text-slate-500">Could not load earnings.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => setEarningsRetry(value => value + 1)} className="self-start py-2">
                <Text className="font-sans-bold text-sm text-accent">Retry earnings</Text>
              </TouchableOpacity>
            </View>
          ) : earningsLoading ? (
            <ActivityIndicator accessibilityLabel="Loading earnings" color="#3906D2" style={{ alignSelf: 'flex-start', marginTop: 8 }} />
          ) : earnings ? (
            <>
              <Text className="mt-2 text-3xl font-display font-black text-slate-900">${earnings.totalEarnings.toFixed(2)}</Text>
              <Text className="mt-1 font-sans text-sm text-slate-500">After Detail commission across {earnings.completedJobs} completed {earnings.completedJobs === 1 ? 'booking' : 'bookings'}. Customer payments are settled directly with you.</Text>
            </>
          ) : null}
        </View>
      </View> : <View className="mx-5 mb-6 bg-accent rounded-4xl p-6 shadow-xl shadow-accent/30">
        <View className="flex-row items-center gap-2 mb-4">
          <Wallet size={18} color="rgba(255,255,255,0.7)" />
          <Text className="text-xs font-display font-black text-white/70 uppercase tracking-widest">Cleaner registration payment</Text>
        </View>
        <Text className="text-2xl font-display font-black text-white mb-1">$2.00</Text>
        <Text className="font-sans text-sm text-white/70 font-medium">$1 pays the one-time identity check and $1 remains as prepaid commission credit.</Text>
        {(isVerification || pendingReference) && <TouchableOpacity onPress={() => setIsAddFundsOpen(true)} className="mt-6 bg-white/20 py-3 rounded-2xl flex-row items-center justify-center gap-2" activeOpacity={0.8}>
          <Plus size={16} color="#fff" />
          <Text className="text-white font-display font-black text-xs uppercase tracking-wider">{pendingReference ? 'Check EcoCash payment' : 'Fund verification'}</Text>
        </TouchableOpacity>}
      </View>}

      {/* Cleaner commission and payment history. */}
      {!isVerification && <View className="flex-1 px-5">
        <FlatList
          data={transactions}
          keyExtractor={(t) => t.id}
          showsVerticalScrollIndicator={false}
          contentContainerClassName="gap-3"
          refreshing={paymentHistoryLoading && paymentHistory.length > 0}
          onRefresh={() => {
            void loadPaymentHistory();
            setTransactionsRetry(value => value + 1);
            setEarningsRetry(value => value + 1);
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
      </View>}

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
              <Text className="font-sans text-sm text-slate-600 mb-5">Approve the request on your EcoCash phone, then check its status here. Pending requests expire in Detail after 5 minutes.</Text>
            ) : (
              <>
                <Text className="font-sans text-sm text-slate-600 mb-5">
                  {isVerification ? 'Pay $2.00 USD: $1.00 covers your identity check and $1.00 remains as your minimum cleaner commission deposit.' : 'Commission top-ups start at $1.00 USD. Top-ups first clear any commission due.'}
                </Text>
                {!isVerification && <>
                  <Text className="font-sans-bold text-sm text-slate-700 mb-2">Amount (USD)</Text>
                  <TextInput accessibilityLabel="Amount in US dollars" className="bg-slate-50 rounded-2xl px-4 py-4 mb-4 font-sans text-slate-900"
                    placeholder="1.00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
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
    </SafeAreaView>
  );
}
