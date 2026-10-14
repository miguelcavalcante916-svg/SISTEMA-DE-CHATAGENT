# Testes automatizados e resultados

Execução de referência em 14/10/2026 (ambiente de desenvolvimento, Node 22.22, SQLite em memória).

## Como rodar

```bash
npm test              # servidor + web
npm run typecheck     # TypeScript nos dois pacotes
npm run build         # build de produção (servidor + painel)
```

## Servidor (vitest) — 72 testes, 10 arquivos, todos aprovados

Mapeamento para os critérios do prompt:

| Critério | Arquivo |
|---------|---------|
| 1. Cálculo de subtotal, adicionais, taxa, desconto e total | `orders/orders.test.ts` |
| 2. Preço no servidor e rejeição de valor adulterado | `orders/orders.test.ts` |
| 3. Retirada sem endereço e entrega com validação | `orders/orders.test.ts` |
| 4. Confirmação obrigatória antes de finalizar pedido pela conversa | `ai/ai.test.ts`, `conversations/conversations.test.ts` |
| 5. Transições válidas e inválidas de status | `orders/orders.test.ts` |
| 6. Separação entre status do pedido e do pagamento | `orders/orders.test.ts` |
| 7. QR Pix desabilitado ou pendente sem configuração válida | `payments/pix.test.ts` |
| 8. Comprovante, campos opcionais e reimpressão identificada | `printing/printing.test.ts` |
| 9. Resposta segura com Ollama indisponível/malformado | `ai/ai.test.ts` |
| 10. Transferência para humano e bloqueio de respostas automáticas | `ai/ai.test.ts`, `conversations/conversations.test.ts` |
| 11. Isolamento dos dados do estabelecimento | `orders/orders.test.ts` |
| 12. Autenticação e permissões | `auth/auth.test.ts`, demais arquivos (403 para atendente) |
| Extras: webhooks assinados, fila da ponte, backup, retenção, seed | `messaging/webhooks.test.ts`, `backup/backup.test.ts`, `business/business.test.ts`, `catalog/catalog.test.ts` |

Saída resumida da execução:

```
 ✓ src/modules/auth/auth.test.ts > senhas > gera hash scrypt verificável e rejeita senha errada
 ✓ src/modules/auth/auth.test.ts > senhas > aplica política mínima
 ✓ src/modules/auth/auth.test.ts > autenticação e permissões > exige setup inicial uma única vez e bloqueia repetição
 ✓ src/modules/auth/auth.test.ts > autenticação e permissões > rejeita senha fraca no setup
 ✓ src/modules/ai/ai.test.ts > regras determinísticas > reconhece confirmações e negativas em português
 ✓ src/modules/orders/orders.test.ts > cálculo de pedido no servidor > 1. calcula subtotal, adicionais (soma e maior valor), taxa, desconto, total e troco
 ✓ src/modules/ai/ai.test.ts > 9. respostas seguras quando a IA falha > Ollama indisponível: resposta segura, transferência e registro para revisão; nenhum pedido criado
 ✓ src/modules/orders/orders.test.ts > cálculo de pedido no servidor > 2. ignora preços/totais enviados pelo cliente e usa o catálogo
 ✓ src/modules/ai/ai.test.ts > 9. respostas seguras quando a IA falha > conteúdo malformado é tratado como texto não validado: não cria pedido nem repassa o texto
 ✓ src/modules/orders/orders.test.ts > cálculo de pedido no servidor > rejeita produto indisponível, variante ausente e adicional fora dos limites
 ✓ src/modules/auth/auth.test.ts > autenticação e permissões > bloqueia rotas sem sessão e distingue admin de atendente
 ✓ src/modules/ai/ai.test.ts > 9. respostas seguras quando a IA falha > confiança baixa ou pedido de humano transfere e evita respostas automáticas seguintes
 ✓ src/modules/orders/orders.test.ts > cálculo de pedido no servidor > exige confirmação explícita do cliente
 ✓ src/modules/ai/ai.test.ts > 9. respostas seguras quando a IA falha > palavra-chave de transferência é tratada sem chamar a IA
 ✓ src/modules/orders/orders.test.ts > modalidades e endereço > 3. retirada sem endereço é aceita; entrega exige endereço e bairro atendido
 ✓ src/modules/orders/orders.test.ts > modalidades e endereço > modalidade desabilitada é recusada
 ✓ src/modules/orders/orders.test.ts > 5. transições de status > máquina de estados pura
 ✓ src/modules/ai/ai.test.ts > 4. confirmação obrigatória antes de criar pedido pela conversa > fluxo completo: proposta -> resumo oficial -> "sim" cria pedido com preço do catálogo
 ✓ src/modules/ai/ai.test.ts > 4. confirmação obrigatória antes de criar pedido pela conversa > itens inventados pela IA são ignorados e entrega exige endereço/bairro atendido
 ✓ src/modules/orders/orders.test.ts > 5. transições de status > via API: fluxo válido, inválido e histórico com responsável
 ✓ src/modules/ai/ai.test.ts > 4. confirmação obrigatória antes de criar pedido pela conversa > 10. conversa assumida por pessoa nunca chama a IA
 ✓ src/modules/ai/ai.test.ts > 4. confirmação obrigatória antes de criar pedido pela conversa > pergunta sem resposta vira sugestão para revisão humana
 ✓ src/modules/orders/orders.test.ts > 5. transições de status > cancelado não volta para preparo
 ✓ src/modules/ai/ai.test.ts > adaptador Ollama > envia JSON Schema em format e valida resposta estruturada
 ✓ src/modules/auth/auth.test.ts > autenticação e permissões > login inválido, limite de tentativas e logout
 ✓ src/modules/orders/orders.test.ts > 6. status do pedido e do pagamento são independentes > pedido concluído pode seguir com pagamento pendente; "pago" registra quem confirmou
 ✓ src/modules/orders/orders.test.ts > 6. status do pedido e do pagamento são independentes > pedido Pix nasce "aguardando_pix" só com Pix configurado e válido
 ✓ src/modules/ai/ai.test.ts > adaptador Ollama > JSON inválido vira texto não validado; erro de rede e timeout viram indisponível
 ✓ src/modules/auth/auth.test.ts > autenticação e permissões > troca de senha exige senha atual e invalida outras sessões
 ✓ src/modules/auth/auth.test.ts > autenticação e permissões > não permite remover o último administrador
 ✓ src/modules/orders/orders.test.ts > 11. isolamento de dados por estabelecimento > usuário de outro estabelecimento não vê pedidos nem catálogo
 ✓ src/modules/ai/ai.test.ts > adaptador Ollama > diagnóstico lista modelos e detecta modelo ausente
 ✓ src/modules/orders/orders.test.ts > listagem, busca e edição > lista ativos, busca por número/nome/telefone e edita itens recalculando
 ✓ src/modules/ai/ai.test.ts > adaptador Ollama > status via API usa configurações do painel
 ✓ src/modules/auth/auth.test.ts > autenticação e permissões > bloqueia requisição mutável de origem diferente (CSRF)
 ✓ src/modules/auth/auth.test.ts > autenticação e permissões > registra auditoria de login e setup
 ✓ src/modules/printing/printing.test.ts > 8. comprovante interno > contém todos os dados do pedido, respeita a largura e não se apresenta como nota fiscal
 ✓ src/modules/conversations/conversations.test.ts > conversas em modo sem IA (atendimento manual) > cria conversa pelo simulador, responde uma vez e sinaliza para a equipe
 ✓ src/modules/business/business.test.ts > horário de funcionamento > respeita períodos, virada de meia-noite e dias fechados
 ✓ src/modules/printing/printing.test.ts > 8. comprovante interno > omite campos opcionais (retirada sem endereço, sem troco, sem desconto)
 ✓ src/modules/business/business.test.ts > configuração do estabelecimento > atendente vê chave Pix mascarada; admin vê completa
 ✓ src/modules/printing/printing.test.ts > 8. comprovante interno > reimpressão é identificada com usuário, data e hora
 ✓ src/modules/printing/printing.test.ts > 8. comprovante interno > quebra palavras longas e preserva acentos e valores monetários
 ✓ src/modules/conversations/conversations.test.ts > conversas em modo sem IA (atendimento manual) > 10. resposta humana assume a conversa, registra quem assumiu e devolve à IA
 ✓ src/modules/business/business.test.ts > configuração do estabelecimento > aplica perfil de categoria criando modelos sem preços reais
 ✓ src/modules/business/business.test.ts > configuração do estabelecimento > não habilita IA antes da revisão de dados; revisão exige itens obrigatórios
 ✓ src/modules/business/business.test.ts > configuração do estabelecimento > CRUD de bairros/áreas de entrega
 ✓ src/modules/printing/printing.test.ts > ESC/POS > codifica acentos em CP1252 e remove em ASCII
 ✓ src/modules/conversations/conversations.test.ts > conversas em modo sem IA (atendimento manual) > cria pedido a partir da conversa somente com confirmação do cliente e avisa o número
 ✓ src/modules/conversations/conversations.test.ts > conversas em modo sem IA (atendimento manual) > notifica status ao cliente só quando habilitado e por mudança explícita
 ✓ src/modules/conversations/conversations.test.ts > conversas em modo sem IA (atendimento manual) > conversa manual criada pelo painel e sugestão de conhecimento com dados pessoais mascarados
 ✓ src/modules/printing/printing.test.ts > ESC/POS > gera inicialização, tabela de caracteres, corte e envia por TCP
 ✓ src/modules/printing/printing.test.ts > ESC/POS > falha com mensagem clara quando a impressora de rede não responde
 ✓ src/modules/conversations/conversations.test.ts > conhecimento aprovado > fila de sugestões: aprovar vira conhecimento ativo; rejeitar não; atendente não aprova
 ✓ src/modules/messaging/webhooks.test.ts > assinatura HMAC > valida assinatura, janela de tempo e segredo ausente
 ✓ src/modules/payments/pix.test.ts > BR Code Pix > CRC-16/CCITT-FALSE confere com vetores conhecidos
 ✓ src/modules/payments/pix.test.ts > BR Code Pix > reproduz o exemplo do Manual de Padrões para Iniciação do Pix (BCB)
 ✓ src/modules/payments/pix.test.ts > BR Code Pix > inclui valor, txid e remove acentos; campos respeitam limites
 ✓ src/modules/payments/pix.test.ts > BR Code Pix > valida tipos de chave
 ✓ src/modules/messaging/webhooks.test.ts > webhook de mensagens > rejeita sem assinatura, com assinatura errada e com timestamp antigo
 ✓ src/modules/messaging/webhooks.test.ts > webhook de mensagens > aceita evento válido, ignora repetição (idempotência) e mensagem duplicada
 ✓ src/modules/messaging/webhooks.test.ts > webhook de mensagens > canal WhatsApp desabilitado no estabelecimento: evento aceito mas ignorado
 ✓ src/modules/payments/pix.test.ts > 7. QR Pix por pedido > fica desabilitado sem configuração válida e claramente pendente com configuração
 ✓ src/modules/messaging/webhooks.test.ts > webhook de mensagens > webhook desabilitado quando não há segredo
 ✓ src/modules/messaging/webhooks.test.ts > ponte WhatsApp (fila de saída) > sem provedor configurado, resposta humana em conversa WhatsApp falha de forma visível
 ✓ src/modules/backup/backup.test.ts > backup e retenção > cria backup verificado, lista, baixa e apaga; atendente não acessa
 ✓ src/modules/messaging/webhooks.test.ts > ponte WhatsApp (fila de saída) > com open-wa habilitado e envio bloqueado, nada vai para a fila; com envio liberado, a ponte busca e confirma
 ✓ src/modules/backup/backup.test.ts > backup e retenção > retenção apaga conversas antigas, anonimiza pedidos e remoção a pedido funciona
 ✓ src/modules/backup/backup.test.ts > backup e retenção > seed de demonstração cria dados fictícios e recusa banco com usuários
 ✓ src/modules/catalog/catalog.test.ts > catálogo > valida preço negativo, nome obrigatório e consistência de adicionais
 ✓ src/modules/catalog/catalog.test.ts > catálogo > cria, arquiva e marca indisponível; atendente só altera disponibilidade
 ✓ src/modules/catalog/catalog.test.ts > catálogo > combo com componentes e variantes atualizadas sem perder histórico
 Test Files  10 passed (10)
      Tests  72 passed (72)
```

## Web

- `npm run typecheck -w web`: sem erros.
- `npm run build -w web`: build de produção concluído (≈445 kB JS, 11 kB CSS antes de gzip).
- `vitest` (web): 2 testes de formatação aprovados.

## Teste de ponta a ponta no navegador (fora do repositório)

Um roteiro Playwright executado contra o build de produção (`node dist/index.js` servindo `web/dist`) percorreu: configuração inicial em 9 etapas, aplicação de perfil, horários, bairros/taxas, cadastro de produto com variante, criação de pedido manual com cálculo, avanço de status e marcação de pagamento, quadro/lista de pedidos, simulador e conversa com assunção humana, telas de impressora, conhecimento, usuários, backup, auditoria e IA, logout e login. Nenhum erro de runtime no console. O roteiro não foi incluído no repositório porque depende de um Chromium pré-instalado no ambiente de desenvolvimento.

## Não testado (sem acesso neste ambiente)

- Ollama real (adaptador testado com respostas simuladas e `fetch` falso).
- WhatsApp real via open-wa (ponte escrita contra as definições de tipos; webhook e fila testados com assinaturas reais).
- Impressora térmica física (ESC/POS validado com servidor TCP local).
