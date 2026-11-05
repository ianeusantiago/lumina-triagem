"""Juiz de Regras: única fonte de categoria, acao e pedido (data/regras.md + premissas do SPEC)."""
from dataclasses import dataclass, field
from datetime import date

from .rede import norm


@dataclass
class Decisao:
    categoria: str
    acao: str
    pedido: str
    regras: list = field(default_factory=list)
    motivo: str = ""
    critico: bool = False
    prioridade: int = 9
    atrasado: bool = False


def _esc(cat, ped, regra, motivo, prioridade=3, critico=False):
    return Decisao(cat, "escalar_humano", ped, [regra], motivo, critico, prioridade)


def decidir(leitura, pedidos, hoje: date, divergencias=()):
    p = pedidos.get(leitura.pedido_citado or "")
    ped = p["pedido"] if p else ""
    s = leitura.sinais
    it = leitura.intencao

    if s.injecao:
        return _esc("outro", ped, "regra 6 / P3", "instrução embutida no ticket", 0, True)
    if s.lgpd or it == "lgpd":
        return _esc("lgpd", ped, "regra 5 (LGPD)", "pedido de dados/exclusão (LGPD)", 1, True)
    if s.juridico or it == "reclamacao":
        return _esc("reclamacao", ped, "regra 5 / P6", "ameaça jurídica/Procon ou reclamação forte", 2, True)
    if it == "desconhecida":
        return _esc("outro", ped, "SPEC etapa 1", "intenção desconhecida pelo Leitor")

    cat = it if it in ("atraso", "troca", "cancelamento", "duvida_produto") else "outro"
    if divergencias:
        return _esc(cat, ped, "SPEC etapa 1b",
                    "rede de segurança achou sinal não marcado pelo Leitor: " + ",".join(divergencias), 2, True)

    if p and leitura.produto_citado and leitura.produto_citado not in norm(p["produto"]):
        return _esc(cat if cat != "outro" else "atraso", ped, "regra 8 / P7",
                    f"cliente cita '{leitura.produto_citado}', pedido {ped} é '{p['produto']}'")

    if cat == "cancelamento":
        if not p:
            return Decisao(cat, "responder_auto", "", ["regra 4"], "sem pedido válido: pede número")
        if p["status"] == "aguardando_producao":
            return Decisao(cat, "responder_auto", ped, ["regra 3"], "aguardando_producao: cancelamento possível")
        if p["personalizado"] == "sim":
            return _esc(cat, ped, "regra 3", f"personalizado com status {p['status']}")
        return _esc(cat, ped, "P8", f"não personalizado com status {p['status']}")
    if cat == "troca":
        if not p:
            return Decisao(cat, "responder_auto", "", ["regra 4"], "sem pedido válido: pede número")
        if p["status"] != "entregue":
            return _esc(cat, ped, "P9", f"troca antes da entrega (status {p['status']})")
        if p["personalizado"] == "nao":
            return Decisao(cat, "responder_auto", ped, ["regra 2"], "não personalizado: pede foto")
        if s.erro_cliente:
            return _esc(cat, ped, "regra 2", "erro de digitação/arte do cliente")
        if s.defeito_ambiguo:
            return _esc(cat, ped, "P2", "diferença ambígua: defeito nosso ou arquivo do cliente?")
        if s.defeito_nosso:
            return Decisao(cat, "responder_auto", ped, ["regra 2", "P2"], "defeito de produção: pede foto")
        return _esc(cat, ped, "regra 2", "personalizado sem defeito claro")
    if cat == "atraso":
        if not p:
            return Decisao(cat, "responder_auto", "", ["regra 4"], "pedido não encontrado/não citado: pede número")
        atrasado = hoje > date.fromisoformat(p["prazo_entrega"]) and p["status"] != "entregue"
        d = Decisao(cat, "responder_auto", ped, ["regra 1", "P1" if atrasado else "P5"],
                    "prazo vencido: informa status e prazo, sem data nova" if atrasado else "no prazo: informa status e prazo")
        d.atrasado = atrasado
        return d
    if cat == "duvida_produto":
        return Decisao(cat, "responder_auto", ped, ["P4"], "sem catálogo: não confirma nem nega")
    return Decisao("outro", "responder_auto", ped, ["regra 4"], "sem assunto/número: pede detalhes")
