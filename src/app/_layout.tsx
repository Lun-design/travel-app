import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from 'react-native';
import { AuthGate } from '@/components/AuthGate';

export default function RootLayout() { const scheme = useColorScheme(); return <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}><AuthGate><Stack screenOptions={{ headerShown: false }} /></AuthGate></ThemeProvider>; }
