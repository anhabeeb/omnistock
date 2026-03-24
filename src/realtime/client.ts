
export type RealtimeEvent = {
  type: string;
  entityType: string;
  entityId?: string;
  payload?: any;
  timestamp: string;
};

type MessageCallback = (event: RealtimeEvent) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private statusCallbacks: ((status: 'connected' | 'disconnected' | 'reconnecting') => void)[] = [];
  private callbacks: MessageCallback[] = [];
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private isConnected = false;
  private shouldConnect = false;

  constructor(private url: string) {}

  private setStatus(status: 'connected' | 'disconnected' | 'reconnecting') {
    this.isConnected = status === 'connected';
    this.statusCallbacks.forEach(cb => cb(status));
  }

  onStatusChange(callback: (status: 'connected' | 'disconnected' | 'reconnecting') => void) {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  private heartbeatInterval: number | null = null;

  private startHeartbeat() {
    this.heartbeatInterval = window.setInterval(() => {
      this.ws?.send('ping');
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  connect(token: string) {
    if (this.token && this.token !== token) {
      this.disconnect();
    }
    
    this.token = token;
    this.shouldConnect = true;
    if (this.isConnected) return;

    this.setStatus('reconnecting');
    const wsUrl = `${this.url.replace(/^http/, 'ws')}?token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      if (process.env.NODE_ENV === 'development') console.log('Realtime connected');
      this.setStatus('connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      if (event.data === 'pong') return;
      try {
        const data = JSON.parse(event.data);
        this.callbacks.forEach(cb => cb(data));
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.error('Failed to parse realtime message', e);
      }
    };

    this.ws.onclose = () => {
      this.setStatus('disconnected');
      this.stopHeartbeat();
      if (this.shouldConnect) {
        this.reconnect();
      }
    };

    this.ws.onerror = (error) => {
      if (process.env.NODE_ENV === 'development') console.error('Realtime error', error);
      this.setStatus('disconnected');
      this.stopHeartbeat();
      this.ws?.close();
    };
  }

  private reconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    setTimeout(() => {
      this.reconnectAttempts++;
      if (this.token && this.shouldConnect) this.connect(this.token);
    }, delay);
  }

  disconnect() {
    this.shouldConnect = false;
    this.token = null;
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  onMessage(callback: MessageCallback) {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }
}

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const host = window.location.host;
export const realtimeClient = new RealtimeClient(`${protocol}//${host}/api/realtime/connect`);
