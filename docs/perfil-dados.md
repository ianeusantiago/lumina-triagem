# Perfil dos dados (gerado por `python scripts/perfil.py`)

Limpo: 12 pedidos e 20 tickets, sem nulos, sem duplicatas, tipos consistentes, IDs únicos, datas válidas.

## O que afeta a solução
| # | Achado (calculado) | Impacto na solução | Em dados reais |
|---|---|---|---|
| 1 | T19 cita "caneca" no 7007, que é **capinha iPhone 14** | Gabarito mudou: T19 → `escalar_humano` (P7). Auditor deve checar produto citado × produto do pedido | Comum (cliente confunde pedidos); checagem vira regra fixa |
| 2 | Atrasados: 7003, 7005, 7009 | T01, T05, T06, T18, T20 tocam pedido atrasado; só T01 é atraso "puro" | Data muda todo dia: `hoje` tem de ser parâmetro, nunca fixo no código |
| 3 | Números que não são pedido: "8" (T01), "200" (T10), "17" (T12), "12" (T18) | Extrair só `\b\d{4}\b` e validar no CSV; nunca copiar o número para `pedido` | Pedidos com outro nº de dígitos, CPF, CEP e telefone no texto vão gerar falso positivo |
| 4 | T16 cita 9999, que não existe | `pedido` vazio, pede número (regra 4) | Erro de digitação frequente |
| 5 | Sem número: T08, T09, T12, T13 | Pede número; T08 escala (LGPD) | Real teria e-mail/CPF do cliente para achar o pedido; aqui não há chave de cliente |
| 6 | T18 diz "12 dias sem resposta", mas o 7009 foi feito há 11 dias (2026-10-30) | Não citar o número do cliente como fato na resposta | Alegações do cliente divergem do sistema; resposta usa só dados |
| 7 | 4 entregues sem data real de entrega | Não dá para checar prazo de troca/arrependimento | Real precisaria `data_entrega` |
| 8 | Status `enviado` (1) e `em_transporte` (3) coexistem; a regra 3 só cita `enviado` | Tratar os dois como "já saiu" no cancelamento de personalizado | Status sinônimos são comuns; mapear num dicionário |
| 9 | 7010 foi pedido hoje | Sem efeito nos tickets atuais | Pedidos do dia podem não estar sincronizados |
| 10 | 7005, 7008, 7009 citados por 2 tickets | Mesmo cliente insistindo (HIPÓTESE); T06 e T18 juntos reforçam prioridade | Agrupar por pedido para não responder duas vezes |
| 11 | Gatilhos por palavra: jurídico T06/T18, LGPD T08, injeção T10 | Bate com o gabarito; serve de rede de segurança se o Leitor (IA) falhar | Palavras variam; regex sozinho não cobre, por isso a IA lê primeiro |
