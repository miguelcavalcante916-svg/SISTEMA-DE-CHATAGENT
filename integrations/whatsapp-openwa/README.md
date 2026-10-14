# Ponte WhatsApp (open-wa)

Conecta um número de WhatsApp ao sistema local usando o [open-wa](https://github.com/open-wa/wa-automate-nodejs) (`@open-wa/wa-automate` v5). Processo separado do servidor: se cair, o painel continua funcionando.

**Aviso**: o open-wa automatiza o WhatsApp Web e não é autorizado pela Meta. Risco de bloqueio do número. Use um número dedicado.

## Pré-requisitos

- Node.js 22.12+
- Chrome ou Chromium instalado (ou deixe o open-wa baixar um)
- Utilitário `zstd` no PATH (`winget install Facebook.Zstandard`, `brew install zstd` ou `sudo apt install zstd`)
- Servidor do sistema em execução com `WHATSAPP_PROVIDER=openwa`, `WEBHOOK_SECRET` e `BRIDGE_TOKEN` definidos

## Uso

```bash
# na raiz do repositório
npm run whatsapp:setup     # cria os dois .env com os mesmos segredos e confere pré-requisitos
npm run whatsapp:install
npm run whatsapp:start     # com o servidor já rodando (npm run dev) em outro terminal
```

Prefere fazer à mão? Copie `.env.example` para `.env` e preencha `SERVER_URL`, `WEBHOOK_SECRET` e `BRIDGE_TOKEN` com os mesmos valores do `.env` da raiz.

Escaneie o QR code mostrado no terminal com o WhatsApp do estabelecimento. A pasta `session-data/` guarda a sessão (não compartilhe).

## Segurança operacional

- O envio real só acontece quando o servidor está com `WHATSAPP_SEND_ENABLED=true`.
- `ALLOWED_RECIPIENTS` limita os destinatários durante testes.
- Só conversas individuais são repassadas (grupos, status e mensagens próprias são ignorados).
- Toda mensagem recebida é enviada ao servidor com assinatura HMAC; a fila de saída usa o token da ponte.

## Por que CommonJS e um shim

O open-wa 5.5.1 falha no Node 22 ao importar `eventemitter2` pela build ESM. Por isso a ponte é `index.cjs` e o `package.json` aponta `eventemitter2` para `shims/eventemitter2` (reexportação com entradas ESM e CommonJS), aplicado também aos pacotes do open-wa via `overrides`. Se uma versão futura do open-wa corrigir isso, basta remover a dependência e o `overrides`.

Ao iniciar, o open-wa baixa patches de `https://cdn.openwa.dev` (necessário para acompanhar o WhatsApp Web). Em Linux como root, `--no-sandbox` é adicionado ao Chromium automaticamente; use `CHROMIUM_ARGS` para outros ajustes.

## Fluxo

```
WhatsApp Web -> open-wa -> POST /api/webhooks/openwa   (mensagens recebidas)
servidor -> fila -> GET /api/bridge/outbox -> sendText -> POST /api/bridge/outbox/:id/ack
heartbeat: POST /api/bridge/heartbeat a cada 30 s (estado da conexão no painel)
```
