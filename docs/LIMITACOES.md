# Limitações conhecidas e decisões pendentes

## Integrações não configuradas ou dependentes de credenciais/hardware

| Integração | Situação | O que falta |
|-----------|----------|-------------|
| WhatsApp (open-wa) | Código da ponte e do provedor prontos; **não executado contra WhatsApp real** | Número dedicado, Chrome/Chromium, `npm install` na pasta da ponte, pareamento por QR, ajustes de campos do open-wa na primeira execução |
| WhatsApp oficial (Meta) / BSPs | Não implementado (documentado) | Conta Meta Business verificada, número, token, webhook HTTPS público |
| Ollama | Adaptador pronto e testado com respostas simuladas; **não testado com modelo real neste ambiente** | Instalar Ollama e baixar um modelo |
| Impressora ESC/POS | Codificador e envio TCP testados localmente; **não testado com impressora física** | Impressora de rede com IP fixo; pode exigir ajuste de tabela de caracteres |
| Pix dinâmico / conciliação | Não implementado | Integração com banco/provedor (API) |
| Emissão fiscal | Fora do escopo | Integração futura com requisitos próprios |

## Limitações funcionais do MVP

- Um estabelecimento por instalação; `business_id` existe em todas as tabelas, mas não há isolamento multi-tenant distribuído nem painel multi-loja.
- Atualização do painel por polling (5 a 10 s), não em tempo real.
- Impressão pelo navegador depende do diálogo de impressão; o registro de "impresso" acontece ao clicar em imprimir, não na confirmação física da impressora.
- A IA pode escrever preços no texto livre; o servidor não reescreve a frase, mas anexa sempre o resumo oficial e não aceita valores do modelo. Instruções do sistema pedem para não citar preços fora do contexto.
- Reservas (churrascaria/bar) são apenas um sinalizador de configuração; não há agenda de reservas.
- Combos não permitem escolher variantes dos componentes; use grupos de adicionais no próprio combo.
- Testes de interface são apenas de compilação (typecheck + build); a lógica crítica está testada no servidor.

## Decisões pendentes para o proprietário

1. Aceitar os riscos do WhatsApp não oficial (bloqueio de número) ou migrar para a API oficial.
2. Escolher o modelo do Ollama conforme a máquina disponível.
3. Definir política de retenção adequada ao negócio e ao aviso de privacidade.
4. Validar a impressora térmica real e ajustar codificação/tabela de caracteres.
