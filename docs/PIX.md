# Pix e QR Code

## O que o sistema faz

- Cadastra chave Pix (CPF, CNPJ, e-mail, telefone ou chave aleatória), tipo, nome do recebedor (até 25 caracteres, sem acentos) e cidade (até 15). **Não** pede credenciais bancárias.
- Gera o payload **Pix estático** no padrão BR Code (EMV MPM) com CRC-16/CCITT-FALSE, opcionalmente com o valor do pedido e `txid` = `PED<número>`.
- Renderiza o QR (SVG) e o "copia e cola" na tela do pedido, só depois de o pedido estar calculado e criado.
- O status do pagamento nasce como **"aguardando confirmação do Pix"** e só muda para **pago** quando uma pessoa clica em "Marcar como pago" (fica registrado quem e quando).

## O que o sistema **não** faz

- Não há integração bancária, portanto **não existe conciliação automática**: o QR não prova pagamento. A tela avisa isso explicitamente.
- QR dinâmico (cobrança com identificação única no banco) só faz sentido com um provedor/banco integrado; ficou como integração futura.

## Validação

- O exemplo do *Manual de Padrões para Iniciação do Pix* do Banco Central é reproduzido byte a byte em `server/src/modules/payments/pix.test.ts` (CRC `1D3D`).
- Em Configurações › Pagamentos e Pix › "Verificar configuração Pix salva" o sistema valida a chave e mostra um payload de exemplo.
- Se a configuração for inválida ou o Pix estiver desabilitado, o QR é claramente mostrado como indisponível, em vez de gerar algo enganoso.

## Segurança

- A chave Pix completa só aparece para administradores; atendentes veem mascarada.
- A chave nunca é impressa no comprovante.
