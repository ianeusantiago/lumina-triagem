import csv
import re
from datetime import date
from pathlib import Path

import pytest

from lumina.agentes import ENCAMINHADO, Leitura, Linha, auditar
from lumina.rodar import carregar, processar

RAIZ = Path(__file__).resolve().parent.parent
HOJE = date(2026, 11, 10)
PEDIDOS, TICKETS = carregar(RAIZ / "data")
with open(RAIZ / "evals" / "gabarito.csv", encoding="utf-8", newline="") as f:
    GAB = {r["ticket_id"]: r for r in csv.DictReader(f)}


@pytest.mark.parametrize("ticket", TICKETS, ids=lambda t: t["ticket_id"])
def test_bate_com_gabarito(ticket):
    linha, _ = processar(ticket, PEDIDOS, HOJE)
    g = GAB[ticket["ticket_id"]]
    assert (linha.categoria, linha.acao, linha.pedido) == (g["categoria"], g["acao"], g["pedido"])


@pytest.mark.parametrize("ticket", TICKETS, ids=lambda t: t["ticket_id"])
def test_resposta_so_usa_dados(ticket):
    linha, _ = processar(ticket, PEDIDOS, HOJE)
    assert not re.search(r"reembols|desconto|indeniza|novo prazo", linha.resposta, re.I)
    p = PEDIDOS.get(linha.pedido, {})
    for d in re.findall(r"\d{4}-\d{2}-\d{2}", linha.resposta):
        assert d in (p.get("prazo_entrega"), p.get("data_pedido"))


def test_auditor_rebaixa_data_inventada():
    l = Linha(ticket_id="X", categoria="atraso", acao="responder_auto", pedido="7003",
              resposta="Chega em 2026-12-01.")
    nova, falhas = auditar(l, PEDIDOS)
    assert nova.acao == "escalar_humano" and nova.resposta == ENCAMINHADO and falhas


def test_auditor_rebaixa_promessa():
    l = Linha(ticket_id="X", categoria="troca", acao="responder_auto", pedido="7011",
              resposta="Vamos fazer o reembolso.")
    assert auditar(l, PEDIDOS)[0].acao == "escalar_humano"


def test_leitor_invalido_escala():
    linha, log = processar({"ticket_id": "X", "texto": "qualquer"}, PEDIDOS, HOJE,
                           leitor=lambda t: {"intencao": "inventada"})
    assert linha.acao == "escalar_humano" and "erro_leitor" in log


def test_pedido_inexistente_fica_vazio():
    linha, _ = processar({"ticket_id": "X", "texto": "Cancelar pedido 1234"}, PEDIDOS, HOJE)
    assert linha.pedido == "" and linha.acao == "responder_auto"


def test_hoje_e_parametro():
    # em 2026-11-01 o 7003 (prazo 11-08) ainda está no prazo: resposta não fala em atraso
    linha, _ = processar({"ticket_id": "X", "texto": "Cadê o 7003?"}, PEDIDOS, date(2026, 11, 1))
    assert "já passou" not in linha.resposta


def test_schema_rejeita_pedido_mal_formado():
    with pytest.raises(Exception):
        Leitura(intencao="atraso", pedido_citado="70a3")
