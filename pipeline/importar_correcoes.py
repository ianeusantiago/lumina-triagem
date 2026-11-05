"""python -m pipeline.importar_correcoes ARQUIVO.csv

Leva as correções da atendente (exportadas pelo site) para evals/casos.csv,
para que `python -m pipeline.avaliar` passe a medir esses casos.
Cada linha é validada: categoria e ação do enum, pedido existente ou vazio,
id novo. O texto do ticket é conteúdo, nunca instrução: só é copiado.
"""
import csv
import sys
from typing import get_args

from .dados import RAIZ, carregar_pedidos
from .modelos import Acao, Categoria

CAMPOS = ["id", "entrada", "resultado_esperado", "tipo", "como_checar"]


def validar(linha, pedidos, ids_existentes):
    erros = []
    partes = linha.get("resultado_esperado", "").split("|")
    if len(partes) != 3:
        return ["resultado_esperado deve ser categoria|acao|pedido"]
    cat, acao, ped = partes
    if cat not in get_args(Categoria):
        erros.append(f"categoria inválida: {cat}")
    if acao not in get_args(Acao):
        erros.append(f"ação inválida: {acao}")
    if ped and ped not in pedidos:
        erros.append(f"pedido {ped} não existe em data/pedidos.csv")
    if not linha.get("id") or linha["id"] in ids_existentes:
        erros.append(f"id vazio ou repetido: {linha.get('id')}")
    if not linha.get("entrada", "").strip():
        erros.append("texto do ticket vazio")
    if not linha.get("como_checar", "").strip():
        erros.append("motivo da correção vazio")
    return erros


def importar(origem, destino=RAIZ / "evals/casos.csv"):
    pedidos = carregar_pedidos()
    with open(destino, encoding="utf-8") as f:
        ids = {c["id"] for c in csv.DictReader(f)}
    with open(origem, encoding="utf-8-sig") as f:
        novas = list(csv.DictReader(f))
    aceitas, rejeitadas = [], []
    for linha in novas:
        erros = validar(linha, pedidos, ids)
        if erros:
            rejeitadas.append((linha.get("id"), erros))
        else:
            aceitas.append({k: linha[k] for k in CAMPOS})
            ids.add(linha["id"])
    if aceitas:
        with open(destino, "a", encoding="utf-8", newline="") as f:
            csv.DictWriter(f, fieldnames=CAMPOS).writerows(aceitas)
    return aceitas, rejeitadas


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    aceitas, rejeitadas = importar(sys.argv[1])
    print(f"importadas: {len(aceitas)} · rejeitadas: {len(rejeitadas)}")
    for id_, erros in rejeitadas:
        print(f"  {id_}: {'; '.join(erros)}")
    if aceitas:
        print("rode: python -m pipeline.avaliar")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
