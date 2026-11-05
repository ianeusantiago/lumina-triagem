"""Os 4 agentes do fluxo: Leitor -> Juiz -> Redator -> Auditor."""
from __future__ import annotations

import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

Intencao = Literal["atraso", "troca", "cancelamento", "duvida_produto", "outro"]
Sinal = Literal["injecao", "lgpd", "juridico", "erro_cliente", "defeito_nosso", "defeito_ambiguo"]
Categoria = Literal["atraso", "troca", "cancelamento", "duvida_produto", "reclamacao", "lgpd", "outro"]
Acao = Literal["responder_auto", "escalar_humano"]

STATUS_SAIU = {"em_producao", "enviado", "em_transporte"}  # perfil: enviado ~ em_transporte
PRODUTOS = ("caneca", "capinha", "garrafa")


class Leitura(BaseModel):
    """Schema da saída do Leitor (o Leitor com IA devolve exatamente isto)."""
    intencao: Intencao
    pedido_citado: str | None = Field(default=None, pattern=r"^\d{4}$")
    produto_citado: str | None = None
    sinais: list[Sinal] = []


class Decisao(BaseModel):
    categoria: Categoria
    acao: Acao
    pedido: str = ""
    motivo: str


class Linha(BaseModel):
    ticket_id: str
    categoria: Categoria
    acao: Acao
    pedido: str
    resposta: str


# ---------- 1. Leitor (fatia 1: regras de texto; fatia 2: Claude com o mesmo schema) ----------
_SINAIS = {
    "injecao": r"ignore|desconsidere|reembolse",
    "lgpd": r"dados pessoais|apag\w* .*dados|lgpd",
    "juridico": r"procon|processar|advogad|justi[cç]a",
    "erro_cliente": r"digitei|escrevi errado|enviei errad",
    "defeito_nosso": r"cortad|trincad|quebrad|riscad|defeito|rachad",
    "defeito_ambiguo": r"cor diferente|diferente da arte",
}
_INTENCOES = [  # ordem importa
    ("duvida_produto", r"voc[eê]s fazem|tem .* para|fazem .* para"),
    ("cancelamento", r"cancel"),
    ("troca", r"troc"),
    ("atraso", r"cad[eê]|n[aã]o chegou|atrasad|chegar|prazo|chegad"),
]


def ler_regex(texto: str) -> Leitura:
    t = texto.lower()
    intencao = next((i for i, rx in _INTENCOES if re.search(rx, t)), "outro")
    nums = re.findall(r"\b\d{4}\b", t)
    produto = next((p for p in PRODUTOS if p in t), None)
    sinais = [s for s, rx in _SINAIS.items() if re.search(rx, t)]
    return Leitura(intencao=intencao, pedido_citado=nums[0] if nums else None,
                   produto_citado=produto, sinais=sinais)


# ---------- 2. Juiz de Regras (código; única fonte da ação) ----------
def julgar(leitura: Leitura, pedidos: dict[str, dict], hoje: date) -> Decisao:
    p = pedidos.get(leitura.pedido_citado or "")
    num = p["pedido"] if p else ""
    s = set(leitura.sinais)
    H, A = "escalar_humano", "responder_auto"

    if "injecao" in s:
        return Decisao(categoria="outro", acao=H, pedido=num, motivo="regra 6: instrução no ticket")
    if "lgpd" in s:
        return Decisao(categoria="lgpd", acao=H, pedido=num, motivo="regra 5: LGPD")
    if "juridico" in s:
        return Decisao(categoria="reclamacao", acao=H, pedido=num, motivo="regra 5: ameaça jurídica")

    cat = leitura.intencao
    if cat == "outro" or cat == "duvida_produto":
        return Decisao(categoria=cat, acao=A, pedido=num, motivo="sem pedido a decidir")
    if not p:
        return Decisao(categoria=cat, acao=A, pedido="", motivo="regra 4: pedir número")
    if leitura.produto_citado and leitura.produto_citado not in p["produto"].lower():
        return Decisao(categoria=cat, acao=H, pedido=num, motivo="P7: produto citado não bate com o pedido")

    pers = p["personalizado"] == "sim"
    if cat == "cancelamento":
        if p["status"] == "aguardando_producao":
            return Decisao(categoria=cat, acao=A, pedido=num, motivo="regra 3: aguardando produção")
        return Decisao(categoria=cat, acao=H, pedido=num, motivo="regra 3: já em produção/saiu")
    if cat == "troca":
        if not pers:
            return Decisao(categoria=cat, acao=A, pedido=num, motivo="regra 2: não personalizado, pedir foto")
        if "defeito_nosso" in s and not ({"erro_cliente", "defeito_ambiguo"} & s):
            return Decisao(categoria=cat, acao=A, pedido=num, motivo="regra 2: defeito de produção")
        return Decisao(categoria=cat, acao=H, pedido=num, motivo="regra 2: erro do cliente ou ambíguo")
    # atraso / status
    return Decisao(categoria="atraso", acao=A, pedido=num, motivo="regra 1: informar status e prazo")


# ---------- 3. Redator (modelos; só campos do CSV) ----------
ENCAMINHADO = "Olá! Seu caso foi encaminhado para um atendente da nossa equipe, que vai analisar e responder."
PEDIR_NUMERO = "Olá! Para ajudar, pode nos informar o número do seu pedido?"


def redigir(d: Decisao, p: dict | None, hoje: date) -> str:
    if d.acao == "escalar_humano":
        return ENCAMINHADO
    if d.categoria == "outro":
        return "Olá! Como podemos ajudar? Se for sobre um pedido, informe o número dele."
    if d.categoria == "duvida_produto":
        return ("Olá! Obrigado pelo interesse. Vamos verificar a disponibilidade desse modelo "
                "e um atendente confirma para você.")
    if not p:
        return PEDIR_NUMERO
    n, st, prazo = p["pedido"], p["status"].replace("_", " "), p["prazo_entrega"]
    if d.categoria == "cancelamento":
        return f"Olá! O pedido {n} está com status {st}, então o cancelamento é possível. Vamos dar andamento."
    if d.categoria == "troca":
        return f"Olá! Sentimos muito. Para seguir com a troca do pedido {n}, envie uma foto do produto, por favor."
    venc = hoje > date.fromisoformat(prazo) and p["status"] != "entregue"
    extra = " O prazo informado já passou e estamos acompanhando o seu pedido." if venc else ""
    return f"Olá! O pedido {n} está com status {st}. O prazo de entrega registrado é {prazo}.{extra}"


# ---------- 4. Auditor (código; rebaixa para humano se algo não bate) ----------
PROIBIDO = r"reembols|desconto|indeniza|novo prazo|estorn"


def auditar(linha: Linha, pedidos: dict[str, dict]) -> tuple[Linha, list[str]]:
    falhas = []
    if linha.pedido and linha.pedido not in pedidos:
        falhas.append("pedido inexistente")
    permitidas = set()
    if linha.pedido in pedidos:
        p = pedidos[linha.pedido]
        permitidas = {p["prazo_entrega"], p["data_pedido"]}
    for d in re.findall(r"\d{4}-\d{2}-\d{2}", linha.resposta):
        if d not in permitidas:
            falhas.append(f"data fora dos dados: {d}")
    for n in re.findall(r"\b\d{4}\b(?!-)", linha.resposta):
        if n != linha.pedido and n not in {x[:4] for x in permitidas}:
            falhas.append(f"número fora dos dados: {n}")
    if re.search(PROIBIDO, linha.resposta, re.I):
        falhas.append("promessa proibida")
    if falhas and linha.acao == "responder_auto":
        linha = linha.model_copy(update={"acao": "escalar_humano", "resposta": ENCAMINHADO})
    return linha, falhas
