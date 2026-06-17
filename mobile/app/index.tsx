// Root index — auth guard handles navigation in _layout.tsx.
// This file serves as the entry point; the AuthGuard in _layout.tsx
// redirects to the appropriate screen based on auth state.
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3906d2' }}>
      <ActivityIndicator color="#fff" size="large" />
    </View>
  );
}
