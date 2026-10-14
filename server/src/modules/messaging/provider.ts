/** Canal de mensagens. Nenhum canal real é assumido: o padrão é o simulador. */
export type ChannelId = 'simulator' | 'whatsapp' | 'manual';

export interface OutboundMessage {
  businessId: string;
  conversationId: string;
  messageId: string;
  channel: ChannelId;
  /** identificador do destinatário no canal (telefone/chatId) */
  to: string;
  content: string;
}

export interface SendResult {
  status: 'simulated' | 'queued' | 'sent' | 'failed';
  externalId?: string;
  error?: string;
}

export interface ChannelStatus {
  channel: ChannelId;
  provider: string;
  configured: boolean;
  connected: boolean;
  /** envio real habilitado (nunca em simulação) */
  sendEnabled: boolean;
  details: Record<string, unknown>;
}

export interface MessagingProvider {
  readonly channel: ChannelId;
  readonly name: string;
  send(message: OutboundMessage): Promise<SendResult>;
  status(): Promise<ChannelStatus>;
}

export class MessagingRegistry {
  private providers = new Map<ChannelId, MessagingProvider>();

  register(p: MessagingProvider): void {
    this.providers.set(p.channel, p);
  }

  get(channel: ChannelId): MessagingProvider | undefined {
    return this.providers.get(channel);
  }

  all(): MessagingProvider[] {
    return [...this.providers.values()];
  }
}
