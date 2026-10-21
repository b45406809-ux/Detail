import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Share, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Building2, UserPlus, UserMinus } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { db, collection, doc, onSnapshot, query, where } from '../services/supabase';
import { callFunction } from '../services/functions';

type Organization = { name: string; registrationNumber: string; phone: string; country: string; city: string };
type Member = { id: string; cleanerId: string; cleanerName: string; email: string; verificationStatus?: string };

export default function OrganizationScreen() {
  const { user, profile } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [country, setCountry] = useState('Zimbabwe');
  const [city, setCity] = useState('');
  const [cleanerName, setCleanerName] = useState('');
  const [cleanerEmail, setCleanerEmail] = useState('');

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'organizations', user.uid), (snap) => {
      setOrganization(snap.exists() ? snap.data() as Organization : null);
      setLoading(false);
    }, () => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user || !organization) return;
    return onSnapshot(query(collection(db, 'organizationMembers'), where('organizationId', '==', user.uid)), (snap) => {
      setMembers(snap.docs.map((item) => ({ id: item.id, ...item.data() } as Member)));
    });
  }, [user, organization]);

  const register = async () => {
    if (!name.trim() || !registrationNumber.trim() || !phone.trim() || !country.trim() || !city.trim()) {
      Alert.alert('Complete organization details', 'Enter the organization name, registration number, phone, country, and city.');
      return;
    }
    setSaving(true);
    try {
      await callFunction('registerOrganization', { name, registrationNumber, phone, country, city });
    } catch (error) {
      Alert.alert('Could not register organization', (error as Error).message || 'Please try again.');
    } finally { setSaving(false); }
  };

  const invite = async () => {
    if (!cleanerName.trim() || !cleanerEmail.trim()) {
      Alert.alert('Cleaner details required', 'Enter the cleaner’s name and email address.');
      return;
    }
    setSaving(true);
    try {
      const result = await callFunction<{ cleanerName: string; email: string }, { code: string }>('createOrganizationCleanerInvite', { cleanerName, email: cleanerEmail });
      setCleanerName(''); setCleanerEmail('');
      Alert.alert('Invitation code created', `Share this code with ${cleanerEmail}. They must register using that email and complete Didit identity verification.`, [
        { text: 'Share code', onPress: () => { void Share.share({ message: `Detail organization invitation code: ${result.code}. Register with ${cleanerEmail}, complete identity verification, then enter this code in cleaner registration.` }); } },
        { text: 'Done', style: 'cancel' },
      ]);
    } catch (error) {
      Alert.alert('Could not invite cleaner', (error as Error).message || 'Please try again.');
    } finally { setSaving(false); }
  };

  const removeMember = (member: Member) => Alert.alert('Remove cleaner?', `${member.cleanerName} will no longer be linked to this organization. Their Detail account and KYC remain theirs.`, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { setSaving(true); try { await callFunction('removeOrganizationCleaner', { memberId: member.id }); } catch (error) { Alert.alert('Could not remove cleaner', (error as Error).message || 'Please try again.'); } finally { setSaving(false); } } },
  ]);

  return <SafeAreaView className="flex-1 bg-[#F3F1FC]">
    <View className="flex-row items-center gap-3 px-5 pt-4 pb-4 bg-white">
      <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-ink/5 rounded-2xl items-center justify-center"><ArrowLeft size={18} color="#150256" /></TouchableOpacity>
      <View><Text className="text-xl font-display font-black text-ink">Organization</Text><Text className="font-sans text-xs text-ink/40">Register and manage cleaner membership</Text></View>
    </View>
    {loading ? <View className="flex-1 items-center justify-center"><ActivityIndicator color="#3906D2" /></View> : !organization ? <FlatList
      data={[{ key: 'form' }]}
      keyExtractor={(item) => item.key}
      contentContainerClassName="p-5 pb-10"
      renderItem={() => <View className="bg-white rounded-3xl p-5 gap-3">
        <Building2 size={30} color="#3906D2" />
        <Text className="text-xl font-display font-black text-ink">Register your organization</Text>
        <Text className="font-sans text-sm text-ink/50 mb-2">After registering, invite cleaners to join your team. Each cleaner completes their own identity check and shares only their verification status.</Text>
        <Field label="Organization name" value={name} onChangeText={setName} placeholder="Company or organization name" />
        <Field label="Registration number" value={registrationNumber} onChangeText={setRegistrationNumber} placeholder="Business registration number" />
        <Field label="Contact phone" value={phone} onChangeText={setPhone} placeholder="+263…" keyboardType="phone-pad" />
        <Field label="Country" value={country} onChangeText={setCountry} placeholder="Country" />
        <Field label="City" value={city} onChangeText={setCity} placeholder="City" />
        <TouchableOpacity disabled={saving} onPress={register} className="bg-accent rounded-2xl p-4 items-center mt-2">{saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-display font-black">Register organization</Text>}</TouchableOpacity>
      </View>}
    /> : <FlatList
      data={members}
      keyExtractor={(item) => item.id}
      contentContainerClassName="p-5 pb-10 gap-4"
      ListHeaderComponent={<View className="gap-4">
        <View className="bg-white rounded-3xl p-5"><Text className="text-xs font-display font-black text-accent uppercase tracking-widest">Registered organization</Text><Text className="text-xl font-display font-black text-ink mt-1">{organization.name}</Text><Text className="font-sans text-sm text-ink/50 mt-1">{organization.registrationNumber} · {organization.city}, {organization.country}</Text></View>
        <View className="bg-white rounded-3xl p-5 gap-3">
          <View className="flex-row items-center gap-2"><UserPlus size={18} color="#3906D2" /><Text className="text-base font-display font-black text-ink">Add a cleaner</Text></View>
          <Text className="font-sans text-xs text-ink/50">Create an invitation code for the cleaner. They sign in with the invited email, complete their own Didit KYC, and enter the code to join your organization.</Text>
          <Field label="Cleaner name" value={cleanerName} onChangeText={setCleanerName} placeholder="Cleaner’s full name" />
          <Field label="Cleaner email" value={cleanerEmail} onChangeText={setCleanerEmail} placeholder="name@example.com" keyboardType="email-address" />
          <TouchableOpacity disabled={saving} onPress={invite} className="bg-accent rounded-2xl p-4 items-center">{saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-display font-black">Create invitation code</Text>}</TouchableOpacity>
        </View>
        <Text className="text-xs font-display font-black text-ink/40 uppercase tracking-widest">Verified cleaners · {members.length}</Text>
      </View>}
      ListEmptyComponent={<View className="bg-white rounded-3xl p-5"><Text className="font-sans text-sm text-ink/50">No cleaners have joined yet. Invite a cleaner using their account email.</Text></View>}
      renderItem={({ item }) => <View className="bg-white rounded-2xl p-4 flex-row items-center"><View className="flex-1"><Text className="font-display font-black text-ink">{item.cleanerName}</Text><Text className="font-sans text-xs text-ink/50 mt-1">{item.email} · Identity verified</Text></View><TouchableOpacity disabled={saving} onPress={() => removeMember(item)} accessibilityLabel={`Remove ${item.cleanerName}`} className="h-10 w-10 items-center justify-center rounded-xl bg-red-50"><UserMinus size={17} color="#DC2626"/></TouchableOpacity></View>}
    />}
  </SafeAreaView>;
}

function Field({ label, ...props }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'phone-pad' | 'email-address' }) {
  return <View><Text className="text-xs font-display font-black text-ink/50 mb-1.5">{label}</Text><TextInput {...props} autoCapitalize={props.keyboardType === 'email-address' ? 'none' : 'words'} className="font-sans border border-ink/10 rounded-2xl bg-white px-4 py-3 text-sm text-ink" placeholderTextColor="#9C94C4" /></View>;
}
