"""Compara saida.csv com evals/gabarito.csv. Uso: python -m lumina.avaliar [saida.csv]"""
import csv
import sys


def ler(caminho):
    with open(caminho, encoding="utf-8", newline="") as f:
        return {r["ticket_id"]: r for r in csv.DictReader(f)}


def main():
    saida = ler(sys.argv[1] if len(sys.argv) > 1 else "saida.csv")
    gab = ler("evals/gabarito.csv")
    erros = 0
    for tid, g in gab.items():
        s = saida.get(tid)
        dif = ["ausente"] if not s else [c for c in ("categoria", "acao", "pedido") if s[c] != g[c]]
        if dif:
            erros += 1
            print(f"ERRO {tid}: {dif} | esperado {g['categoria']}/{g['acao']}/{g['pedido']}"
                  + (f" | obtido {s['categoria']}/{s['acao']}/{s['pedido']}" if s else ""))
    print(f"Acertos: {len(gab) - erros}/{len(gab)}")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
