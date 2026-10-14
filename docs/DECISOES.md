# Decisões técnicas assumidas

| Tema | Decisão | Justificativa |
|------|---------|---------------|
| Linguagem | TypeScript em todo o projeto | Pedido no prompt; tipagem reduz erros em regras de negócio |
| Backend | Node.js 22 + Fastify 5 | Leve, validação/erros simples, logger (pino) embutido com redação de campos sensíveis |
| Frontend | React 19 + Vite 6 + React Router 7 + TanStack Query | Stack sugerida; Query resolve estados de carregamento/erro e atualização periódica do painel sem código extra |
| Banco | SQLite via `better-sqlite3` | Arquivo local, zero administração, transações síncronas simples. O `node:sqlite` embutido ainda emite aviso de experimental no Node 22, por isso foi descartado |
| ORM | **Nenhum** (SQL parametrizado + migrações `.sql` versionadas) | Diferente da sugestão "ORM leve". Motivo: menos dependências e nenhuma geração de código; o esquema é simples e SQLite recompensa SQL direto. Toda consulta é parametrizada; tipos de linha são declarados em TypeScript junto aos repositórios |
| Validação | Zod 4 em todas as entradas da API | Rejeita payload inválido antes de tocar o domínio |
| Autenticação | Sessão em cookie `httpOnly` + tabela `sessions`; senha com `scrypt` do Node | Sem dependência nativa para hash, sem JWT desnecessário em app local. Verificação de `Origin` em métodos mutáveis e `SameSite=Lax` contra CSRF |
| Papéis | `admin` e `atendente` | Admin configura estabelecimento, catálogo, Pix, usuários; atendente opera pedidos e conversas |
| Datas | ISO 8601 em UTC no banco; exibição no fuso do estabelecimento (`Intl`) | Consistência; sem biblioteca de datas |
| Dinheiro | Inteiros em centavos | Evita erro de ponto flutuante |
| Identificadores | UUID v4 interno + número sequencial legível por estabelecimento | Pedido do prompt |
| `business_id` | Presente em todas as tabelas centrais; sessão carrega o `business_id` do usuário e todas as consultas filtram por ele | Preparado para multiempresa sem implementar multi-tenant distribuído |
| Atualização do painel | Polling a cada poucos segundos via TanStack Query | Mais simples e robusto que WebSocket/SSE para um computador de balcão |
| IA | Interface `AIProvider`; adaptador Ollama (`/api/chat`, `stream:false`, `format` com JSON Schema), provedor simulado para testes | Ollama local é opcional; sistema funciona em modo manual |
| Regras do agente | Backend decide: preço, disponibilidade, modalidade, endereço, pagamento e confirmação. A IA só propõe | Pedido do prompt; evita "alucinação" virar pedido |
| Confirmação | Pedido vindo de conversa só é criado após resumo apresentado **e** resposta afirmativa explícita do cliente (regra determinística, independente da IA) | Critério de aceite 4 |
| Mensageria | Interface `MessagingProvider`; `SimulatorProvider` padrão; webhook genérico com HMAC-SHA256, idempotência e janela de tempo | Nenhum canal real é assumido |
| Impressão | `PrinterProvider`: `browser` (padrão, layout 80/58 mm) e `escpos_network` (TCP 9100, opcional, codificação configurável) | Impressão pelo navegador funciona sem driver; ESC/POS fica atrás de configuração explícita |
| Pix | Payload BR Code estático (EMV/MPM) gerado internamente com CRC16-CCITT, testado contra o exemplo do manual do BCB; QR renderizado com a biblioteca `qrcode` (MIT) | Sem integração bancária não há conciliação: status fica "aguardando confirmação" até ação humana |
| Backup | `VACUUM INTO` + `PRAGMA integrity_check` + contagem de tabelas | Backup consistente sem parar o servidor |
| Logs | pino com `redact` para cookies/autorização; nunca registrar chave Pix completa, senha ou token | Pedido do prompt |
| Dados de demonstração | Script separado (`npm run seed:demo`) com nomes claramente fictícios e marcação `is_demo` | Nunca executado automaticamente |
