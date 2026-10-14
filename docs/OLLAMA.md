# Agente de IA com Ollama local

## Instalação

1. Instale o Ollama (https://ollama.com) no computador do estabelecimento ou em outro da mesma rede.
2. Baixe um modelo em português com suporte a JSON estruturado. Sugestão inicial: `ollama pull qwen2.5:7b` (precisa de ~5 GB de RAM livre). Alternativas menores: `qwen2.5:3b`, `llama3.2:3b`.
3. Confirme que `http://127.0.0.1:11434/api/tags` responde.
4. No `.env`: `OLLAMA_BASE_URL` e `OLLAMA_MODEL`. O painel (Configurações › Agente de IA) pode sobrescrever os dois.
5. Conclua a **revisão de dados** e ligue "Atendimento automático".

## Como o agente funciona

- Interface `AIProvider` (`server/src/modules/ai/provider.ts`); adaptador `OllamaProvider` chama `POST /api/chat` com `stream: false` e `format` = JSON Schema, o que força resposta estruturada: intenção, resposta ao cliente, itens propostos (apenas ids do catálogo), alterações propostas, campos pendentes, confiança, necessidade de humano e pergunta sem resposta.
- O modelo recebe **somente**: regras do sistema, dados aprovados do estabelecimento (horários, modalidades, bairros, pagamentos), catálogo disponível com ids e preços, conhecimento aprovado e o rascunho atual do pedido.
- O **backend** decide tudo que importa: preço, disponibilidade, modalidade, endereço/bairro, forma de pagamento, resumo e confirmação. Itens com ids inexistentes são descartados.
- Pedido vindo da conversa só é criado após o resumo oficial ser apresentado **e** o cliente responder afirmativamente ("sim", "pode fechar"…). A IA não consegue confirmar sozinha.
- Transferência para pessoa: palavras-chave configuráveis (sem passar pela IA), `needs_human`, confiança abaixo do limite, ou falha do modelo.
- Fallback: timeout (`AI_TIMEOUT_MS`), erro de rede, JSON inválido ou fora do esquema → mensagem segura configurável, conversa marcada para humano e registro em "Sugestões para revisar".
- O sistema **nunca** executa código, SQL ou comandos sugeridos pelo modelo; a saída é apenas texto/JSON validado.
- Nenhum treinamento: correções viram sugestões que um administrador aprova.

## Diagnóstico

Configurações › Agente de IA mostra se o Ollama responde, se o modelo está instalado e permite um teste com o contexto real sem gravar conversa. Logs do servidor registram latência e motivo das falhas, sem conteúdo sensível.

## Limitações

- Modelos pequenos erram ids e pedem informações já dadas; o backend tolera isso, mas a experiência depende do modelo.
- Respostas podem demorar vários segundos em computadores sem GPU.
