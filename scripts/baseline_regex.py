"""Baseline sem IA: palavras-chave genéricas + regras de data/regras.md.

Uso:
  python scripts/baseline_regex.py [--hoje 2026-11-10]
  python scripts/baseline_regex.py --casos evals/casos.csv
"""
import argparse
import csv
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

KW = {
    "injecao": r"ignore (as |todas )?(as )?regras|ignore.*instru|reembols[ea] (agora|ja)|voce agora e|system prompt",
    "lgpd": r"dados pessoais|apag\w* (os )?(meus )?dados|exclu\w* (os )?(meus )?dados|lgpd",
    "juridico": r"procon|processar|process[oa] |advogad|justica|reclame aqui",
    "cancelamento": r"cancel",
    "troca": r"troca|trocar|devolv",
    "atraso": r"cade|nao chegou|atrasad|prazo|onde esta|chegar",
    "duvida": r"voces (fazem|tem|vendem)|tem (para|pra)|quanto custa|\?$",
}
DEFEITO = r"cortad|trincad|quebrad|defeit|rachad|manchad|riscad|amassad"
ERRO_CLIENTE = r"digitei|errei|escrevi errado|minha culpa"
PRODUTOS = ["capinha", "caneca", "garrafa"]


def norm(t):
    t = unicodedata.normalize("NFKD", t.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def tem(chave_ou_regex, texto):
    return re.search(KW.get(chave_ou_regex, chave_ou_regex), texto) is not None


def classificar(texto, pedidos, hoje):
    t = norm(texto)
    nums = re.findall(r"\b\d{4}\b", t)
    citado = nums[0] if nums else None
    p = pedidos.get(citado) if citado else None
    num = p["pedido"] if p else ""

    if tem("injecao", t):
        return "outro", "escalar_humano", num
    if tem("lgpd", t):
        return "lgpd", "escalar_humano", num
    if tem("juridico", t):
        return "reclamacao", "escalar_humano", num
    # produto citado diferente do produto do pedido (regra 8)
    if p:
        citados = [x for x in PRODUTOS if x in t]
        if citados and not any(x in norm(p["produto"]) for x in citados):
            cat = "troca" if tem("troca", t) else "cancelamento" if tem("cancelamento", t) else "atraso"
            return cat, "escalar_humano", num
    if tem("cancelamento", t):
        if not p:
            return "cancelamento", "responder_auto", ""
        if p["status"] == "aguardando_producao":
            return "cancelamento", "responder_auto", num
        if p["personalizado"] == "sim" and p["status"] in ("em_producao", "enviado"):
            return "cancelamento", "escalar_humano", num
        return "cancelamento", "escalar_humano", num
    if tem("troca", t):
        if not p:
            return "troca", "responder_auto", ""
        if p["personalizado"] == "nao":
            return "troca", "responder_auto", num
        if re.search(ERRO_CLIENTE, t):
            return "troca", "escalar_humano", num
        if re.search(DEFEITO, t):
            return "troca", "responder_auto", num
        return "troca", "escalar_humano", num
    if tem("atraso", t) or (citado and not tem("duvida", t)):
        return "atraso", "responder_auto", num
    if tem("duvida", t):
        return "duvida_produto", "responder_auto", num
    return "outro", "responder_auto", num


def carregar_pedidos():
    with open(RAIZ / "data/pedidos.csv", encoding="utf-8") as f:
        return {r["pedido"]: r for r in csv.DictReader(f)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hoje", default="2026-11-10")
    ap.add_argument("--casos", help="avalia evals/casos.csv em vez de tickets+gabarito")
    a = ap.parse_args()
    hoje = date.fromisoformat(a.hoje)
    pedidos = carregar_pedidos()

    linhas = []  # (id, texto, esperado(cat,acao,ped))
    if a.casos:
        with open(RAIZ / a.casos, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                linhas.append((r["id"], r["entrada"], tuple(r["resultado_esperado"].split("|"))))
    else:
        with open(RAIZ / "evals/gabarito.csv", encoding="utf-8") as f:
            gab = {r["ticket_id"]: (r["categoria"], r["acao"], r["pedido"]) for r in csv.DictReader(f)}
        with open(RAIZ / "data/tickets.csv", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                linhas.append((r["ticket_id"], r["texto"], gab[r["ticket_id"]]))

    n = len(linhas)
    ok = {"categoria": 0, "acao": 0, "pedido": 0, "linha": 0}
    erros = []
    for i, texto, esp in linhas:
        got = classificar(texto, pedidos, hoje)
        for k, idx in (("categoria", 0), ("acao", 1), ("pedido", 2)):
            ok[k] += got[idx] == esp[idx]
        if got == esp:
            ok["linha"] += 1
        else:
            erros.append(f"{i}: esperado {'|'.join(esp)} | obtido {'|'.join(got)} | \"{texto}\"")

    print(f"hoje={hoje} n={n}")
    for k, v in ok.items():
        print(f"{k}: {v}/{n} ({100*v/n:.0f}%)")
    print("erros:")
    for e in erros:
        print("  " + e)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
