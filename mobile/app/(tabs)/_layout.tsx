import { Tabs } from 'expo-router';
import { Home, MessageSquare, Wallet, User } from 'lucide-react-native';
import { View } from 'react-native';

function TabIcon({
  Icon,
  focused,
}: {
  Icon: React.ComponentType<{ size: number; color: string }>;
  focused: boolean;
}) {
  return (
    <View
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: focused ? '#3906d2' : 'transparent',
      }}
    >
      <Icon size={20} color={focused ? '#fff' : '#94a3b8'} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#f1f5f9',
          borderTopWidth: 1,
          height: 72,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon Icon={Home} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon Icon={MessageSquare} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon Icon={Wallet} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
