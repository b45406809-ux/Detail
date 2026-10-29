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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingList } from '../../components/LoadingList';
import { LoadingError } from '../../components/LoadingError';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  X,
  Smartphone,
  CreditCard,
  Wallet,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from '../../services/supabase';
import { addFundsToWallet, getPaymentMethods } from '../../services/payments';
import { callFunction } from '../../services/functions';
import { WalletTransaction } from '../../types';
import { formatDate } from '../../utils/date';

const METHOD_ICONS: Record<string, any> = {
  ecocash: Smartphone,
  card: CreditCard,
};

export default function WalletScreen() {
  const { user, profile } = useAuth();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState(false);
  const [transactionsRetry, setTransactionsRetry] = useState(0);
  const userId = user?.uid;
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'ECOCASH' | 'INNBUCKS' | 'BANK'>('ECOCASH');
  const [payoutName, setPayoutName] = useState('');
  const [payoutDestination, setPayoutDestination] = useState('');

  const paymentMethods = getPaymentMethods();

  // Real-time transaction feed from Firestore
  useEffect(() => {
    if (!userId) { setTransactions([]); setTransactionsLoading(false); return; }
    setTransactionsLoading(true);
    setTransactionsError(false);
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    return onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WalletTransaction)));
      setTransactionsLoading(false);
      setTransactionsError(false);
    }, () => { setTransactionsLoading(false); setTransactionsError(true); });
  }, [userId, transactionsRetry]);

  const handleAddFunds = async () => {
    const value = parseFloat(amount);
    if (isNaN(value) || value < 1) {
      Alert.alert('Invalid amount', 'Minimum top-up is $1.00');
      return;
    }
    setIsLoading(true);
    try {
      const result = await addFundsToWallet(value);
      setIsAddFundsOpen(false);
      setAmount('');

      if (result.pending) {
        Alert.alert(
          'Payment Processing',
          'Your payment is being confirmed. Your balance will update automatically once the transaction is complete.'
        );
      }
    } catch (err: any) {
      if (err.message !== 'CANCELED') {
        Alert.alert('Payment Failed', err.message || 'Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const balance = profile?.balance ?? 0;
  const isCleaner = profile?.role === 'CLEANER';
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
      Alert.alert('Payout requested', 'Your cleared earnings are reserved. Detail will send the transfer and update the request status.');
    } catch (error: any) {
      Alert.alert('Could not request payout', error?.message ?? 'Please check the amount and payout details.');
    } finally { setIsLoading(false); }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F2F1F5]">
      {/* Header */}
      <View className="px-5 pt-4 pb-4">
        <Text className="text-2xl font-display font-black text-slate-900 tracking-tight">Wallet</Text>
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
        <Text className="font-sans text-sm text-white/60 font-medium">{isCleaner ? `Cleared earnings · $${Number(profile?.commissionBalance ?? 0).toFixed(2)} commission credit` : 'Detail Wallet'}</Text>

        <View className="flex-row gap-3 mt-6">
          <TouchableOpacity
            onPress={() => setIsAddFundsOpen(true)}
            className="flex-1 bg-white/20 py-3 rounded-2xl flex-row items-center justify-center gap-2"
            activeOpacity={0.8}
          >
            <Plus size={16} color="#fff" />
            <Text className="text-white font-display font-black text-xs uppercase tracking-wider">{isCleaner ? 'Top up commission' : 'Add Funds'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => isCleaner ? setIsPayoutOpen(true) : Alert.alert('Withdraw', 'Withdrawals are available for cleaner earnings.')}
            className="flex-1 bg-white/20 py-3 rounded-2xl flex-row items-center justify-center gap-2"
            activeOpacity={0.8}
          >
            <ArrowUpRight size={16} color="#fff" />
            <Text className="text-white font-display font-black text-xs uppercase tracking-wider">{isCleaner ? 'Request payout' : 'Withdraw'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isCleaner && <View className="mx-5 mb-6 rounded-2xl bg-white p-4 border border-slate-100"><Text className="font-display font-black text-slate-900">How earnings and commission work</Text><Text className="font-sans text-sm text-slate-600 mt-2">Completed jobs may have a Detail commission. Commission credit covers eligible direct-payment jobs. Cleared earnings appear above when available; request a payout from this screen. Payouts are reviewed and sent manually while integrations are unavailable, so transfer timing is not guaranteed.</Text></View>}

      {balance < 0 && (
        <TouchableOpacity
          onPress={() => setIsAddFundsOpen(true)}
          activeOpacity={0.85}
          className="mx-5 mb-6 bg-red-50 border border-red-100 rounded-3xl p-4 flex-row items-center gap-3"
        >
          <View className="w-10 h-10 bg-red-100 rounded-2xl items-center justify-center">
            <ArrowUpRight size={18} color="#ef4444" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-display font-black text-red-700">Outstanding commission balance</Text>
            <Text className="font-sans text-xs text-red-500 font-medium mt-0.5">
              Add funds to bring your balance to $0 and keep bidding on jobs
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Payment methods (informational — the processor handles selection on its hosted page) */}
      <View className="mx-5 mb-6">
        <Text className="text-xs font-display font-black text-slate-400 uppercase tracking-widest mb-3">
          Accepted Payment Methods
        </Text>
        <View className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
          {paymentMethods.map(({ id, label, sub }, idx) => {
            const Icon = METHOD_ICONS[id] ?? CreditCard;
            return (
              <View
                key={id}
                className={`flex-row items-center gap-4 px-5 py-4 ${
                  idx < paymentMethods.length - 1 ? 'border-b border-slate-50' : ''
                }`}
              >
                <View className="w-10 h-10 bg-accent/10 rounded-2xl items-center justify-center">
                  <Icon size={18} color="#3906d2" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-display font-black text-slate-900">{label}</Text>
                  <Text className="font-sans text-xs text-slate-400 font-medium mt-0.5">{sub}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Transactions */}
      <View className="flex-1 px-5">
        <Text className="text-xs font-display font-black text-slate-400 uppercase tracking-widest mb-3">
          Recent Transactions
        </Text>
        {transactionsLoading ? (
          <LoadingList rows={3} />
        ) : transactionsError ? (
          <LoadingError message="Could not load transactions. Check your connection and try again." onRetry={() => setTransactionsRetry(value => value + 1)} />
        ) : transactions.length === 0 ? (
          <View className="bg-white rounded-3xl p-8 items-center border border-slate-100">
            <Text className="font-sans text-3xl mb-3">💳</Text>
            <Text className="text-sm font-display font-black text-slate-600 text-center">
              No transactions yet
            </Text>
          </View>
        ) : (
          <FlatList
            data={transactions}
            keyExtractor={(t) => t.id}
            showsVerticalScrollIndicator={false}
            contentContainerClassName="gap-3"
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
        )}
      </View>

      {/* Add Funds Modal */}
      <Modal visible={isAddFundsOpen} transparent animationType="slide">
        <View className="flex-1 justify-end">
          <TouchableOpacity
            className="flex-1 bg-black/50"
            onPress={() => setIsAddFundsOpen(false)}
          />
          <View className="bg-white rounded-t-[32px] p-6 pb-10">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-xl font-display font-black text-slate-900">{isCleaner ? 'Top up commission credit' : 'Add Funds'}</Text>
              <TouchableOpacity onPress={() => setIsAddFundsOpen(false)}>
                <X size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <Text className="font-sans text-xs text-slate-400 font-medium mb-6">
              {isCleaner ? 'Prepaid credit for direct-payment booking commissions' : 'Add USD credit to your Detail wallet'}
            </Text>

            <View className="mb-5 flex-row items-center gap-3 rounded-2xl border border-violet-100 bg-[#F7F4FF] p-3.5"><View className="h-10 w-10 items-center justify-center rounded-xl bg-accent"><Text className="font-display text-lg font-black text-white">P</Text></View><View className="flex-1"><Text className="font-display text-sm font-black text-ink">Paynow secure checkout</Text><Text className="font-sans text-[11px] text-ink/55">Choose EcoCash, mobile money, or card on Paynow</Text></View></View>

            <Text className="text-xs font-display font-black text-slate-500 uppercase tracking-widest mb-2">
              Amount (USD)
            </Text>
            <TextInput
              className="border-2 border-slate-100 rounded-2xl px-4 py-4 text-2xl font-display font-black text-slate-900 bg-slate-50 mb-4"
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />

            {/* Quick-amount chips */}
            <View className="flex-row gap-2 mb-5">
              {['5', '10', '25', '50'].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  onPress={() => setAmount(preset)}
                  className={`flex-1 py-2.5 rounded-2xl items-center border ${
                    amount === preset ? 'bg-accent border-accent' : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-black ${
                      amount === preset ? 'text-white' : 'text-slate-600'
                    }`}
                  >
                    ${preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleAddFunds}
              disabled={isLoading || !amount}
              className="bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-display font-black text-sm uppercase tracking-widest">
                  {`Continue securely · $${amount || '0.00'}`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={isPayoutOpen} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/50"><View className="bg-white rounded-t-[32px] p-6 pb-10">
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
