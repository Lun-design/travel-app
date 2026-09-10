export type ShareTextOptions = {
  webShare?: (data: { title?: string; text: string }) => Promise<unknown>;
  clipboardWrite?: (text: string) => Promise<unknown>;
  nativeShare?: (text: string) => Promise<unknown>;
};

export type ShareTextResult = 'shared' | 'copied';

/** Prefer native sharing, then clipboard, while keeping platform APIs injectable for tests. */
export async function shareOrCopyText(text: string, options: ShareTextOptions, title = '行程分享'): Promise<ShareTextResult> {
  if (options.webShare) {
    await options.webShare({ title, text });
    return 'shared';
  }
  if (options.clipboardWrite) {
    await options.clipboardWrite(text);
    return 'copied';
  }
  if (options.nativeShare) {
    await options.nativeShare(text);
    return 'shared';
  }
  throw new Error('此裝置不支援分享或複製功能。');
}
