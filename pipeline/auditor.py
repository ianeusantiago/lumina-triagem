"""Auditor: confere a linha final; qualquer falha rebaixa para escalar_humano."""
import re

from .modelos import Auditoria
from .rede import norm

PROIBIDO = r"reembols|estorn|desconto|indeniza|novo prazo|nova data|ressarc|compensa"


def auditar(linha, leitura, pedidos):
    falhas = []
    ped = linha["pedido"]
    p = pedidos.get(ped)
    if ped and not p:
        falhas.append(f"pedido {ped} não existe no CSV")
    resp = linha["resposta"]
    datas_ok = {p["data_pedido"], p["prazo_entrega"]} if p else set()
    for dt in re.findall(r"\d{4}-\d{2}-\d{2}|\b\d{1,2}/\d{1,2}\b", resp):
        if dt not in datas_ok:
            falhas.append(f"data '{dt}' fora dos dados do pedido")
    sem_datas = re.sub(r"\d{4}-\d{2}-\d{2}", "", resp)
    for n in re.findall(r"\d+", sem_datas):
        if n != ped and not (p and n in p["produto"]):
            falhas.append(f"número '{n}' fora dos dados")
    if re.search(PROIBIDO, norm(resp)):
        falhas.append("promessa proibida (regra 7)")
    # Produto citado diferente do pedido não reprova: a resposta só usa dados do CSV (P7 revista pela banca).
    return Auditoria(aprovado=not falhas, falhas=falhas)
