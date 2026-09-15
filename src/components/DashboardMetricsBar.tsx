import React from 'react';
import { StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { formatMetricDuration, type TimelineMetrics } from '@/lib/timeline-metrics';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';

export function DashboardMetricsBar({ metrics, themeMode = 'system', action }: { metrics: TimelineMetrics; themeMode?: ThemeMode; action?: React.ReactNode }) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const { width } = useWindowDimensions();
  const compact = width < 480;
  return <View accessibilityLabel="當天行程摘要" style={[styles.container, compact && styles.containerCompact]}>
    <Metric icon="📍" iconColor="#DC4A3D" label={`${metrics.spotCount} 個景點`} theme={theme} />
    <Metric icon="⏱️" iconColor="#2563EB" label={`停留 ${formatMetricDuration(metrics.stayMinutes)}`} theme={theme} />
    {metrics.transportMinutes > 0 ? <Metric icon="🚗" iconColor="#16A34A" label={`交通 ${formatMetricDuration(metrics.transportMinutes)}`} theme={theme} /> : null}
    {action ? <View style={[styles.action, compact && styles.actionCompact]}>{action}</View> : null}
  </View>;
}

function Metric({ icon, iconColor, label, theme }: { icon: string; iconColor: string; label: string; theme: ReturnType<typeof getThemeForMode> }) {
  return <View style={styles.metric}><Text style={[styles.icon, { color: iconColor }]}>{icon}</Text><Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', flexWrap: 'wrap', gap: 14, paddingHorizontal: 2, paddingVertical: 3, marginBottom: 6 },
  containerCompact: { gap: 8, paddingVertical: 4 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, minWidth: 0, flexShrink: 1 },
  icon: { fontSize: 15 },
  label: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  action: { marginLeft: 'auto', flexShrink: 0 },
  actionCompact: { marginLeft: 'auto' },
});
