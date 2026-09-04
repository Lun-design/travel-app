import type { RealtimeClientOptions } from '@supabase/realtime-js';

type WebSocketConstructor = NonNullable<RealtimeClientOptions['transport']>;

/**
 * Minimal WebSocket-compatible transport used while Metro evaluates the app
 * in Node.js. Realtime connections are only opened by the client at runtime;
 * using this inert transport keeps REST/Auth pages renderable during SSR.
 */
export class NoopWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = NoopWebSocket.CONNECTING;
  readonly OPEN = NoopWebSocket.OPEN;
  readonly CLOSING = NoopWebSocket.CLOSING;
  readonly CLOSED = NoopWebSocket.CLOSED;
  readonly url: string;
  readonly protocol = '';
  readonly extensions = '';
  readonly bufferedAmount = 0;
  readonly binaryType = 'arraybuffer';
  readyState = NoopWebSocket.CLOSED;
  onopen: ((this: any, event: Event) => any) | null = null;
  onmessage: ((this: any, event: MessageEvent) => any) | null = null;
  onclose: ((this: any, event: CloseEvent) => any) | null = null;
  onerror: ((this: any, event: Event) => any) | null = null;

  constructor(address: string | URL) {
    this.url = String(address);
  }

  close(): void {
    this.readyState = NoopWebSocket.CLOSED;
  }

  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    // Realtime is not connected while the app is evaluated by Metro.
  }

  addEventListener(_type: string, _listener: EventListener): void {
    // Intentionally inert; no connection is opened in this environment.
  }

  removeEventListener(_type: string, _listener: EventListener): void {
    // Intentionally inert; no connection is opened in this environment.
  }
}

type RuntimeWithWebSocket = {
  WebSocket?: WebSocketConstructor;
};

/** Select native WebSocket where available and a safe fallback otherwise. */
export function getRealtimeOptions(
  runtime: RuntimeWithWebSocket = globalThis as RuntimeWithWebSocket,
): Pick<RealtimeClientOptions, 'transport'> {
  return { transport: runtime.WebSocket ?? (NoopWebSocket as WebSocketConstructor) };
}
