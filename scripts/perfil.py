"""Perfil de data/pedidos.csv e data/tickets.csv. Só stdlib. Uso: python scripts/perfil.py"""
import csv
import re
from collections import Counter
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
HOJE = date(2026, 11, 10)


def ler(nome):
    with open(DATA / nome, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def tipo(v):
    if v == "":
        return "vazio"
    if re.fullmatch(r"-?\d+", v):
        return "int"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        return "data"
    return "texto"


def perfil_colunas(nome, linhas):
    print(f"\n## {nome}: {len(linhas)} linhas")
    for col in linhas[0].keys():
        vals = [r[col] for r in linhas]
        tipos = Counter(tipo(v.strip()) for v in vals)
        nulos = sum(1 for v in vals if v.strip() == "")
        dup = [v for v, n in Counter(vals).items() if n > 1]
        espacos = sum(1 for v in vals if v != v.strip())
        print(f"- {col}: tipos={dict(tipos)} nulos={nulos} distintos={len(set(vals))} "
              f"duplicados={dup[:5]} espacos_extras={espacos}")
    linhas_dup = len(linhas) - len({tuple(r.values()) for r in linhas})
    print(f"- linhas duplicadas inteiras: {linhas_dup}")


def main():
    pedidos = ler("pedidos.csv")
    tickets = ler("tickets.csv")
    perfil_colunas("pedidos.csv", pedidos)
    perfil_colunas("tickets.csv", tickets)

    print("\n## Pedidos: domínios e datas")
    for col in ("personalizado", "status", "produto"):
        print(f"- {col}: {dict(Counter(p[col] for p in pedidos))}")
    d = lambda s: date.fromisoformat(s)
    prazos = [(d(p["prazo_entrega"]) - d(p["data_pedido"])).days for p in pedidos]
    print(f"- dias entre pedido e prazo: min={min(prazos)} max={max(prazos)} valores={sorted(Counter(prazos).items())}")
    print(f"- data_pedido: {min(p['data_pedido'] for p in pedidos)} a {max(p['data_pedido'] for p in pedidos)}")
    print(f"- prazo_entrega: {min(p['prazo_entrega'] for p in pedidos)} a {max(p['prazo_entrega'] for p in pedidos)}")
    futuro = [p["pedido"] for p in pedidos if d(p["data_pedido"]) > HOJE]
    hoje = [p["pedido"] for p in pedidos if d(p["data_pedido"]) == HOJE]
    print(f"- data_pedido no futuro: {futuro} | igual a hoje: {hoje}")
    atrasados = [p["pedido"] for p in pedidos if HOJE > d(p["prazo_entrega"]) and p["status"] != "entregue"]
    print(f"- atrasados (hoje > prazo e status != entregue): {atrasados}")
    entregue_sem_data = [p["pedido"] for p in pedidos if p["status"] == "entregue"]
    print(f"- entregues (sem data de entrega real no CSV): {entregue_sem_data}")
    enviado_vs_transp = Counter(p["status"] for p in pedidos if p["status"] in ("enviado", "em_transporte"))
    print(f"- status 'enviado' e 'em_transporte' coexistem: {dict(enviado_vs_transp)}")

    print("\n## Tickets: tamanho e números citados")
    tam = [len(t["texto"]) for t in tickets]
    print(f"- caracteres: min={min(tam)} max={max(tam)}")
    ids_pedido = {p["pedido"] for p in pedidos}
    sem_num, inexistente, citados = [], [], Counter()
    for t in tickets:
        nums = re.findall(r"\b\d{4}\b", t["texto"])
        if not nums:
            sem_num.append(t["ticket_id"])
        for n in nums:
            citados[n] += 1
            if n not in ids_pedido:
                inexistente.append((t["ticket_id"], n))
        outros = re.findall(r"\d+", t["texto"])
        extras = [x for x in outros if x not in nums]
        if extras:
            print(f"- {t['ticket_id']}: números que NÃO são pedido: {extras}")
        if len(set(nums)) > 1:
            print(f"- {t['ticket_id']}: mais de um pedido citado: {nums}")
    print(f"- sem número de pedido: {sem_num}")
    print(f"- número citado que não existe em pedidos.csv: {inexistente}")
    print(f"- pedidos citados por mais de um ticket: {[k for k, v in citados.items() if v > 1]}")
    print(f"- pedidos nunca citados: {sorted(ids_pedido - set(citados))}")

    print("\n## Cruzamento ticket x pedido")
    por_id = {p["pedido"]: p for p in pedidos}
    for t in tickets:
        for n in set(re.findall(r"\b\d{4}\b", t["texto"])):
            p = por_id.get(n)
            if p:
                atrasado = HOJE > d(p["prazo_entrega"]) and p["status"] != "entregue"
                print(f"- {t['ticket_id']} -> {n}: {p['produto']} | pers={p['personalizado']} | "
                      f"{p['status']} | prazo={p['prazo_entrega']} | atrasado={atrasado}")
    gatilhos = {
        "juridico": r"procon|processar|advogad|justi",
        "lgpd": r"dados pessoais|apaguem|excluir|lgpd",
        "injecao": r"ignore|reembolse|desconsidere",
        "data_no_texto": r"dia \d+|\d+ dias",
    }
    for nome, rx in gatilhos.items():
        hits = [t["ticket_id"] for t in tickets if re.search(rx, t["texto"], re.I)]
        print(f"- termos {nome}: {hits}")


if __name__ == "__main__":
    main()
