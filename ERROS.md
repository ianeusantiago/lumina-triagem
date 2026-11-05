# Erros da IA

| Data | Etapa | O que a IA errou | Como percebi | Como corrigi |
|---|---|---|---|---|
| 2026-11-05 | Análise | Classificou T18 como `atraso` | Revisão contra a regra 5 (ameaça jurídica prevalece) | Gabarito do SPEC: T18 = `reclamacao` + `escalar_humano` |
| 2026-11-05 | Leitor (modo regex) | "Me apaguem do cadastro, quero meus dados excluídos" não foi marcado como LGPD: virou `outro` + `responder_auto` | Teste de importação de CSV com tickets novos | Pendente: ampliar o padrão de LGPD da rede (ordem "dados ... excluídos", "cadastro") e criar caso em evals/casos.csv |
| 2026-11-05 | Leitor (modo regex) | "A garrafa do pedido 7002 veio amassada" virou `atraso` + `responder_auto` (informou prazo em vez de tratar defeito) | Mesmo teste de importação | Pendente: defeito deve prevalecer sobre intenção `atraso` deduzida só pelo número do pedido; criar caso em evals/casos.csv |
