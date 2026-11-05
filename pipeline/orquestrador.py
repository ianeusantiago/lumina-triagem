"""Orquestrador: Leitor + rede -> Juiz -> Redator -> Auditor, com log por etapa."""
import time

from . import VERSAO
from .auditor import auditar
from .juiz import Decisao, decidir
from .modelos import Evidencia, TicketResultado
from .redator import ESCALADO, redigir
from .rede import comparar, idioma


def processar(tid, texto, leitor, pedidos, hoje, log):
    def reg(etapa, entrada, saida, t0):
        log.append(dict(ticket_id=tid, etapa=etapa, entrada=entrada, saida=saida,
                        ms=round((time.perf_counter() - t0) * 1000, 2), versao=VERSAO))

    t0 = time.perf_counter()
    leitura, brutos = leitor.ler(texto)
    reg("leitor", texto, leitura.model_dump() if leitura else {"invalido": brutos}, t0)

    t0 = time.perf_counter()
    if leitura is None:
        d = Decisao("outro", "escalar_humano", "", ["SPEC etapa 1"], "saída do Leitor inválida 2x", False, 3)
        div, rede_txt = [], "Leitor inválido: sem comparação"
        sinais = []
    else:
        div = comparar(leitura, texto)
        rede_txt = ("discorda: regex achou " + ",".join(div)) if div else "concorda"
        reg("rede", texto, rede_txt, t0)
        t0 = time.perf_counter()
        d = decidir(leitura, pedidos, hoje, div)
        sinais = [k for k, v in leitura.sinais.model_dump().items() if v]
    reg("juiz", leitura.model_dump() if leitura else None, d.__dict__.copy(), t0)

    t0 = time.perf_counter()
    p = pedidos.get(d.pedido)
    resposta = redigir(d, p, idioma(texto))
    reg("redator", d.__dict__.copy(), resposta, t0)

    t0 = time.perf_counter()
    linha = dict(categoria=d.categoria, acao=d.acao, pedido=d.pedido, resposta=resposta)
    aud = auditar(linha, leitura, pedidos) if leitura else auditar(linha, _Vazio, pedidos)
    if not aud.aprovado:
        d.acao, d.prioridade, resposta = "escalar_humano", min(d.prioridade, 3), ESCALADO
        d.motivo += " | auditor: " + "; ".join(aud.falhas)
    reg("auditor", linha, aud.model_dump(), t0)

    return TicketResultado(
        ticket_id=tid, texto=texto, categoria=d.categoria, acao=d.acao, pedido=d.pedido,
        resposta=resposta, critico=d.critico, prioridade=d.prioridade,
        evidencia=Evidencia(sinais=sinais, regras=d.regras, motivo=d.motivo, auditor=aud, leitor_vs_rede=rede_txt),
        pedido_dados=dict(p) if p else None,
    )


class _Vazio:
    produto_citado = None
