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
Enviar resposta ao cliente, integrar com helpdesk real, reembolso/estorno, login, idiomas além de português, inglês e espanhol, histórico do cliente, priorizar por SLA calculado, painel de métricas.

## Etapas do fluxo
| # | Etapa | Entrada | Saída | Modelo ou regra | Condição de falha → o que acontece |
|---|---|---|---|---|---|
| 0 | Orquestrador | `tickets.csv`, `pedidos.csv`, `--hoje` (padrão 2026-11-10) | execução ordenada + log | código | arquivo inválido → para e avisa |
| 1 | Leitor | texto do ticket | JSON `{intencao, pedido_citado, produto_citado, sinais[]}`; sinais: injeção, LGPD, jurídico/Procon, erro do cliente, defeito nosso, defeito ambíguo | Claude, temperatura 0, JSON validado | JSON inválido 2× ou intenção desconhecida → `outro` + `escalar_humano` |
| 1b | Rede de segurança | texto do ticket + JSON do Leitor | concorda ou discorda | regex (injeção, LGPD, processo/Procon) | regex acha sinal que o Leitor não marcou → `escalar_humano` + motivo no log |
| 2 | Juiz de Regras | JSON + `pedidos.csv` + `--hoje` | `categoria, acao, pedido` | código (`regras.md` 1–6) | pedido citado não existe → `pedido` vazio (regra 4) |
| 3 | Redator | decisão + linha do pedido | `resposta` | modelos de texto por (categoria, acao) | modelo ausente → resposta neutra de encaminhamento |
| 4 | Auditor | linha completa | aprovada ou rebaixada | código: pedido ∈ CSV ou vazio; datas citadas ∈ linha do pedido; sem "reembolso/desconto/indeniza/novo prazo"; produto citado bate com produto do pedido | qualquer falha → `escalar_humano` + motivo no log |
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
| T07 | duvida_produto | responder_auto | 7006 | só pergunta, no prazo (11-12): informa status/prazo ✅banca |
| T08 | lgpd | escalar_humano | | exclusão de dados |
| T09 | outro | escalar_humano | | sem assunto: na dúvida, humano ✅banca (P10) |
| T10 | outro | escalar_humano | 7008 | instrução embutida ⚠️P3 |
| T11 | troca | responder_auto | 7011 | não personalizado, pede foto |
| T12 | duvida_produto | responder_auto | | sem catálogo nos dados: não confirma nem nega ⚠️P4 |
| T13 | atraso | responder_auto | | sem número, pede número |
| T14 | cancelamento | responder_auto | 7010 | aguardando_producao |
| T15 | troca | escalar_humano | 7012 | cor diferente: defeito ou arquivo do cliente? ⚠️P2 |
| T16 | atraso | responder_auto | | 9999 não existe, pede número |
| T17 | duvida_produto | responder_auto | 7008 | só pergunta, no prazo (11-15): informa status/prazo ✅banca (P5) |
| T18 | reclamacao | escalar_humano | 7009 | ameaça jurídica ⚠️P6 |
| T19 | troca | responder_auto | 7007 | não personalizado e entregue: regra 2, pede foto ✅banca (P7 revista) |
| T20 | cancelamento | escalar_humano | 7005 | personalizado enviado |
| T21 | atraso | responder_auto | 7003 | 🌐 virada (inglês): prazo 11-08 vencido, em_transporte, sem reclamação forte (P1); resposta em inglês |
| T22 | cancelamento | responder_auto | 7010 | 🌐 virada (espanhol): aguardando_producao (regra 3); resposta em espanhol |
| T23 | reclamacao | escalar_humano | 7009 | 🌐 virada (inglês): ameaça de advogado (regra 5, P6) |

Resultado: 11 auto, 9 humano nos 20 originais; com a virada (T21–T23), 13 auto, 10 humano, 5 críticos.

Revisão após a banca (nota 16/20): os 4 erros (T07, T09, T17, T19) eram exatamente onde nossas premissas P5, P7 e "oi→auto" divergiam do que a banca mede. Corrigido; o pipeline reproduzia os mesmos 16/20 antes da correção.

## Premissas
- P1: atraso vencido sem reclamação forte → `responder_auto` (a regra 1 só fala explicitamente do caso no prazo).
- P2: "arte cortada" é defeito de produção; "cor diferente da arte" é ambíguo → humano; idem "diferente do que pedi"/"não ficou como queria" sem defeito claro.
- P3: injeção de instrução → categoria `outro` (não há categoria própria).
- P4: sem catálogo, `duvida_produto` responde sem afirmar disponibilidade.
- P5 (revista pela banca): só perguntar o prazo, dentro do prazo, é `duvida_produto` com `responder_auto` informando status e prazo. É `atraso` quando o cliente reclama ou quando o prazo já venceu (regra 1).
- P6: quando ameaça jurídica e atraso coexistem, `reclamacao` vence (regra 5 tem prioridade).
- P7 (revista pela banca): produto citado diferente do produto do pedido **não** escala sozinho; status e personalização decidem (regra 2). Escalar por isso inflava a fila. A resposta usa só os dados do pedido.
- P10 (confirmada pela banca): ticket sem assunto claro ("oi", "bom dia") → `outro` + `escalar_humano`. Na dúvida, o erro preferido é mandar para humano.
- P8: cancelamento de não personalizado `em_transporte`/`entregue` → `escalar_humano` (regra 3 não cobre).
- P9: troca de pedido ainda não entregue (status != `entregue`) → `escalar_humano`.
## Premissas confirmadas pela banca
Todas as premissas foram levadas ao mentor da banca. Antes, P5, P7 e "oi→auto" foram tratadas como fato no gabarito próprio, sem confirmação, e foram exatamente os 4 erros (T07, T09, T17, T19). Agora cada uma está confirmada ou revista:

| Premissa | Resposta da banca | Efeito |
|---|---|---|
| P1 | Atraso vencido sem reclamação forte: automático, informa status e prazo do ERP, sem data nova e sem desculpa exagerada. | Mantida (T01). |
| P2 | "Arte cortada" é defeito nosso, pede foto. "Cor diferente" vai para humano. | Mantida (T04 auto, T15 humano). |
| P3 | Manipulação é `outro` e escala. | Mantida (T10). |
| P4 | Dúvida de catálogo: não confirma nem nega; pode dizer que a atendente confirma os modelos. | Mantida (T12). |
| P5 | Só perguntar o prazo, dentro do prazo, não é atraso. | **Revista:** `duvida_produto` + auto (T07, T17). |
| P6 | Ameaça de processo vence o atraso: `reclamacao` + humano. | Mantida (T18). |
| P7 | Produto divergente não escala sozinho; status e personalização decidem. | **Revista:** T19 auto, pede foto. P9 não se aplica (7007 entregue) e P2 também não (não personalizado). |
| P8 | Cancelamento fora da regra 3 vai para humano. | Mantida. |
| P9 | Troca antes da entrega vai para humano. | Mantida. |
| P10 | "oi" sem assunto: na dúvida, humano. | **Criada:** T09 humano. |

- Ordem de prioridade do Juiz: manipulação > LGPD > jurídico/reclamação forte > cancelamento > troca > atraso > dúvida > outro.
- `pedido` sai vazio se não existir no CSV, mesmo que citado.
- Os testes escondidos checam `categoria`, `acao` e `pedido` com mais rigor que o texto de `resposta` (HIPÓTESE).

## Demo
Roteiro de 90 s em `docs/roteiro-demo.md`.

## Virada: tickets em inglês e espanhol
- A rede de segurança reconhece sinais críticos em PT, EN e ES (advogado/lawyer/abogado, dados pessoais/personal data/datos personales, manipulação).
- As intenções (atraso, troca, cancelamento, dúvida) também têm padrões em EN e ES.
- O Redator responde no idioma do ticket, com os mesmos modelos e os mesmos dados do pedido; o Auditor barra promessas nos três idiomas.
- Idioma é detectado por palavras comuns; empate fica em português.
