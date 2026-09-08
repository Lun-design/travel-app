import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createReminderScheduler,
  getDueReminders,
  getNotificationPermission,
  getReminderSchedule,
  requestNotificationPermission,
  loadReminderPreference,
  saveReminderPreference,
  showReminderNotification,
  type NotificationEnvironment,
  type ReminderItem,
} from '../lib/notifications';

const item: ReminderItem = {
  id: 'spot-1',
  location_name: '淺草寺',
  day_number: 1,
  time: '10:00',
  address: '東京都台東區淺草 2-3-1',
};

describe('itinerary departure notifications', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports unsupported, default, granted and denied notification states', async () => {
    expect(getNotificationPermission({})).toBe('unsupported');
    const requestPermission = vi.fn().mockResolvedValue('granted');
    const environment: NotificationEnvironment = { Notification: { permission: 'default', requestPermission } };
    expect(getNotificationPermission(environment)).toBe('default');
    await expect(requestNotificationPermission(environment)).resolves.toBe('granted');
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(getNotificationPermission({ Notification: { permission: 'denied', requestPermission } })).toBe('denied');
  });

  it('calculates a 15-minute reminder before the itinerary start time', () => {
    const reminder = getReminderSchedule(item, '2026-09-10', 15);
    expect(reminder?.scheduledAt.getTime()).toBe(new Date(2026, 8, 10, 10, 0).getTime());
    expect(reminder?.remindAt.getTime()).toBe(new Date(2026, 8, 10, 9, 45).getTime());
    expect(reminder?.title).toBe('淺草寺');
  });

  it('returns only reminders due in the current one-minute window and skips sent items', () => {
    const due = getDueReminders([item], '2026-09-10', new Date(2026, 8, 10, 9, 45, 30), 15);
    expect(due).toHaveLength(1);
    expect(getDueReminders([item], '2026-09-10', new Date(2026, 8, 10, 9, 44, 59), 15)).toHaveLength(0);
    expect(getDueReminders([item], '2026-09-10', new Date(2026, 8, 10, 9, 45, 30), 15, new Set(['spot-1']))).toHaveLength(0);
  });

  it('checks the schedule on an interval and emits each reminder once', () => {
    vi.useFakeTimers();
    let now = new Date(2026, 8, 10, 9, 44, 59);
    const onReminder = vi.fn();
    const stop = createReminderScheduler({ items: [item], tripStartDate: '2026-09-10', now: () => now, intervalMs: 60_000, onReminder });
    expect(onReminder).not.toHaveBeenCalled();
    now = new Date(2026, 8, 10, 9, 45, 30);
    vi.advanceTimersByTime(60_000);
    expect(onReminder).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(onReminder).toHaveBeenCalledTimes(1);
    stop();
  });

  it('uses the registered service worker to show a reminder with navigation data', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue({ showNotification });
    const environment: NotificationEnvironment = { navigator: { serviceWorker: { register } } };
    const reminder = getReminderSchedule(item, '2026-09-10', 15)!;
    await expect(showReminderNotification(reminder, environment)).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('淺草寺'), expect.objectContaining({
      body: expect.stringContaining('10:00'),
      data: expect.objectContaining({ url: expect.stringContaining('google.com/maps/dir') }),
    }));
  });

  it('registers the Service Worker with the browser container as its receiver', async () => {
    let receiver: unknown;
    const container = {
      register(this: unknown) {
        receiver = this;
        return Promise.resolve({ showNotification: vi.fn() });
      },
    };
    await showReminderNotification(getReminderSchedule(item, '2026-09-10', 15)!, { navigator: { serviceWorker: container } });
    expect(receiver).toBe(container);
  });

  it('persists reminder preference separately for each trip', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(loadReminderPreference('trip-a', storage)).toBe(false);
    saveReminderPreference('trip-a', true, storage);
    expect(loadReminderPreference('trip-a', storage)).toBe(true);
    expect(loadReminderPreference('trip-b', storage)).toBe(false);
  });

  it('contains a Service Worker trigger for itinerary reminders', () => {
    const sw = readFileSync(path.resolve(process.cwd(), 'public', 'sw.js'), 'utf8');
    expect(sw).toContain('SHOW_ITINERARY_REMINDER');
    expect(sw).toContain('self.registration.showNotification');
    expect(sw).toContain("notificationclick");
    expect(sw).toContain('self.clients.openWindow');
  });

  it('exposes the reminder switch in trip settings', () => {
    const settings = readFileSync(path.resolve(process.cwd(), 'src', 'components', 'TripSettingsModal.tsx'), 'utf8');
    expect(settings).toContain('remindersEnabled');
    expect(settings).toContain('onReminderToggle');
    expect(settings).toContain('景點出發提醒');
  });
});
