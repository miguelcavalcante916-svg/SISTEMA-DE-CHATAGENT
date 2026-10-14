# Integrações de mensagens

Nenhum canal real é assumido. O sistema funciona com o **simulador** (sem envio) e com **atendimento manual**. Canais externos entram por adaptadores da interface `MessagingProvider` e por um webhook genérico assinado.

## Decisão do proprietário: WhatsApp via open-wa (não oficial)

Por decisão explícita do dono do projeto, a conexão com o WhatsApp usa o **open-wa** ([open-wa/wa-automate-nodejs](https://github.com/open-wa/wa-automate-nodejs)), e não a API oficial da Meta. Esta seção registra o que foi verificado e os riscos, para que a decisão seja tomada com informação.

### O que o open-wa é

- Automatiza o **WhatsApp Web** dentro de um navegador controlado (Puppeteer/Chromium). O número é pareado por QR code como em um computador comum.
- Projeto comunitário, licença **H-DNH 1.1** (Hippocratic + Do Not Harm): fonte disponível, mas com restrições de uso ético; não é uma licença OSI clássica. Leia `LICENSE.md` do pacote antes de usar comercialmente.
- Versão verificada no registry npm em 14/10/2026: `@open-wa/wa-automate` **5.5.1** (linha v5, publicada 12/10/2026). A documentação pública (`docs.openwa.dev`) não pôde ser acessada deste ambiente; as informações abaixo vêm das definições TypeScript do pacote.
- Alguns recursos exigem **chave de licença** paga ("Insiders"). Historicamente, enviar mensagem para números que nunca falaram com você exigia licença; responder a quem escreveu primeiro funciona sem.

### Riscos que você aceita ao usar

1. **Não é autorizado pela Meta.** O próprio projeto diz: "This project is unofficial and is not affiliated with WhatsApp or Meta. Use it at your own risk." Automação do WhatsApp Web viola os termos de serviço do WhatsApp; o número pode ser **bloqueado**, inclusive permanentemente.
2. **Fragilidade.** Qualquer mudança no WhatsApp Web pode parar a ponte até o projeto atualizar.
3. **Peso.** Exige Chromium/Chrome rodando no computador do estabelecimento (memória e CPU).
4. **Sem garantias de entrega** nem de conformidade. Não há SLA.

Mitigações adotadas aqui: número dedicado ao negócio; a ponte roda em **processo separado** (o painel continua funcionando se ela cair); envio real só com `WHATSAPP_SEND_ENABLED=true`; lista opcional de destinatários permitidos para testes; limite de 3 tentativas por mensagem; a ponte só trata conversas individuais (ignora grupos, status e mensagens próprias).

### Arquitetura da ponte

```
WhatsApp Web (Chromium)  <->  integrations/whatsapp-openwa (open-wa)  <->  servidor local (API)
                                   |  POST /api/webhooks/openwa (HMAC)         recebidas
                                   |  GET  /api/bridge/outbox   (token)        fila de envio
                                   |  POST /api/bridge/outbox/:id/ack          confirmação
                                   |  POST /api/bridge/heartbeat               estado
```

- O servidor **nunca** fala com o WhatsApp: ele apenas enfileira mensagens (`outbound_queue`) e recebe webhooks.
- O modo "Easy API" do open-wa v5 (servidor HTTP com `--api-key`) foi avaliado, mas o próprio CLI avisa que o registro de webhooks de mensagens recebidas "is not yet restored" na v5. Por isso a ponte usa o modo embutido (`create()` + `onMessage`).

### Como ativar

1. No servidor (`.env` da raiz):
   ```
   WHATSAPP_PROVIDER=openwa
   WEBHOOK_SECRET=<openssl rand -hex 32>
   BRIDGE_TOKEN=<openssl rand -hex 32>
   WHATSAPP_SEND_ENABLED=false   # mantenha false até terminar os testes
   ```
2. No painel: Configurações › Canais › marque "WhatsApp via ponte open-wa".
3. Instale o utilitário **zstd** no computador (o open-wa exige o binário `zstd` no PATH e recusa iniciar sem ele):
   - Windows: `winget install Facebook.Zstandard` (ou baixe em https://github.com/facebook/zstd/releases e coloque `zstd.exe` no PATH)
   - macOS: `brew install zstd`
   - Linux (Debian/Ubuntu): `sudo apt install zstd`
   Confira com `zstd --version`.
4. Na pasta do repositório:
   ```
   npm run whatsapp:install                       # instala a ponte (≈380 MB com dependências)
   cp integrations/whatsapp-openwa/.env.example integrations/whatsapp-openwa/.env
   # preencha WEBHOOK_SECRET e BRIDGE_TOKEN iguais aos do servidor
   npm run whatsapp:start
   ```
   Escaneie o QR code no terminal com o WhatsApp do número do estabelecimento. A pasta `session-data/` guarda a sessão: **não compartilhe** (contém credenciais do WhatsApp Web).
5. Verifique em Configurações › Canais se aparece "conectado" (heartbeat da ponte).
6. Teste recebendo mensagens de um celular seu. Para testar envio, defina `ALLOWED_RECIPIENTS=<seu número com DDI>` na ponte e `WHATSAPP_SEND_ENABLED=true` no servidor; reinicie os dois.

Se a ponte não encontrar um navegador, aponte `CHROME_PATH` para um Chrome/Chromium instalado. Verificado neste repositório: `npm install` da ponte conclui (351 pacotes) e o pacote exporta `create`, `createClient` e `ev`; sem o binário `zstd` o open-wa falha na importação com "Can not access zstd! Is it installed?".

### O que **não** foi validado neste repositório

- A ponte foi escrita contra as definições TypeScript do open-wa 5.5.1, mas **não foi executada contra um WhatsApp real** (este ambiente não tem conta WhatsApp nem acesso ao WhatsApp Web). Espere ajustes nos nomes de campos do objeto `message` (`from`, `body`, `type`, `t`, `sender.pushname`) na primeira execução.
- Eventos de entrega (ack) não são repassados; a mensagem fica "enviada" quando o `sendText` retorna.

## Alternativas oficiais (documentadas, não implementadas)

| Opção | Requisitos | Custo | Limitações |
|------|------------|-------|-----------|
| **WhatsApp Business Platform (Cloud API, Meta)** | Conta Meta Business, verificação da empresa para sair do modo de teste, número dedicado (não pode estar no app comum), token de sistema, webhook HTTPS público com `X-Hub-Signature-256` | Desde 01/07/2025 a Meta cobra **por mensagem de template entregue**, variando por categoria e país; mensagens livres são gratuitas apenas dentro da janela de atendimento de 24 h (verificado em fontes de 2026; confirme na tabela oficial de preços da Meta) | Exige endereço HTTPS público (túnel ou servidor), aprovação de templates, cadastro mais burocrático |
| **BSPs (Twilio, Zenvia, Gupshup, 360dialog, Infobip…)** | Conta no provedor; eles intermediam a Cloud API | Taxa do provedor + tarifa Meta | Mesmas regras de template/janela |
| **Telegram Bot API** | Criar bot no @BotFather | Gratuito | Clientes precisam usar Telegram |

Para integrar qualquer uma delas, implemente `MessagingProvider` (ver `server/src/modules/messaging/provider.ts`) e um tradutor do webhook do provedor para o envelope genérico em `server/src/modules/messaging/webhooks.ts`.

## Contrato do webhook genérico

```
POST /api/webhooks/:provider        (provider = openwa | simulator)
X-Webhook-Timestamp: <unix seconds>
X-Webhook-Signature: sha256=HMAC_SHA256(WEBHOOK_SECRET, "<timestamp>.<corpo bruto>")

{ "event_id": "...", "type": "message.received" | "message.status" | "connection.state",
  "channel": "whatsapp", "from": { "id": "5511...@c.us", "phone": "5511...", "name": "..." },
  "message": { "id": "...", "text": "...", "type": "chat", "timestamp": 1700000000 } }
```

Proteções: assinatura obrigatória (constante no tempo), janela de `WEBHOOK_MAX_AGE_SECONDS`, idempotência por `(provider, event_id)` em `webhook_events`, deduplicação por `message.id`, log sem segredos.
