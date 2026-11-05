"""Leitura por regex: rede de segurança do Leitor e modo 'regex' sem IA."""
import re
import unicodedata

from .modelos import Leitura, Sinais

KW = {
    "injecao": r"ignore (as |todas )?(as )?regras|ignore.*instru|reembols[ea] (agora|ja)|voce agora e|system prompt|sistema:|classifique como|prometa",
    # pedido de exclusão/remoção de dados, conta ou cadastro, em qualquer ordem (verbo antes ou depois)
    "lgpd": r"dados pessoais|lgpd|\b(apag|exclu|remov|delet)\w*\b.{0,40}\b(dados|cadastro|conta)\b"
            r"|\b(dados|cadastro|conta)\b.{0,40}\b(apag|exclu|remov|delet)\w*",
    "juridico": r"procon|processar|process[oa] |advogad|justica|reclame aqui",
}
INTENCAO = [
    ("cancelamento", r"cancel"),
    ("troca", r"troca|trocar|devolv"),
    # atraso = o cliente reclama que não chegou; só perguntar o prazo é dúvida (regra 1, confirmado pela banca)
    ("atraso", r"cade|nao chegou|atrasad|onde esta|era pra ter chegado|ainda nao recebi"),
    ("duvida_produto", r"prazo|quando chega|vai chegar|chegar|voces (fazem|tem|vendem)|tem (para|pra)|quanto custa"),
]
DEFEITO = r"cortad|trincad|quebrad|defeit|rachad|manchad|riscad|amassad"
AMBIGUO = r"cor diferente|diferente do que|nao ficou como|nao gostei"
ERRO_CLIENTE = r"digitei|errei o nome|escrevi errado|minha culpa|nome errado"
PRODUTOS = ["capinha", "caneca", "garrafa"]
CRITICOS = ("injecao", "lgpd", "juridico")


def norm(t):
    t = unicodedata.normalize("NFKD", t.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def sinais_criticos(texto):
    t = norm(texto)
    return {k: bool(re.search(KW[k], t)) for k in CRITICOS}


def ler_regex(texto):
    t = norm(texto)
    nums = re.findall(r"\b\d{4}\b", t)
    crit = sinais_criticos(texto)
    amb = bool(re.search(AMBIGUO, t))
    intencao = "outro"
    for nome, rx in INTENCAO:
        if re.search(rx, t):
            intencao = nome
            break
    if intencao == "outro" and (amb or re.search(DEFEITO, t)):
        intencao = "troca"  # defeito relatado prevalece sobre o "atraso" deduzido só pelo número do pedido
    if intencao == "outro" and nums:
        intencao = "atraso"
    if crit["lgpd"]:
        intencao = "lgpd"
    elif crit["juridico"]:
        intencao = "reclamacao"
    prod = next((p for p in PRODUTOS if p in t), None)
    return Leitura(
        intencao=intencao,
        pedido_citado=nums[0] if nums else None,
        produto_citado=prod,
        sinais=Sinais(
            **crit,
            erro_cliente=bool(re.search(ERRO_CLIENTE, t)),
            defeito_nosso=bool(re.search(DEFEITO, t)),
            defeito_ambiguo=amb,
        ),
    )


def comparar(leitura, texto):
    """Rede de segurança: sinais críticos que o regex achou e o Leitor não marcou."""
    rede = sinais_criticos(texto)
    return [k for k in CRITICOS if rede[k] and not getattr(leitura.sinais, k)]
