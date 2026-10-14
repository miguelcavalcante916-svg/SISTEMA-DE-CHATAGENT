# Plano de implementação (MVP)

Sistema local de atendimento e pedidos para comércios alimentícios: um estabelecimento por instalação, painel no navegador, banco SQLite no próprio computador, IA opcional via Ollama local e integrações externas sempre atrás de interfaces com modo simulado.

## Estado inicial do repositório

Repositório vazio (apenas `README.md` com o título). Não havia código, documentação ou ferramentas a preservar.

## Fases (ordem obrigatória do prompt)

| Fase | Entrega | Validação |
|------|---------|-----------|
| A — Base | Monorepo (npm workspaces), servidor Fastify + TypeScript, SQLite com migrações versionadas, configuração por `.env`, autenticação local (setup do administrador, login, sessão, troca de senha, papéis), trilha de auditoria, testes básicos | `npm test` no servidor, `npm run typecheck` |
| B — Operação | Estabelecimento e regras (horários, modalidades, bairros/taxas, pagamentos), perfis por categoria, catálogo (categorias, produtos, variantes, grupos de adicionais, combos, disponibilidade), motor de cálculo no servidor, pedidos com máquina de estados e histórico, painel de pedidos e criação manual | Testes de cálculo, transições, isolamento; painel navegável |
| C — Comprovante | Modelo de comprovante, layout imprimível 80/58 mm pelo navegador, reimpressão identificada, `PrinterProvider` com adaptador ESC/POS por rede (desabilitado por padrão), botão de teste | Testes de quebra de linha, acentos, valores, campos opcionais |
| D — Conversas | `MessagingProvider`, simulador de canal, inbox no painel, assumir/devolver atendimento, registro de mensagens, estrutura de webhook (assinatura, idempotência, repetição) | Testes de transferência humana e webhook |
| E — IA | `AIProvider`, adaptador Ollama (endpoint/modelo configuráveis, diagnóstico), contexto apenas aprovado, resposta estruturada validada, regras determinísticas no backend, fallback seguro, fila de sugestões de conhecimento | Testes com provedor simulado (indisponível, malformado, confirmação obrigatória) |
| F — Pix | Cadastro de chave/recebedor/cidade, validação, payload BR Code estático com CRC16, QR somente quando válido, status "aguardando confirmação", botão "Marcar como pago" com registro | Testes com vetor oficial do BCB e casos inválidos |
| G — Acabamento | Backup com verificação de integridade, retenção/remoção de dados, revisão de segurança, acessibilidade do painel, README completo, dados de demonstração | Suíte completa, build de produção |

## Fora do escopo (decisão explícita)

Marketplace, app público multi-loja, logística compartilhada, pagamentos de terceiros, emissão fiscal, envio real de mensagens, sincronização em nuvem.
