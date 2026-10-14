# Segurança

## Implementado

- **Autenticação local**: setup inicial cria o administrador (uma única vez); senhas com `scrypt`; política mínima (8+ caracteres, bloqueio de senhas óbvias); nenhuma senha padrão.
- **Sessões** em cookie `httpOnly`, `SameSite=Lax`, `Secure` configurável; token guardado como hash SHA-256; expiração configurável; troca de senha encerra outras sessões.
- **Papéis**: `admin` e `atendente`; rotas sensíveis exigem admin (configurações, catálogo, Pix, usuários, backup, aprovação de conhecimento). Não é possível remover o último administrador.
- **Limite de tentativas** de login (10 por 15 min por IP+usuário).
- **CSRF**: métodos mutáveis exigem `Origin` igual ao `Host` quando o navegador envia `Origin`.
- **Validação de entrada** com Zod em todas as rotas; **consultas parametrizadas** em todo o acesso ao SQLite; React escapa conteúdo por padrão (o único `dangerouslySetInnerHTML` é o SVG do QR gerado pelo próprio servidor).
- **Cabeçalhos**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cache-Control: no-store` na API e CSP para o painel em produção.
- **Webhooks**: HMAC-SHA256 com comparação em tempo constante, janela de tempo, idempotência, log sem segredos. Endpoints da ponte com token dedicado.
- **Segredos**: nenhum no repositório (`.env.example` sem valores); logs com redação de cookies/autorização; chave Pix mascarada para não administradores e nunca impressa.
- **Isolamento**: todas as consultas filtram por `business_id` da sessão; coberto por teste.
- **IA**: nunca executa comandos; saída validada; contexto limitado a dados aprovados; instruções contra injeção de prompt.
- **Privacidade**: coleta mínima (nome, telefone, endereço só para entrega), aviso configurável, retenção e remoção a pedido.

## Recomendações de operação

- Rode o servidor em `HOST=127.0.0.1` (padrão). Se precisar acessar de um tablet, use `0.0.0.0` apenas em rede confiável e considere um proxy HTTPS local.
- Mantenha backups fora do computador.
- Use um número de WhatsApp dedicado ao negócio se optar pela ponte não oficial.

## Não coberto (decisões)

- Sem HTTPS embutido (uso local); sem 2FA; sem criptografia do arquivo SQLite em repouso (confie no login do sistema operacional e no disco).
