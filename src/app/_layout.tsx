import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthGate } from '@/components/AuthGate';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() { const scheme = useColorScheme(); return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}><AuthGate><Stack screenOptions={{ headerShown: false }} /></AuthGate></ThemeProvider></SafeAreaProvider></GestureHandlerRootView>; }
