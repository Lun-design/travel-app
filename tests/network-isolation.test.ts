import { describe, expect, it } from 'vitest';

describe('test network isolation', () => {
  it('blocks an unmocked external fetch before it reaches the network', async () => {
    await expect(fetch('https://api.open-meteo.com/v1/forecast')).rejects.toThrow(
      '[Test Network Guard] 未 Mock 的外部網路請求已封鎖',
    );
  });
});
