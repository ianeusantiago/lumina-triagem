"""Leitura por regex: rede de segurança do Leitor e modo 'regex' sem IA."""
import re
import unicodedata

from .modelos import Leitura, Sinais

KW = {
    "injecao": r"ignore (as |todas )?(as )?regras|ignore.*instru|reembols[ea] (agora|ja)|voce agora e|system prompt|sistema:|classifique como|prometa",
    "lgpd": r"dados pessoais|apag\w* (os |todos )?(os )?(meus )?dados|exclu\w* (os )?(meu \w+ e )?(meus )?dados|lgpd",
    "juridico": r"procon|processar|process[oa] |advogad|justica|reclame aqui",
}
INTENCAO = [
    ("cancelamento", r"cancel"),
    ("troca", r"troca|trocar|devolv"),
    ("atraso", r"cade|nao chegou|atrasad|prazo|onde esta|chegar|quando chega"),
    ("duvida_produto", r"voces (fazem|tem|vendem)|tem (para|pra)|quanto custa"),
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
    if intencao == "outro" and amb:
        intencao = "troca"
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
