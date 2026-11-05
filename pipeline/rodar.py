"""python -m pipeline.rodar [--hoje AAAA-MM-DD] [--modo api|fallback|regex]"""
import argparse
import csv
import json
import sys
from datetime import date, datetime

from . import VERSAO
from .dados import RAIZ, carregar_pedidos, carregar_tickets
from .leitor import Leitor
from .modelos import Resultado, Resumo
from .orquestrador import processar
from .pre_triagem import pre_triar


def executar(hoje, modo=None, tickets=None):
    pedidos = carregar_pedidos()
    tickets = tickets if tickets is not None else carregar_tickets()
    leitor = Leitor(modo)
    log = []
    res = [processar(t["ticket_id"], t["texto"], leitor, pedidos, hoje, log) for t in tickets]
    leitor.salvar()
    return leitor.modo, res, log


def montar(hoje, modo, res, log, tickets):
    """Resultado (contrato do site) e pré-triagem da entrada para um lote de tickets."""
    fila = sorted(res, key=lambda r: (r.prioridade, r.ticket_id))
    resultado = Resultado(
        gerado_em=datetime.now().isoformat(timespec="seconds"), hoje=str(hoje), versao=VERSAO, modo=modo,
        resumo=Resumo(total=len(res), auto=sum(r.acao == "responder_auto" for r in res),
                      humano=sum(r.acao == "escalar_humano" for r in res), criticos=sum(r.critico for r in res)),
        tickets=fila, log=log,
    )
    entrada = {"gerado_em": resultado.gerado_em, "hoje": str(hoje), "regra": "pre_triagem (código, sem IA)",
               "tickets": pre_triar(tickets)}
    return resultado, entrada


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hoje", default="2026-11-10")
    ap.add_argument("--modo", choices=["api", "fallback", "regex"])
    a = ap.parse_args()
    hoje = date.fromisoformat(a.hoje)
    modo, res, log = executar(hoje, a.modo)

    with open(RAIZ / "saida.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ticket_id", "categoria", "acao", "pedido", "resposta"])
        for r in res:
            w.writerow([r.ticket_id, r.categoria, r.acao, r.pedido, r.resposta])
    (RAIZ / "saida").mkdir(exist_ok=True)
    with open(RAIZ / "saida/log.jsonl", "w", encoding="utf-8") as f:
        for e in log:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

    resultado, entrada = montar(hoje, modo, res, log, carregar_tickets())
    (RAIZ / "web/dados").mkdir(parents=True, exist_ok=True)
    (RAIZ / "web/dados/resultado.json").write_text(resultado.model_dump_json(indent=1), encoding="utf-8")
    (RAIZ / "web/dados/entrada.json").write_text(json.dumps(entrada, ensure_ascii=False, indent=1), encoding="utf-8")
    s = resultado.resumo
    print(f"modo={modo} hoje={hoje} total={s.total} auto={s.auto} humano={s.humano} criticos={s.criticos}")
    print("gerado: saida.csv, saida/log.jsonl, web/dados/resultado.json, web/dados/entrada.json")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
