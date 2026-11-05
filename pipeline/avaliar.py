"""python -m pipeline.avaliar [--hoje] [--modo]: acerto por campo em evals/gabarito.csv e evals/casos.csv."""
import argparse
import csv
import sys
from datetime import date

from .dados import RAIZ, carregar_tickets
from .rodar import executar


def placar(nome, res, esperado):
    n = len(res)
    ok = {"categoria": 0, "acao": 0, "pedido": 0, "linha": 0}
    erros = []
    for r in res:
        e = esperado[r.ticket_id]
        got = (r.categoria, r.acao, r.pedido)
        for i, k in enumerate(("categoria", "acao", "pedido")):
            ok[k] += got[i] == e[i]
        ok["linha"] += got == e
        if got != e:
            erros.append(f"  {r.ticket_id}: esperado {'|'.join(e)} obtido {'|'.join(got)} ({r.evidencia.motivo})")
    print(f"[{nome}] n={n} " + " ".join(f"{k}={v}/{n}" for k, v in ok.items()))
    print("\n".join(erros) if erros else "  sem erros")
    return ok["linha"] == n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hoje", default="2026-11-10")
    ap.add_argument("--modo", choices=["api", "fallback", "regex"])
    a = ap.parse_args()
    hoje = date.fromisoformat(a.hoje)

    with open(RAIZ / "evals/gabarito.csv", encoding="utf-8") as f:
        gab = {r["ticket_id"]: (r["categoria"], r["acao"], r["pedido"]) for r in csv.DictReader(f)}
    modo, res, _ = executar(hoje, a.modo, carregar_tickets())
    print(f"modo={modo} hoje={hoje}")
    ok1 = placar("gabarito", res, gab)

    with open(RAIZ / "evals/casos.csv", encoding="utf-8") as f:
        casos = list(csv.DictReader(f))
    esp = {c["id"]: tuple(c["resultado_esperado"].split("|")) for c in casos}
    _, res2, _ = executar(hoje, a.modo, [{"ticket_id": c["id"], "texto": c["entrada"]} for c in casos])
    ok2 = placar("casos", res2, esp)
    sys.exit(0 if ok1 and ok2 else 1)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
