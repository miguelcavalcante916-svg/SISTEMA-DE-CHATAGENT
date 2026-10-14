import type { FastifyInstance } from 'fastify';
import { isOpenNow, type Business } from '../business/service.js';
import { sendOutbound } from './outbound.js';
import { getConversationRow, parseDraft, saveDraft, setNeedsHuman, type MessageDto, type MessageRow } from './service.js';
import { runAiTurn } from './ai-turn.js';

/**
 * Decide o que acontece após uma mensagem do cliente.
 * Regras determinísticas ficam aqui e em ai-turn.ts; a IA apenas propõe.
 */
export async function runAgent(app: FastifyInstance, business: Business, conversationId: string, inbound: MessageRow): Promise<MessageDto[]> {
  const { db } = app.ctx;
  const conv = getConversationRow(db, business.id, conversationId);

  // Uma pessoa assumiu: nenhuma resposta automática.
  if (conv.mode === 'human') {
    setNeedsHuman(db, conv.id, true, 'Conversa assumida por pessoa: aguardando resposta humana');
    return [];
  }

  const draft = parseDraft(conv.draft_json);
  const aiOn = business.settings.ai.enabled && Boolean(business.dataReviewedAt);

  if (!aiOn) {
    // Modo sem IA: avisa uma única vez e sinaliza para a equipe.
    setNeedsHuman(db, conv.id, true, 'Atendimento manual (IA desativada)');
    if (!draft.greeted) {
      draft.greeted = true;
      saveDraft(db, conv.id, draft);
      const text = isOpenNow(business) ? business.settings.messages.aiUnavailable : business.settings.messages.closed;
      const reply = await sendOutbound(app, { conversation: conv, content: text, senderType: 'system', metadata: { auto: 'ai_off' } });
      return [reply];
    }
    return [];
  }

  return runAiTurn(app, business, conv, draft, inbound);
}
