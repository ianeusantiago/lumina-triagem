# Erros da IA

| Data | Etapa | O que a IA errou | Como percebi | Como corrigi |
|---|---|---|---|---|
| 2026-11-05 | Análise | Classificou T18 como `atraso` | Revisão contra a regra 5 (ameaça jurídica prevalece) | Gabarito do SPEC: T18 = `reclamacao` + `escalar_humano` |
| 2026-11-05 | Leitor (modo regex) | "Me apaguem do cadastro, quero meus dados excluídos" não foi marcado como LGPD: virou `outro` + `responder_auto` | Teste de importação de CSV com tickets novos | Padrão de LGPD da rede aceita verbo antes ou depois e "cadastro"/"conta" (`pipeline/rede.py`); casos C16–C18 e teste sem falso positivo |
| 2026-11-05 | Leitor (modo regex) | "A garrafa do pedido 7002 veio amassada" virou `atraso` + `responder_auto` (informou prazo em vez de tratar defeito) | Mesmo teste de importação | Defeito relatado vira `troca` antes do fallback por número (`pipeline/rede.py`); casos C19–C20 |
| 2026-11-05 | Premissas (Juiz) | Gabarito próprio com premissas não confirmadas (P5, P7, "oi→auto") divergiu da banca em T07, T09, T17, T19: nota 16/20 | Feedback do mentor da banca | P5 e P7 revistas, P10 criada; gabarito, casos C06/C12 e testes atualizados; lista de premissas a confirmar no SPEC |
| 2026-11-05 | Processo (SPEC) | P5, P7 e "oi→auto" estavam no gabarito como fato, sem perguntar à banca; as outras 7 premissas também não tinham sido confirmadas | Segunda rodada com o mentor da banca | As 10 premissas confirmadas ou revistas e registradas no SPEC com a resposta da banca; nenhuma resposta nova mudou o T19 |
| 2026-11-05 | Leitor/rede (modo regex) | Virada T21–T23: "I will contact my lawyer" (T23) recebeu `responder_auto`, porque os sinais jurídicos só existiam em português; respostas sairiam em português para cliente em inglês/espanhol | Gabarito da virada antes de mexer no código (22/23) | Sinais e intenções em EN/ES, Redator no idioma do ticket, Auditor barra promessas nos 3 idiomas; testes multilíngues e de falso positivo ("alta demanda") |
