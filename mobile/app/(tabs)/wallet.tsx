import React, { useEffect, useState } from 'react';
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
import { ArrowUpRight, ArrowDownLeft, Plus, X, CreditCard, Wallet } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from '../../services/firebase';
import { WalletTransaction } from '../../types';

export default function WalletScreen() {
  const { user, profile } = useAuth();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    return onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WalletTransaction)));
    });
  }, [user]);

  const handleAddFunds = async () => {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setIsLoading(false);
    setIsAddFundsOpen(false);
    setAmount('');
    Alert.alert('Coming Soon', 'Payment integration will be available in the next update.');
  };

  const balance = profile?.balance ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-[#F2F1F5]">
      {/* Header */}
      <View className="px-5 pt-4 pb-4">
        <Text className="text-2xl font-black text-slate-900 tracking-tight">Wallet</Text>
      </View>

      {/* Balance card */}
      <View className="mx-5 mb-6 bg-accent rounded-4xl p-6 shadow-xl shadow-accent/30">
        <View className="flex-row items-center gap-2 mb-4">
          <Wallet size={18} color="rgba(255,255,255,0.7)" />
          <Text className="text-xs font-black text-white/70 uppercase tracking-widest">
            Available Balance
          </Text>
        </View>
        <Text className="text-4xl font-black text-white mb-1">${balance.toFixed(2)}</Text>
        <Text className="text-sm text-white/60 font-medium">Detail Wallet</Text>

        <View className="flex-row gap-3 mt-6">
          <TouchableOpacity
            onPress={() => setIsAddFundsOpen(true)}
            className="flex-1 bg-white/20 py-3 rounded-2xl flex-row items-center justify-center gap-2"
            activeOpacity={0.8}
          >
            <Plus size={16} color="#fff" />
            <Text className="text-white font-black text-xs uppercase tracking-wider">Add Funds</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setIsWithdrawOpen(true)}
            className="flex-1 bg-white/20 py-3 rounded-2xl flex-row items-center justify-center gap-2"
            activeOpacity={0.8}
          >
            <ArrowUpRight size={16} color="#fff" />
            <Text className="text-white font-black text-xs uppercase tracking-wider">Withdraw</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Payment methods */}
      <View className="mx-5 mb-6">
        <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
          Payment Methods
        </Text>
        {[
          { label: 'Visa ending in 4242', sub: 'Expires 12/26', icon: CreditCard },
        ].map(({ label, sub, icon: Icon }) => (
          <View
            key={label}
            className="bg-white rounded-3xl p-4 flex-row items-center gap-4 border border-slate-100"
          >
            <View className="w-12 h-12 bg-accent/10 rounded-2xl items-center justify-center">
              <Icon size={22} color="#3906d2" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-black text-slate-900">{label}</Text>
              <Text className="text-xs text-slate-400 font-medium mt-0.5">{sub}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Transactions */}
      <View className="flex-1 px-5">
        <Text className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
          Recent Transactions
        </Text>
        {transactions.length === 0 ? (
          <View className="bg-white rounded-3xl p-8 items-center border border-slate-100">
            <Text className="text-3xl mb-3">💳</Text>
            <Text className="text-sm font-black text-slate-600 text-center">
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
                  <Text className="text-sm font-black text-slate-900">{item.description}</Text>
                  <Text className="text-xs text-slate-400 font-medium mt-0.5">
                    {item.createdAt?.toDate?.()?.toLocaleDateString() ?? 'Recent'}
                  </Text>
                </View>
                <Text
                  className={`text-base font-black ${
                    item.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {item.type === 'CREDIT' ? '+' : '-'}${item.amount.toFixed(2)}
                </Text>
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
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-xl font-black text-slate-900">Add Funds</Text>
              <TouchableOpacity onPress={() => setIsAddFundsOpen(false)}>
                <X size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <Text className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
              Amount (USD)
            </Text>
            <TextInput
              className="border-2 border-slate-100 rounded-2xl px-4 py-4 text-2xl font-black text-slate-900 bg-slate-50 mb-4"
              placeholder="0.00"
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
            <TouchableOpacity
              onPress={handleAddFunds}
              disabled={isLoading}
              className="bg-accent py-5 rounded-[32px] items-center shadow-lg shadow-accent/30"
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-black text-sm uppercase tracking-widest">
                  Add ${amount || '0.00'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
