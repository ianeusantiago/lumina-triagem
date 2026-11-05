# Lumina Triagem

Orquestração de agentes que lê cada ticket de atendimento da Lumina Personalizados, decide categoria e ação, encontra o pedido e sugere uma resposta usando só os dados. A atendente revisa apenas as exceções.

## Por que existe
O cliente com ameaça jurídica espera 12 dias enquanto a atendente responde "oi". A triagem separa a fila sozinha e põe os casos delicados no topo.

## Como funciona (orquestração)
```
tickets.csv ──► [1 Leitor/IA] ──► [2 Juiz de Regras/código] ──► [3 Redator/modelos] ──► [4 Auditor/código] ──► saida.csv + fila
                      ▲                    │ pedidos.csv                                   │ falhou?
                      └──── Orquestrador controla ordem, erros e reprocessamento ◄──────────┘ → escalar_humano
```
| Agente | Tipo | Faz | Não faz |
|---|---|---|---|
| Orquestrador | código | Roda os agentes em ordem, trata erro, grava saída e log | Decidir categoria |
| 1. Leitor | Claude (saída JSON) | Extrai intenção, nº do pedido citado e sinais (jurídico, LGPD, manipulação, erro do cliente, defeito) | Decidir ação |
| 2. Juiz de Regras | código | Cruza com `pedidos.csv` e aplica `data/regras.md` → `categoria`, `acao`, `pedido` | Ler texto livre |
| 3. Redator | modelos de texto | Monta a resposta só com campos do CSV | Prometer reembolso, prazo, desconto |
| 4. Auditor | código | Confere pedido existente, datas citadas, frases proibidas; falha → `escalar_humano` | Reescrever resposta |

Princípio: **a IA interpreta, a regra decide, o auditor confere.**

## Estrutura
```
data/       tickets.csv, pedidos.csv, regras.md (fonte do desafio)
docs/       contexto.md (desafio, evento, critérios, narrativa)
SPEC.md     especificação + roteiro da demo de 90 s
CLAUDE.md   regras de trabalho para a IA neste projeto
```

## Saída
`saida.csv`: `ticket_id,categoria,acao,pedido,resposta`

## Stack
Python 3, Claude API (só no Leitor), CSV de entrada/saída, tela de fila estática (link público).

## Status
Especificação. Código ainda não escrito.
