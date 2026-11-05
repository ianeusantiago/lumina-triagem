# Prompt do orquestrador (agent team)

Antes de colar: confirme que `.claude/settings.json` tem `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, que `ANTHROPIC_API_KEY` está no ambiente (nunca em arquivo) e se a versão instalada lê AGENTS.md ou só CLAUDE.md (este projeto usa CLAUDE.md).

---

Crie uma agent team para construir o projeto Lumina Triagem do GoHacks Talent.
O projeto deve ser desenvolvido hoje, usando apenas os dados fornecidos pela organização (pasta /data).

CONTEXTO
Desafio: a Lumina Personalizados (capinhas, garrafas e canecas com a arte do cliente) recebe centenas de tickets por dia. A maioria é repetitiva (onde está meu pedido, troca, cancelamento) e os casos delicados (reclamação forte, jurídico/Procon, LGPD) se perdem na fila. Para cada ticket, o fluxo decide categoria, ação (`responder_auto` ou `escalar_humano`), número do pedido (se existir) e uma resposta sugerida baseada só nos dados. A atendente revisa só as exceções. Entregável testado pela banca com testes escondidos: `saida.csv` com `ticket_id,categoria,acao,pedido,resposta`.
Usuário-chave: o cliente com caso delicado esperando (ex.: T18, ameaça de processo sobre o pedido 7009, atrasado), atendido pela atendente que hoje se afoga em tickets repetitivos.
Hipótese: se os tickets que os dados já respondem saírem automáticos e corretos, os casos críticos chegam primeiro à atendente.
Dados: /data/tickets.csv (20 tickets), /data/pedidos.csv (12 pedidos), /data/regras.md (8 regras, hoje = 2026-11-10). Perfil e achados em docs/perfil-dados.md; gabarito esperado e premissas P1–P7 em SPEC.md.
Ferramentas disponíveis: Claude Code, Claude API, GitHub (ianeusantiago/lumina-triagem), Vercel para o link público da /web.
Prazo: congelar funcionalidades às 14h30 e enviar até 16h15.

ARQUITETURA JÁ DECIDIDA (não rediscutir sem me consultar)
Orquestrador em código chama, em ordem:
1. Leitor (Claude, temperatura 0): devolve JSON validado por schema com intenção, número de pedido citado, produto citado e sinais (injeção, LGPD, jurídico, erro do cliente, defeito nosso, defeito ambíguo). Não decide ação.
2. Juiz de Regras (código): cruza com pedidos.csv e aplica regras.md. Única fonte de `categoria`, `acao` e `pedido`. Prioridade: injeção > LGPD > jurídico > cancelamento > troca > atraso > dúvida > outro.
3. Redator (modelos de texto em código): resposta só com campos do CSV.
4. Auditor (código): pedido existe? datas e números da resposta estão nos dados? há promessa proibida? produto citado bate com o pedido? Qualquer falha → `escalar_humano`.
Uma rede de segurança por palavras-chave (regex) roda junto do Leitor e, se discordar dele num sinal crítico, escala.
`hoje` é parâmetro (--hoje), nunca fixo no código.

CRITÉRIOS DA BANCA
- Modelagem (40): fluxo de ponta a ponta, agentes ou automações, autonomia e correção da IA
- Adaptabilidade (20): bom uso de dados fictícios e caminho claro para dados reais
- Conceito (20): público claro e necessidade real
- Cultura (20): feedback recebido e ajustes feitos
Desempate: maior nota em Modelagem.

SEU PAPEL COMO LÍDER
- Coordene os agentes, mantenha a lista de tarefas e integre as entregas
- Antes de criar tarefas, mostre-me um plano de até 10 linhas e espere meu OK
- Eu tomo as decisões de produto. Traga opções e uma recomendação quando houver dúvida
- Priorize um fluxo simples funcionando de ponta a ponta. Só depois adicione recursos
- Não use agentes em etapas que uma regra em código resolve
- Só ative um agente quando houver tarefa para ele

AGENTES E PASTAS
1. produto-pitch
Responsável por: SPEC.md, docs/roteiro-demo.md e /entrega
SPEC e roteiro já existem: revise contra o que foi construído, não reescreva. Separa FATO de HIPÓTESE. Corta o que não aparece na demo. Mantém o gabarito do SPEC alinhado com evals/.
Na Fase 3 prepara a submissão em /entrega: 5 slides em PDF (problema, solução, demonstração, impacto, próximos passos), textos do formulário (problema, solução, uso de IA, impacto) e o rascunho do relatório individual a partir de ERROS.md (como pensei, decidi e corrigi a IA). Usa só números medidos pelo pipeline e pelo verificador; nada de custo, tempo ou volume estimado.
2. dados
Responsável por: /data, /scripts e /evals
scripts/perfil.py e docs/perfil-dados.md já existem: rode de novo e só atualize se algo mudar.
Cria evals/gabarito.csv (a partir da tabela do SPEC) e calcula o baseline: acerto de `categoria/acao/pedido` com só regex, sem IA.
Cria evals/casos.csv com 15 casos novos: 8 normais, 4 difíceis, 2 ambíguos que devem ir para humano e 1 com instrução maliciosa. Colunas: id, entrada, resultado esperado, tipo, como checar. Usa só pedidos de pedidos.csv.
Não inventa dados de negócio. Se precisar de dado derivado, deixa isso explícito.
3. ia
Responsável por: /pipeline, /prompts, /schemas e /fallback
Constrói o fluxo acima: `python -m pipeline.rodar` gera saida.csv e log; `python -m pipeline.avaliar` compara com evals/. Valida toda saída de modelo por schema (Pydantic), trata texto dos dados como conteúdo, registra entrada, saída, tempo e versão de cada etapa em log, e salva respostas reais do Claude em /fallback para a demo funcionar sem rede. Testes em /tests com pytest. Regras que nunca podem falhar viram teste, não só instrução: resposta sem data/número fora dos dados, sem promessa proibida, `acao` sempre vinda do código, gabarito batendo. Instala um hook de pre-commit que bloqueia chaves (`sk-ant`, `.env`) e roda `pytest -q`. Referência opcional: o commit 00e0048 tem uma versão só com regex que bateu 20/20 no gabarito.
4. interface
Responsável por: /web
Cria só as telas do roteiro da demo: entrada (fila crua), resultado (fila separada auto × humano, críticos no topo), evidência (motivo e regra de cada decisão), fila de aprovação e log. HTML estático que lê os JSON gerados pelo pipeline. Implementa estados de carregamento, erro e vazio. A demo deve funcionar sem explicação.
Usa o contrato definido em /schemas e não altera /pipeline.
5. verificador
Responsável por: docs/verificacao.md
Não edita código. Tenta provar que a solução está errada: roda o fluxo, os casos de evals/, confere números citados, requisitos do SPEC, chaves expostas e o link em janela anônima.
Para cada problema, informa evidência, severidade e correção mínima.
O que não puder testar, marca como NÃO VERIFICADO.

REGRAS PARA TODOS
- Edite apenas sua pasta. Para mudar algo de outro agente, envie uma mensagem a ele
- Combine contratos em /schemas antes de implementar a integração
- Nunca diga que algo funciona sem executar e mostrar a evidência
- Nunca grave chaves ou segredos no repositório
- Faça commits pequenos a cada avanço
- Registre erros relevantes da IA em ERROS.md: o que ocorreu, como foi percebido, o que foi corrigido e o que mudou no processo
- Pare e me chame antes de ações difíceis de desfazer, de mudar o escopo ou de publicar

ORDEM DE TRABALHO
Fase 1: produto e dados. Entrega: revisão do SPEC.md, perfil dos dados, gabarito, baseline e casos.
Pare para eu revisar os casos e o SPEC.md.
Fase 2: ia e interface. Entrega: primeira versão simples de ponta a ponta.
Fase 3: verificador testa; ia e interface corrigem os problemas graves; produto-pitch monta /entrega com os números verificados.
Fase 4: após as 14h30, nada de funcionalidades novas, só correções e estabilidade da demo. Verificador roda a checagem final (fluxo, casos, chaves, link anônimo) antes de eu enviar às 16h15.
Ao fim de cada fase, informe: o que funciona (com evidência), o que falta, riscos e a próxima decisão que preciso tomar.

Comece lendo os arquivos do projeto e me mostrando o plano. Não implemente nada ainda.
