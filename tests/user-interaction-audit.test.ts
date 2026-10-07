import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('user-visible async button failures', () => {
  it('does not silently swallow failed map navigation from the timeline or today card', () => {
    const timeline = source('src/components/ItineraryTimeline.shared.tsx');
    const today = source('src/components/TodayFocusCard.tsx');

    expect(timeline).not.toContain('.catch(() => undefined)');
    expect(today).not.toContain('.catch(() => undefined)');
    expect(timeline).toContain('無法開啟導航');
    expect(today).toContain('無法開啟導航');
  });

  it('shows feedback when copying an invite code fails', () => {
    const invite = source('src/components/InviteTripModal.tsx');
    expect(invite).toMatch(/clipboard\.writeText\(inviteCode\)[\s\S]*catch/);
    expect(invite).toContain('複製失敗');
  });

  it('handles native in-app browser launch failures from external links', () => {
    const externalLink = source('src/components/external-link.tsx');
    expect(externalLink).toMatch(/openBrowserAsync\(href[\s\S]*catch/);
    expect(externalLink).toContain('無法開啟連結');
  });
});
