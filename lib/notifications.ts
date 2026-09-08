export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export type NotificationLike = {
  permission: Exclude<NotificationPermissionState, 'unsupported'>;
  requestPermission: () => Promise<Exclude<NotificationPermissionState, 'unsupported'>>;
};

export type ServiceWorkerRegistrationLike = {
  showNotification?: (title: string, options?: Record<string, unknown>) => Promise<void>;
};

export type NotificationEnvironment = {
  Notification?: NotificationLike;
  navigator?: {
    serviceWorker?: {
      register: (scriptUrl: string, options?: { updateViaCache?: 'imports' | 'all' | 'none' }) => Promise<ServiceWorkerRegistrationLike>;
    };
  };
};

export type ReminderItem = {
  id: string;
  location_name?: string | null;
  title?: string | null;
  day_number?: number | null;
  time?: string | null;
  start_time?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type ScheduledReminder = {
  itemId: string;
  title: string;
  scheduledAt: Date;
  remindAt: Date;
  navigationUrl: string;
};

export type ReminderSchedulerOptions = {
  items: readonly ReminderItem[];
  getItems?: () => readonly ReminderItem[];
  tripStartDate: string;
  leadMinutes?: number;
  intervalMs?: number;
  now?: () => Date;
  onReminder: (reminder: ScheduledReminder) => void;
};

export type ReminderStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const REMINDER_PREFERENCE_PREFIX = 'travel-planner.reminders:';

function browserStorage(): ReminderStorage | null {
  try {
    const storage = (globalThis as typeof globalThis & { localStorage?: ReminderStorage }).localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

export function loadReminderPreference(tripId: string, storage: ReminderStorage | null = browserStorage()): boolean {
  if (!tripId.trim() || !storage) return false;
  try {
    return storage.getItem(`${REMINDER_PREFERENCE_PREFIX}${tripId}`) === 'enabled';
  } catch {
    return false;
  }
}

export function saveReminderPreference(tripId: string, enabled: boolean, storage: ReminderStorage | null = browserStorage()): void {
  if (!tripId.trim() || !storage) return;
  try {
    storage.setItem(`${REMINDER_PREFERENCE_PREFIX}${tripId}`, enabled ? 'enabled' : 'disabled');
  } catch {
    // Private browsing and restricted storage should not block the reminder toggle.
  }
}

function browserEnvironment(): NotificationEnvironment {
  const runtime = globalThis as typeof globalThis & {
    Notification?: NotificationLike;
    navigator?: NotificationEnvironment['navigator'];
  };
  return { Notification: runtime.Notification, navigator: runtime.navigator };
}

function normalizePermission(value: unknown): NotificationPermissionState {
  return value === 'granted' || value === 'denied' || value === 'default' ? value : 'unsupported';
}

export function getNotificationPermission(environment: NotificationEnvironment = browserEnvironment()): NotificationPermissionState {
  return environment.Notification ? normalizePermission(environment.Notification.permission) : 'unsupported';
}

export async function requestNotificationPermission(environment: NotificationEnvironment = browserEnvironment()): Promise<NotificationPermissionState> {
  const notification = environment.Notification;
  if (!notification) return 'unsupported';
  const current = normalizePermission(notification.permission);
  if (current === 'granted' || current === 'denied') return current;
  try {
    return normalizePermission(await notification.requestPermission());
  } catch {
    return 'default';
  }
}

export async function registerNotificationServiceWorker(environment: NotificationEnvironment = browserEnvironment(), scriptUrl = '/sw.js') {
  const container = environment.navigator?.serviceWorker;
  if (!container || typeof container.register !== 'function') return null;
  try {
    return await container.register(scriptUrl, { updateViaCache: 'none' });
  } catch {
    return null;
  }
}

function parseTime(value: string | null | undefined): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

export function buildNavigationUrl(item: Pick<ReminderItem, 'address' | 'location_name' | 'latitude' | 'longitude'>): string {
  const destination = item.latitude != null && item.longitude != null
    ? `${item.latitude},${item.longitude}`
    : item.address?.trim() || item.location_name?.trim() || '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=transit`;
}

export function getReminderSchedule(item: ReminderItem, tripStartDate: string, leadMinutes = 15): ScheduledReminder | null {
  const dateParts = parseDate(tripStartDate);
  const timeParts = parseTime(item.time ?? item.start_time);
  if (!dateParts || !timeParts || !Number.isFinite(leadMinutes) || leadMinutes < 0) return null;
  const dayNumber = Number.isFinite(item.day_number) && (item.day_number ?? 0) >= 1 ? Math.trunc(item.day_number!) : 1;
  const scheduledAt = new Date(dateParts.year, dateParts.month - 1, dateParts.day + dayNumber - 1, timeParts.hours, timeParts.minutes);
  const title = item.location_name?.trim() || item.title?.trim() || '下一個景點';
  return {
    itemId: item.id,
    title,
    scheduledAt,
    remindAt: new Date(scheduledAt.getTime() - leadMinutes * 60_000),
    navigationUrl: buildNavigationUrl(item),
  };
}

export function getDueReminders(items: readonly ReminderItem[], tripStartDate: string, now = new Date(), leadMinutes = 15, notifiedIds = new Set<string>(), windowMs = 90_000): ScheduledReminder[] {
  const nowMs = now.getTime();
  return items
    .map((item) => getReminderSchedule(item, tripStartDate, leadMinutes))
    .filter((reminder): reminder is ScheduledReminder => Boolean(reminder))
    .filter((reminder) => {
      const elapsed = nowMs - reminder.remindAt.getTime();
      return !notifiedIds.has(reminder.itemId) && elapsed >= 0 && elapsed <= windowMs;
    });
}

export function createReminderScheduler(options: ReminderSchedulerOptions): () => void {
  const notifiedIds = new Set<string>();
  const now = options.now ?? (() => new Date());
  const leadMinutes = options.leadMinutes ?? 15;
  const tick = () => {
    const items = options.getItems?.() ?? options.items;
    for (const reminder of getDueReminders(items, options.tripStartDate, now(), leadMinutes, notifiedIds)) {
      notifiedIds.add(reminder.itemId);
      options.onReminder(reminder);
    }
  };
  tick();
  const timer = setInterval(tick, options.intervalMs ?? 60_000);
  return () => clearInterval(timer);
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export async function showReminderNotification(reminder: ScheduledReminder, environment: NotificationEnvironment = browserEnvironment()): Promise<boolean> {
  const registration = await registerNotificationServiceWorker(environment);
  if (!registration?.showNotification) return false;
  try {
    await registration.showNotification(`⏰ 出發提醒：${reminder.title}`, {
      body: `預計 ${formatTime(reminder.scheduledAt)} 抵達，請提前出發。`,
      tag: `itinerary-reminder-${reminder.itemId}`,
      icon: '/icon.png',
      badge: '/icon.png',
      data: { url: reminder.navigationUrl, itemId: reminder.itemId },
    });
    return true;
  } catch {
    return false;
  }
}
