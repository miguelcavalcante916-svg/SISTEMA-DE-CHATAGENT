# Backup, restauração e retenção

## Backup

- Painel: Usuários e segurança › Backup › "Fazer backup agora". Também por linha de comando: `npm run backup`.
- Usa `VACUUM INTO`, que gera uma cópia consistente mesmo com o servidor em uso.
- Cada backup é verificado na hora (`PRAGMA integrity_check` + contagem de tabelas + versão do esquema). `npm run backup:verify -- <arquivo>` verifica depois.
- Arquivos ficam em `BACKUP_DIR` (padrão `data/backups`). **Nada vai para a nuvem.** Copie para pendrive/outro computador periodicamente; qualquer sincronização futura deve ser explícita e documentada.

## Restauração

1. Pare o servidor.
2. Guarde o banco atual (`data/app.db`) e remova `app.db-wal`/`app.db-shm` se existirem.
3. Copie o backup para `data/app.db`.
4. Opcional: `npm run backup:verify -- data/app.db`.
5. Inicie o servidor; migrações pendentes são aplicadas automaticamente.

## Retenção e privacidade

- Configurável por estabelecimento: dias para apagar conversas, para anonimizar dados pessoais de pedidos concluídos/cancelados e para apagar auditoria (0 = nunca).
- Rotina roda 15 s após iniciar e a cada 24 h; também sob demanda no painel.
- Remoção a pedido do cliente: Usuários e segurança › Privacidade › informe o telefone. Conversas são apagadas e pedidos anonimizados; a auditoria guarda o telefone mascarado.
- Sugestões de conhecimento mascaram telefones, e-mails e CPFs automaticamente.
