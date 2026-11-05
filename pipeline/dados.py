import csv
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CAMPOS_PEDIDO = ["pedido", "produto", "personalizado", "status", "data_pedido", "prazo_entrega"]


def carregar_pedidos(caminho=RAIZ / "data/pedidos.csv"):
    with open(caminho, encoding="utf-8") as f:
        linhas = list(csv.DictReader(f))
    if not linhas or list(linhas[0].keys()) != CAMPOS_PEDIDO:
        raise SystemExit(f"pedidos.csv inválido: colunas esperadas {CAMPOS_PEDIDO}")
    return {r["pedido"]: r for r in linhas}


def carregar_tickets(caminho=RAIZ / "data/tickets.csv"):
    with open(caminho, encoding="utf-8") as f:
        linhas = list(csv.DictReader(f))
    if not linhas or set(linhas[0].keys()) != {"ticket_id", "texto"}:
        raise SystemExit("tickets.csv inválido: colunas esperadas ticket_id,texto")
    return linhas
