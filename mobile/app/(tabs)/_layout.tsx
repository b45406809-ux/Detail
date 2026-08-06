import { Tabs } from 'expo-router';
import { Home, Activity, MessageSquare, Wallet, User, LucideIcon } from 'lucide-react-native';
import { View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';

function TabIcon({ Icon, focused }: { Icon: LucideIcon; focused: boolean }) {
  return (
    <View
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 14,
        backgroundColor: focused ? '#3906D2' : 'transparent',
      }}
    >
      <Icon size={20} color={focused ? '#fff' : '#9B93C9'} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.96)' : 'transparent',
          borderTopColor: 'rgba(57,6,210,0.08)',
          borderTopWidth: 1,
          height: 82,
          paddingTop: 10,
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
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Home} focused={focused} /> }}
      />
      <Tabs.Screen
        name="activity"
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Activity} focused={focused} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={MessageSquare} focused={focused} /> }}
      />
      <Tabs.Screen
        name="wallet"
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Wallet} focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} /> }}
      />
    </Tabs>
  );
}
