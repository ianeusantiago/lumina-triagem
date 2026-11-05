# Prompts do fluxo de preparo (ordem de uso)
Não confundir com /prompts (prompts do modelo, do agente ia).
1. 01-analise: entender o desafio — feito em conversa
2. 02-spec-demo → SPEC.md, docs/roteiro-demo.md
3. CLAUDE.md (template preenchido na raiz)
4. 03-perfil-dados → scripts/perfil.py, docs/perfil-dados.md
5. orquestrador.md (na pasta docs/) — agent team que constrói o projeto
6. 04-fatia — usado pelo agente ia, uma fatia por vez
7. 06-casos → evals/casos.csv (agente dados)
8. 05-verificador — sessão nova / agente verificador
9. 07-sabatina — último passo, com slides prontos
