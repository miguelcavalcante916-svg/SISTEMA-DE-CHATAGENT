# Impressão do comprovante interno

O comprovante é um **documento interno de pedido** (cozinha, balcão, entregador). Ele nunca é rotulado como nota fiscal e traz o aviso "Não é documento fiscal". Emissão fiscal é uma integração futura, separada e sujeita aos requisitos aplicáveis.

## Conteúdo

Nome do estabelecimento, número do pedido, data/hora, modalidade, cliente e telefone, endereço de entrega (quando entrega), itens com quantidades, variantes, adicionais e observações, subtotal, desconto, taxa de entrega, total, forma e status de pagamento, troco, observações de entrega e do cliente. **Nunca** imprime observações internas, dados de cartão, senhas, chave Pix completa ou tokens.

Reimpressões trazem `*** REIMPRESSÃO ***` com usuário, data e hora. Cada impressão fica no histórico do pedido e na tabela `print_jobs`.

## Modo 1: pelo navegador (padrão)

- Funciona com qualquer impressora instalada no sistema operacional (USB, rede, Bluetooth) usando o driver do fabricante.
- O painel abre `/imprimir/:id` com layout de 80 mm (48 colunas) ou 58 mm (32 colunas) e chama a impressão.
- Configure a térmica como impressora padrão, papel 80 mm/58 mm e margens mínimas; marque "não perguntar novamente" no diálogo do navegador para agilizar.
- Limitação: o corte automático depende do driver.

## Modo 2: ESC/POS por rede (opcional)

- Envia bytes ESC/POS brutos via TCP (porta 9100 por padrão) para impressoras com Ethernet/Wi-Fi.
- Comandos usados: inicialização (`ESC @`), tabela de caracteres (`ESC t n`, padrão 16 = WPC1252), negrito, tamanho duplo no número do pedido, avanço e corte parcial (`GS V 66 0`).
- Codificação: `cp1252` mantém acentos; `ascii` remove acentos (para impressoras sem suporte). O número do comando de tabela é configurável porque varia por fabricante.
- Impressão automática ao criar pedido só existe neste modo (o navegador exige ação do usuário).
- Não validado com hardware real neste repositório: os bytes foram testados por unidade e com um servidor TCP local. Faça o "Teste de impressão" na tela Impressora.
- Impressoras USB/seriais: compartilhe via sistema operacional ou use um servidor de impressão TCP; caso contrário, use o modo navegador.

## Testes automatizados

`server/src/modules/printing/printing.test.ts` cobre quebra de linha, acentos, valores monetários, campos opcionais, reimpressão identificada, codificação CP1252/ASCII e envio TCP.
