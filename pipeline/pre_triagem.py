"""Pré-triagem da entrada: urgência por regras em código, sem IA e sem consultar pedidos.

Só ordena a fila de entrada para a atendente escolher o que triar primeiro.
Quem decide `acao` continua sendo o Juiz, na triagem.
"""
import re

from .rede import AMBIGUO, DEFEITO, ERRO_CLIENTE, INTENCAO, ler_regex, norm, sinais_criticos

# Mesmo padrão de reclamação de atraso da rede (PT, EN e ES), para a urgência não divergir da triagem.
ATRASO_RECLAMADO = dict(INTENCAO)["atraso"]
URGENCIAS = ("urgente", "media", "baixa")
MOTIVO_CRITICO = {"juridico": "ameaça jurídica / Procon", "lgpd": "pedido LGPD", "injecao": "tentativa de manipulação"}


def classificar(ticket_id, texto):
    t = norm(texto)
    crit = [k for k, v in sinais_criticos(texto).items() if v]
    leitura = ler_regex(texto)
    if crit:
        urg, motivo = "urgente", ", ".join(MOTIVO_CRITICO[k] for k in crit)
    elif re.search(DEFEITO, t):
        urg, motivo = "media", "relato de defeito"
    elif re.search(AMBIGUO, t):
        urg, motivo = "media", "produto diferente do esperado"
    elif re.search(ERRO_CLIENTE, t):
        urg, motivo = "media", "erro na personalização"
    elif re.search(ATRASO_RECLAMADO, t):
        urg, motivo = "media", "reclamação de atraso"
    elif leitura.intencao in ("cancelamento", "troca"):
        urg, motivo = "baixa", f"pedido de {leitura.intencao}"
    elif leitura.intencao == "atraso" or (leitura.intencao == "duvida_produto" and leitura.pedido_citado):
        urg, motivo = "baixa", "consulta de prazo"
    else:
        urg, motivo = "baixa", "dúvida ou mensagem sem pedido"
    return {
        "ticket_id": ticket_id,
        "texto": texto,
        "urgencia": urg,
        "motivo": motivo,
        "categoria_prevista": leitura.intencao,
        "pedido_citado": leitura.pedido_citado,
    }


def pre_triar(tickets):
    return [classificar(t["ticket_id"], t["texto"]) for t in tickets]
