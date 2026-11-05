# SPEC — Lumina Triagem

Solução escolhida: **orquestração de agentes (IA interpreta, regra decide, auditor confere)** gerando `saida.csv` e uma fila visual de exceções.

## Problema
FATO: a fila mistura repetitivos ("onde está meu pedido", troca, cancelamento) com casos delicados (jurídico, Procon, LGPD), que se perdem.
FATO (dados): T18 ameaça processo por pedido 7009 atrasado (prazo 2026-11-07, status `em_transporte`) e fica na mesma fila que T09 ("oi").

## Usuário
- Principal: **cliente com caso delicado esperando** (T06, T18).
- Operador: **atendente** que revisa só as exceções.

## Hipótese
HIPÓTESE: se os tickets que os dados já respondem saem automaticamente com resposta correta, os casos delicados chegam à atendente primeiro e o tempo até a primeira resposta deles cai.

## Métricas
- **Processo:** % de tickets cuja `acao` e `categoria` batem com o gabarito abaixo (meta: 20/20); nº de respostas reprovadas pelo Auditor; 0 respostas com data/valor fora dos dados.
- **Negócio:** tempo até primeira resposta dos tickets `escalar_humano` críticos (jurídico/LGPD). Sem linha de base no material: medir antes/depois quando houver dados reais.

## Fora do escopo
Enviar resposta ao cliente, integrar com helpdesk real, reembolso/estorno, login, multi-idioma, histórico do cliente, priorizar por SLA calculado, painel de métricas.

## Etapas do fluxo
| # | Etapa | Entrada | Saída | Modelo ou regra | Condição de falha → o que acontece |
|---|---|---|---|---|---|
| 0 | Orquestrador | `tickets.csv`, `pedidos.csv` | execução ordenada + log | código | arquivo inválido → para e avisa |
| 1 | Leitor | texto do ticket | JSON `{intencao, pedido_citado, sinais[]}` | Claude, temperatura 0, JSON validado | JSON inválido 2× ou intenção desconhecida → `outro` + `escalar_humano` |
| 2 | Juiz de Regras | JSON + `pedidos.csv` + hoje | `categoria, acao, pedido` | código (`regras.md` 1–6) | pedido citado não existe → `pedido` vazio (regra 4) |
| 3 | Redator | decisão + linha do pedido | `resposta` | modelos de texto por (categoria, acao) | modelo ausente → resposta neutra de encaminhamento |
| 4 | Auditor | linha completa | aprovada ou rebaixada | código: pedido ∈ CSV ou vazio; datas citadas ∈ linha do pedido; sem "reembolso/desconto/indeniza/novo prazo" | qualquer falha → `escalar_humano` + motivo no log |
| 5 | Saída | linhas aprovadas | `saida.csv` + fila (auto vs humano, críticos no topo) | código | — |

Por que o Leitor é IA e o resto código: o texto livre precisa de interpretação; a decisão precisa ser repetível para os testes escondidos.

## Gabarito esperado (hoje = 2026-11-10)
| Ticket | Categoria | Ação | Pedido | Motivo |
|---|---|---|---|---|
| T01 | atraso | responder_auto | 7003 | prazo 11-08 passou, em_transporte; informa status/prazo, sem data nova ⚠️P1 |
| T02 | cancelamento | responder_auto | 7004 | aguardando_producao |
| T03 | cancelamento | escalar_humano | 7002 | personalizado em_producao |
| T04 | troca | responder_auto | 7001 | arte cortada = defeito nosso, pede foto ⚠️P2 |
| T05 | troca | escalar_humano | 7005 | erro de digitação do cliente |
| T06 | reclamacao | escalar_humano | 7009 | Procon |
| T07 | atraso | responder_auto | 7006 | no prazo (11-12), informa status/prazo |
| T08 | lgpd | escalar_humano | | exclusão de dados |
| T09 | outro | responder_auto | | pede número/assunto |
| T10 | outro | escalar_humano | 7008 | instrução embutida ⚠️P3 |
| T11 | troca | responder_auto | 7011 | não personalizado, pede foto |
| T12 | duvida_produto | responder_auto | | sem catálogo nos dados: não confirma nem nega ⚠️P4 |
| T13 | atraso | responder_auto | | sem número, pede número |
| T14 | cancelamento | responder_auto | 7010 | aguardando_producao |
| T15 | troca | escalar_humano | 7012 | cor diferente: defeito ou arquivo do cliente? ⚠️P2 |
| T16 | atraso | responder_auto | | 9999 não existe, pede número |
| T17 | atraso | responder_auto | 7008 | informa status/prazo (11-15) ⚠️P5 |
| T18 | reclamacao | escalar_humano | 7009 | ameaça jurídica ⚠️P6 |
| T19 | troca | escalar_humano | 7007 | cliente diz "caneca", 7007 é capinha: produto não bate ⚠️P7 |
| T20 | cancelamento | escalar_humano | 7005 | personalizado enviado |

Resultado: 11 auto, 9 humano.

## Premissas
- P1: atraso vencido sem reclamação forte → `responder_auto` (a regra 1 só fala explicitamente do caso no prazo).
- P2: "arte cortada" é defeito de produção; "cor diferente da arte" é ambíguo → humano.
- P3: injeção de instrução → categoria `outro` (não há categoria própria).
- P4: sem catálogo, `duvida_produto` responde sem afirmar disponibilidade.
- P5: pergunta de prazo de pedido → `atraso` (status de entrega), mesmo sem reclamação.
- P6: quando ameaça jurídica e atraso coexistem, `reclamacao` vence (regra 5 tem prioridade).
- P7: produto citado no ticket diferente do produto do pedido → `escalar_humano` (regra 8: não assumir qual dado está certo). Achado do `scripts/perfil.py`.
- Ordem de prioridade do Juiz: manipulação > LGPD > jurídico/reclamação forte > cancelamento > troca > atraso > dúvida > outro.
- `pedido` sai vazio se não existir no CSV, mesmo que citado.
- Os testes escondidos checam `categoria`, `acao` e `pedido` com mais rigor que o texto de `resposta` (HIPÓTESE).

## Demo
Roteiro de 90 s em `docs/roteiro-demo.md`.
