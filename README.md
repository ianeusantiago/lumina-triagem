# Lumina Triagem

Orquestração de agentes que lê cada ticket de atendimento da Lumina Personalizados, decide categoria e ação, encontra o pedido e sugere uma resposta usando só os dados. A atendente revisa apenas as exceções.

## O que é (prévia do produto)
Um **site com link público** (Vercel), não um app de celular. Por trás, um programa em Python com Claude.

```
┌ Lumina Triagem ─────────────── 20 tickets · hoje 10/11 ── [▶ Rodar triagem] ┐
│  Para a atendente: 9      Respondidos sozinhos: 11      Críticos: 3         │
├─ Fila da atendente ─────────────────┬─ Respondidos automaticamente ─────────┤
│ [jurídico]    T18 · pedido 7009     │ T01 · atraso · 7003                   │
│ [Procon]      T06 · pedido 7009     │   "Em transporte, prazo 08/11."       │
│ [LGPD]        T08 · sem pedido      │ T02 · cancelamento · 7004             │
│ [manipulação] T10 · "ignore..."     │   "Aguardando produção, cancela."     │
│ + 5 cancelamentos e trocas          │ + 9 respostas                         │
├─────────────────────────────────────┴───────────────────────────────────────┤
│ Por que o T18 foi para humano: IA leu ameaça jurídica → regra 5 → auditor ok │
└──────────────────────────────────────────────────────── [Baixar saida.csv] ┘
```

1. **O que a pessoa vê:** clica em "Rodar triagem", a fila se divide em duas colunas, críticos no topo; clicando num ticket vê o motivo; baixa o `saida.csv`.
2. **O que roda por trás:** Python lê os tickets, Claude interpreta o texto, regras em código decidem com os dados dos pedidos, um auditor confere antes de sair.
3. **O que a banca recebe:** link do site, `saida.csv`, repositório e slides.

O site mostra resultados já calculados (com respostas salvas em /fallback), então a demo funciona mesmo se a internet ou a API falharem.

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
scripts/    perfil.py (perfil dos dados)
evals/      casos.csv (15 casos) — agente dados
pipeline/   orquestrador + agentes — agente ia
prompts/    prompts do modelo — agente ia
schemas/    contratos Pydantic/JSON — agente ia
fallback/   respostas reais salvas para a demo — agente ia
web/        telas da demo — agente interface
entrega/    slides PDF, formulário, rascunho do relatório — agente produto-pitch
docs/       contexto, perfil-dados, roteiro-demo, verificacao, orquestrador, prompts-fluxo
SPEC.md     especificação
CLAUDE.md   regras curtas para a IA
ERROS.md    erros da IA e correções
```

## Saída
`saida.csv`: `ticket_id,categoria,acao,pedido,resposta`

## Stack
Python 3.12, Claude API (só no Leitor), Pydantic, pytest, HTML estático em /web (link público).

## Status
Especificação. Código ainda não escrito.
