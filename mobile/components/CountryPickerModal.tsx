import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, X, Check, Globe } from 'lucide-react-native';
import { COUNTRIES, Country } from '../constants/countries';

interface CountryPickerModalProps {
  visible: boolean;
  selectedCountry: Country;
  onSelect: (country: Country) => void;
  onClose: () => void;
}

export function CountryPickerModal({
  visible,
  selectedCountry,
  onSelect,
  onClose,
}: CountryPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => {
      const matchName = c.name.toLowerCase().includes(q);
      const matchCode = c.code.toLowerCase().includes(q);
      const matchDial = c.dialCode.replace('+', '').includes(q.replace('+', '')) || c.dialCode.includes(q);
      return matchName || matchCode || matchDial;
    });
  }, [searchQuery]);

  const handleSelect = (country: Country) => {
    onSelect(country);
    setSearchQuery('');
    onClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View className="px-5 pt-3 pb-3 border-b border-ink/5 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2.5">
              <View className="w-9 h-9 rounded-xl bg-accent/10 items-center justify-center">
                <Globe size={18} color="#3906D2" />
              </View>
              <View>
                <Text className="text-lg font-display font-black text-ink">Select Country</Text>
                <Text className="font-sans text-xs text-ink/40 font-medium">Choose from all {COUNTRIES.length} supported country and region codes</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="w-9 h-9 bg-ink/5 rounded-full items-center justify-center"
            >
              <X size={18} color="#150256" />
            </TouchableOpacity>
          </View>

          {/* Search Box */}
          <View className="px-5 py-3">
            <View className="flex-row items-center bg-ink/[0.03] border border-ink/10 rounded-2xl px-3.5 py-2.5">
              <Search size={18} color="rgba(21,2,86,0.4)" style={{ marginRight: 8 }} />
              <TextInput
                className="font-sans flex-1 text-sm font-medium text-ink p-0"
                placeholder="Search country or code (e.g. Zimbabwe, +263, US)..."
                placeholderTextColor="rgba(21,2,86,0.35)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && Platform.OS !== 'ios' && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={16} color="rgba(21,2,86,0.4)" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Country List */}
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => `${item.code}-${item.dialCode}`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isSelected =
                item.code === selectedCountry.code && item.dialCode === selectedCountry.dialCode;
              return (
                <TouchableOpacity
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                  className={`flex-row items-center justify-between px-5 py-3.5 border-b border-ink/[0.04] ${
                    isSelected ? 'bg-accent/[0.06]' : 'active:bg-ink/[0.02]'
                  }`}
                >
                  <View className="flex-row items-center gap-3.5 flex-1 pr-3">
                    <Text style={{ fontSize: 24 }}>{item.flag}</Text>
                    <View className="flex-1">
                      <Text
                        numberOfLines={1}
                        className={`text-sm ${
                          isSelected ? 'font-black text-accent' : 'font-bold text-ink'
                        }`}
                      >
                        {item.name}
                      </Text>
                      <Text className="font-sans text-xs text-ink/40 font-medium">{item.code}</Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <View
                      className={`px-2.5 py-1 rounded-lg ${
                        isSelected ? 'bg-accent text-white' : 'bg-ink/[0.05]'
                      }`}
                    >
                      <Text
                        className={`text-xs font-black tracking-wide ${
                          isSelected ? 'text-white' : 'text-ink/80'
                        }`}
                      >
                        {item.dialCode}
                      </Text>
                    </View>
                    {isSelected && (
                      <View className="w-5 h-5 rounded-full bg-accent items-center justify-center">
                        <Check size={12} color="#fff" strokeWidth={3} />
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View className="items-center justify-center py-12 px-6">
                <Text className="font-sans text-base font-bold text-ink/60 mb-1">No countries found</Text>
                <Text className="font-sans text-xs text-ink/40 text-center font-medium">
                  Try searching with a different name or dial code like "263" or "Zimbabwe"
                </Text>
              </View>
            }
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 24,
  },
});
