# Contexto (simulação de preparo para o GoHacks Talent)

> Simulação. Datas e nomes são fictícios; serve para treinar o fluxo do dia.

## Desafio
- Marca fictícia: **Lumina Personalizados** (capinhas, garrafas e canecas com a arte do cliente).
- Área: Atendimento ao cliente.
- Dor: centenas de tickets/dia, a maioria repetitiva; casos delicados (reclamação forte, jurídico, LGPD) se perdem na fila.
- Pedido: para cada ticket decidir `categoria`, `acao`, `pedido` e `resposta` sugerida baseada só nos dados. Humano revisa só exceções.
- Entregável testado: `saida.csv` com `ticket_id,categoria,acao,pedido,resposta` (testes escondidos).

## Evento (FATO, lido na página do GoHacks Talent)
- Entrega até sábado 16h30: link do protótipo aberto, slides em PDF (problema, solução, demo, impacto, próximos passos), relatório individual (como pensou, decidiu e corrigiu a IA).
- Pré-júri: 10 min com a banca. Final: 5 min apresentação + 5 min sabatina.
- Projeto individual. Ferramenta recomendada: Claude (conta paga no notebook do evento).
- Dados reais não são usados; só sintéticos.

## Critérios (peso)
| Critério | Peso | O que a banca pergunta |
|---|---|---|
| Modelagem | 40% | Fluxo ponta a ponta? Usou agentes/orquestração? Tem autonomia? Conferiu e corrigiu a IA? |
| Adaptabilidade | 20% | Entendeu rápido o tema? Mostrou como seria com dados reais? Mudou de rota? |
| Conceito | 20% | Público claro, necessidade real, entendível em poucos minutos |
| Aderência cultural | 20% | Atitude de dono, colaboração, abertura a feedback |

Desempate: maior nota em Modelagem, depois Conceito.

## Narrativa do pitch (decidida na conversa)
1. **Cliente esperando** (T18: "12 dias sem resposta", pedido 7009 atrasado de verdade).
2. **Atendente afogada** respondendo "oi" (T09) e "qual o prazo?" (T17) enquanto o T18 espera.
3. **Solução**: a fila se separa sozinha; a atendente vê só as exceções, com o caso jurídico no topo.
