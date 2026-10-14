# Sistema local de atendimento e pedidos para comércios alimentícios

Painel local para pizzarias, hamburguerias, açaíterias, sorveterias, churrascarias e bares: cadastro do estabelecimento e do cardápio, atendimento por conversa (simulado, manual ou WhatsApp via ponte), pedidos com cálculo no servidor, comprovante térmico, QR Pix estático, agente de IA opcional com Ollama local, backup e retenção de dados. Tudo roda no computador do estabelecimento; nada é sincronizado com a nuvem.

> Leia também: [docs/PLANO.md](docs/PLANO.md), [docs/DECISOES.md](docs/DECISOES.md), [docs/INTEGRACOES.md](docs/INTEGRACOES.md), [docs/IMPRESSAO.md](docs/IMPRESSAO.md), [docs/PIX.md](docs/PIX.md), [docs/OLLAMA.md](docs/OLLAMA.md), [docs/BACKUP.md](docs/BACKUP.md), [docs/SEGURANCA.md](docs/SEGURANCA.md), [docs/LIMITACOES.md](docs/LIMITACOES.md).

## Pré-requisitos

- **Node.js 22.12 ou superior** (https://nodejs.org) e npm 10+.
- Windows, macOS ou Linux. Um monitor; impressora térmica opcional; Ollama opcional.
- Para o WhatsApp via open-wa: Chrome/Chromium e um número dedicado (veja riscos em `docs/INTEGRACOES.md`).

## Instalação

```bash
git clone <este repositório>
cd SISTEMA-DE-CHATAGENT
npm install
cp .env.example .env     # ajuste se necessário; nenhum valor é segredo
```

## Execução

### Desenvolvimento (recarga automática)

```bash
npm run dev
```

- API: http://127.0.0.1:3333
- Painel: http://127.0.0.1:5173 (o Vite encaminha `/api` para o servidor)

### Produção local (um único processo)

```bash
npm run build
npm start
```

Abra http://127.0.0.1:3333. O servidor serve o painel compilado e aplica migrações automaticamente ao iniciar. Para iniciar junto com o Windows, crie uma tarefa agendada que execute `npm start` nesta pasta (ou use `pm2`).

### Primeiro acesso

1. Acesse o painel: será exibida a **configuração inicial** (nome, categoria, fuso, conta do administrador).
2. Siga o assistente: perfil da categoria (apenas modelos, sem preços), horários, modalidades e bairros com taxa, pagamentos e Pix, impressora, mensagens e aviso de privacidade, canais.
3. Cadastre o **Catálogo** real (categorias, produtos, variantes, grupos de adicionais, combos).
4. Em Configurações › **Revisão de dados**, confira o checklist e marque como concluída. Só então o atendimento automático pode ser ligado.

### Dados de demonstração (fictícios)

```bash
npm run seed:demo
```

Cria "Pizzaria Exemplo (DEMO)" com produtos marcados como DEMO e dois usuários (`admin` e `atendente`) com senhas aleatórias impressas no terminal. Só funciona em banco vazio. **Nunca use esses dados como reais.**

## Como testar o fluxo completo de pedido

1. Painel › **Simulador**: escreva como cliente ("Oi, tem pizza grande?"). Com a IA desligada, o sistema responde uma mensagem padrão e marca a conversa para a equipe.
2. Painel › **Conversas**: abra a conversa, clique em **Assumir**, responda; use **Criar pedido** para montar o pedido com os itens do catálogo. Marque "o cliente confirmou" e crie.
3. Painel › **Pedidos**: o pedido aparece no quadro em "Recebido" (com destaque e som opcional). Avance: Confirmado → Em preparo → Pronto → (Saiu para entrega) → Concluído. Status do pagamento é separado: "Marcar como pago" registra quem conferiu.
4. No pedido: **Imprimir comprovante** (abre o layout 80/58 mm; a segunda impressão sai como REIMPRESSÃO com usuário e hora). Se a forma for Pix e o Pix estiver configurado, o QR aparece com o aviso "aguardando confirmação".
5. Com a IA ligada (Ollama), repita o passo 1: o agente anota itens, o servidor calcula e apresenta o resumo oficial; o pedido só é criado quando o cliente responde "sim".

## Ollama (IA opcional)

Instale o Ollama, rode `ollama pull qwen2.5:7b`, confira `OLLAMA_BASE_URL`/`OLLAMA_MODEL` no `.env` (ou no painel), conclua a revisão de dados e ligue "Atendimento automático" em Configurações › Agente de IA. A mesma tela mostra o diagnóstico (Ollama acessível, modelo instalado) e um teste. Detalhes e limitações: `docs/OLLAMA.md`. Sem Ollama o sistema funciona em modo manual.

## Modo simulado

O **Simulador** e as **conversas manuais** nunca enviam mensagens reais. O canal WhatsApp fica desligado até você configurar a ponte e habilitar explicitamente o envio (`WHATSAPP_SEND_ENABLED=true`).

## Impressão

Padrão: impressão pelo navegador (qualquer impressora instalada no sistema, papel 80 ou 58 mm). Opcional: ESC/POS por rede (TCP 9100). Botão de teste na tela **Impressora**. O comprovante é interno e não é documento fiscal. Detalhes e limitações de hardware: `docs/IMPRESSAO.md`.

## Pix

Cadastre chave, recebedor e cidade em Configurações › Pagamentos e Pix e clique em "Verificar". O QR é estático: **não confirma pagamento**; o pedido fica "aguardando confirmação" até alguém marcar como pago. Detalhes: `docs/PIX.md`.

## WhatsApp (open-wa, não oficial)

Por decisão do proprietário, o WhatsApp é conectado pela ponte `integrations/whatsapp-openwa` (open-wa). Isso **não é autorizado pela Meta** e pode levar ao bloqueio do número. Passo a passo, riscos e alternativas oficiais: `docs/INTEGRACOES.md`.

## Backup e restauração

Usuários e segurança › Backup, ou `npm run backup`. Verificação de integridade automática; instruções de restauração em `docs/BACKUP.md`.

## Testes

```bash
npm test            # servidor (vitest) + web (vitest, sem testes de UI além da compilação)
npm run typecheck   # TypeScript nos dois pacotes
```

Resultados detalhados em `docs/TESTES.md`. Cobertura do servidor (72 testes): cálculo de pedidos e rejeição de valores do cliente, retirada sem endereço e entrega com validação, confirmação obrigatória pela conversa, transições de status, separação pedido/pagamento, QR Pix desabilitado/pendente e vetor oficial do BCB, comprovante e reimpressão, Ollama indisponível/malformado, transferência para humano, isolamento por estabelecimento, autenticação e permissões, webhooks assinados, backup e retenção.

## Estrutura

```
server/   Fastify + TypeScript + SQLite (better-sqlite3), migrações em src/db/migrations
  src/modules/{auth,business,catalog,orders,conversations,knowledge,ai,payments,printing,messaging,audit,backup,retention}
web/      React + Vite (painel em português)
integrations/whatsapp-openwa/   ponte WhatsApp (instalação separada)
docs/     plano, decisões, integrações, impressão, Pix, Ollama, backup, segurança, limitações
```

## Variáveis de ambiente

Veja `.env.example`. Principais: `HOST`, `PORT`, `DATABASE_PATH`, `BACKUP_DIR`, `SESSION_COOKIE_SECURE`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `AI_TIMEOUT_MS`, `WEBHOOK_SECRET`, `WHATSAPP_PROVIDER`, `BRIDGE_TOKEN`, `WHATSAPP_SEND_ENABLED`.

## Limitações e integrações pendentes

Resumo em `docs/LIMITACOES.md`: WhatsApp e Ollama não foram exercitados contra serviços reais neste ambiente; impressora ESC/POS não testada com hardware; sem Pix dinâmico/conciliação; sem emissão fiscal; um estabelecimento por instalação.
