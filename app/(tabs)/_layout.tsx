import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // This kills the bottom bar + Explore button
      }}
    >
      <Tabs.Screen
        name="index" // This points to your main Transmitter/Receiver screen
        options={{
          title: 'Home',
        }}
      />
      {/* Remove any <Tabs.Screen name="explore" /> blocks here */}
    </Tabs>
  );
}
