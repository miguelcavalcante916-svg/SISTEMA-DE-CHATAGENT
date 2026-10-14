import type { ChannelStatus, MessagingProvider, OutboundMessage, SendResult } from './provider.js';

export class SimulatorProvider implements MessagingProvider {
  readonly channel = 'simulator' as const;
  readonly name = 'Simulador de canal';
  async send(_message: OutboundMessage): Promise<SendResult> {
    return { status: 'simulated' };
  }
  async status(): Promise<ChannelStatus> {
    return { channel: 'simulator', provider: this.name, configured: true, connected: true, sendEnabled: false, details: {} };
  }
}
