import { Tabs } from 'expo-router';
import { Home, Activity, MessageSquare, Wallet, User, LucideIcon } from 'lucide-react-native';
import { View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function TabIcon({ Icon, focused }: { Icon: LucideIcon; focused: boolean }) {
  return (
    <View
      style={{
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 14,
        backgroundColor: focused ? '#3906D2' : 'transparent',
      }}
    >
      <Icon size={20} color={focused ? '#fff' : '#5D5871'} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.96)' : 'transparent',
          borderTopColor: 'rgba(57,6,210,0.08)',
          borderTopWidth: 1,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
          elevation: 0,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ tabBarAccessibilityLabel: 'Home', tabBarIcon: ({ focused }) => <TabIcon Icon={Home} focused={focused} /> }}
      />
      <Tabs.Screen
        name="activity"
        options={{ tabBarAccessibilityLabel: 'Activity and bookings', tabBarIcon: ({ focused }) => <TabIcon Icon={Activity} focused={focused} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{ tabBarAccessibilityLabel: 'Messages', tabBarIcon: ({ focused }) => <TabIcon Icon={MessageSquare} focused={focused} /> }}
      />
      <Tabs.Screen
        name="wallet"
        options={{ tabBarAccessibilityLabel: 'Wallet', tabBarIcon: ({ focused }) => <TabIcon Icon={Wallet} focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarAccessibilityLabel: 'Profile', tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} /> }}
      />
    </Tabs>
  );
}
