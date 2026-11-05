"""Orquestrador. Uso: python -m lumina.rodar [--hoje 2026-11-10] [--data data] [--saida saida.csv]"""
from __future__ import annotations

import argparse
import csv
import json
from datetime import date
from pathlib import Path

from pydantic import ValidationError

from lumina.agentes import Leitura, Linha, Decisao, auditar, julgar, ler_regex, redigir, ENCAMINHADO

COLUNAS = ["ticket_id", "categoria", "acao", "pedido", "resposta"]


def carregar(pasta: Path):
    with open(pasta / "pedidos.csv", encoding="utf-8", newline="") as f:
        pedidos = {r["pedido"]: r for r in csv.DictReader(f)}
    with open(pasta / "tickets.csv", encoding="utf-8", newline="") as f:
        tickets = list(csv.DictReader(f))
    return pedidos, tickets


def processar(ticket: dict, pedidos: dict, hoje: date, leitor=ler_regex) -> tuple[Linha, dict]:
    log = {"ticket_id": ticket["ticket_id"]}
    try:
        leitura = leitor(ticket["texto"])
        if not isinstance(leitura, Leitura):
            leitura = Leitura.model_validate(leitura)
    except (ValidationError, ValueError) as e:
        log["erro_leitor"] = str(e)[:200]
        d = Decisao(categoria="outro", acao="escalar_humano", motivo="leitura inválida")
        return Linha(ticket_id=ticket["ticket_id"], categoria=d.categoria, acao=d.acao,
                     pedido="", resposta=ENCAMINHADO), log
    log["leitura"] = leitura.model_dump()
    d = julgar(leitura, pedidos, hoje)
    log["motivo"] = d.motivo
    resposta = redigir(d, pedidos.get(d.pedido), hoje)
    linha = Linha(ticket_id=ticket["ticket_id"], categoria=d.categoria, acao=d.acao,
                  pedido=d.pedido, resposta=resposta)
    linha, falhas = auditar(linha, pedidos)
    if falhas:
        log["auditor"] = falhas
    return linha, log


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hoje", default="2026-11-10")
    ap.add_argument("--data", default="data")
    ap.add_argument("--saida", default="saida.csv")
    a = ap.parse_args()
    pedidos, tickets = carregar(Path(a.data))
    hoje = date.fromisoformat(a.hoje)
    linhas, logs = zip(*(processar(t, pedidos, hoje) for t in tickets))
    with open(a.saida, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUNAS)
        w.writeheader()
        w.writerows(l.model_dump() for l in linhas)
    Path("log.jsonl").write_text("\n".join(json.dumps(l, ensure_ascii=False) for l in logs), encoding="utf-8")
    auto = sum(l.acao == "responder_auto" for l in linhas)
    print(f"{len(linhas)} tickets -> {a.saida}: {auto} auto, {len(linhas) - auto} humano")


if __name__ == "__main__":
    main()
