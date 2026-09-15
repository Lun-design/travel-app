import React from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { formatMetricDuration, type TimelineMetrics } from '@/lib/timeline-metrics';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';

export function DashboardMetricsBar({ metrics, themeMode = 'system', action }: { metrics: TimelineMetrics; themeMode?: ThemeMode; action?: React.ReactNode }) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  return <View accessibilityLabel="當天行程摘要" style={styles.container}>
    <Metric icon="📍" label={`${metrics.spotCount} 個景點`} theme={theme} />
    <Metric icon="⏱️" label={`停留 ${formatMetricDuration(metrics.stayMinutes)}`} theme={theme} />
    {metrics.transportMinutes > 0 ? <Metric icon="🚗" label={`交通 ${formatMetricDuration(metrics.transportMinutes)}`} theme={theme} /> : null}
    {action ? <View style={styles.action}>{action}</View> : null}
  </View>;
}

function Metric({ icon, label, theme }: { icon: string; label: string; theme: ReturnType<typeof getThemeForMode> }) {
  return <View style={styles.metric}><Text style={styles.icon}>{icon}</Text><Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 14, paddingHorizontal: 2, paddingVertical: 3, marginBottom: 6 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3 },
  icon: { fontSize: 15 },
  label: { fontSize: 12, fontWeight: '700' },
  action: { marginLeft: 'auto' },
});
