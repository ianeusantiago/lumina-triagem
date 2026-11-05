"""Leitura por regex: rede de segurança do Leitor e modo 'regex' sem IA."""
import re
import unicodedata

from .modelos import Leitura, Sinais

KW = {
    # PT, EN e ES (virada: tickets em outros idiomas)
    "injecao": r"ignore (as |todas )?(as )?regras|ignore.*instru|reembols[ea] (agora|ja)|voce agora e|system prompt|sistema:|classifique como|prometa"
               r"|ignore (all |the )?(previous |prior )?(rules|instructions)|refund (me )?now|you are now"
               r"|ignora (las )?(reglas|instrucciones)|reembolsa(me)? ahora",
    # pedido de exclusão/remoção de dados, conta ou cadastro, em qualquer ordem (verbo antes ou depois)
    "lgpd": r"dados pessoais|lgpd|\b(apag|exclu|remov|delet)\w*\b.{0,40}\b(dados|cadastro|conta)\b"
            r"|\b(dados|cadastro|conta)\b.{0,40}\b(apag|exclu|remov|delet)\w*"
            r"|personal data|gdpr|\b(delete|erase|remove)\b.{0,40}\b(my )?(data|account)\b"
            r"|datos personales|\b(borr|elimin)\w*\b.{0,40}\b(datos|cuenta)\b",
    "juridico": r"procon|processar|process[oa] |advogad|justica|reclame aqui"
                r"|lawyer|attorney|\bsue\b|lawsuit|legal action|consumer protection"
                r"|abogad|demandar|una demanda|denunci",
}
INTENCAO = [
    ("cancelamento", r"cancel"),
    ("troca", r"troca|trocar|devolv|exchange|replace|return (it|my)|cambiar|cambio"),
    # atraso = o cliente reclama que não chegou; só perguntar o prazo é dúvida (regra 1, confirmado pela banca)
    ("atraso", r"cade|nao chegou|atrasad|onde esta|era pra ter chegado|ainda nao recebi"
               r"|where is|has(n't| not) arrived|not arrived|supposed to arrive|\blate\b|still waiting"
               r"|donde esta|no ha llegado|no llego|retrasad|deberia haber llegado"),
    ("duvida_produto", r"prazo|quando chega|vai chegar|chegar|voces (fazem|tem|vendem)|tem (para|pra)|quanto custa"
                       r"|when will|delivery date|estimated delivery|do you (sell|make|have)"
                       r"|cuando llega|plazo de entrega|venden|tienen"),
]
DEFEITO = (r"cortad|trincad|quebrad|defeit|rachad|manchad|riscad|amassad"
           r"|broken|damaged|cracked|defect|scratched|dented|rot[oa]\b|danad|agrietad")
AMBIGUO = r"cor diferente|diferente do que|nao ficou como|nao gostei"
ERRO_CLIENTE = r"digitei|errei o nome|escrevi errado|minha culpa|nome errado"
PRODUTOS = ["capinha", "caneca", "garrafa"]
CRITICOS = ("injecao", "lgpd", "juridico")


def norm(t):
    t = unicodedata.normalize("NFKD", t.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


IDIOMA = {
    "en": r"\b(the|my|is|where|order|it|was|this|will|my|i|you|please|hi|hello)\b",
    "es": r"\b(mi|quiero|el|la|donde|hola|usted|tengo|esta|llego|pedido mi)\b",
    "pt": r"\b(meu|minha|voce|voces|nao|pedido|quero|cade|oi|ola|esta|obrigad\w*)\b",
}


def idioma(texto):
    """Idioma do ticket para o Redator responder igual: pt (padrão), en ou es. O desempate favorece pt."""
    t = norm(texto)
    pontos = {k: len(re.findall(rx, t)) for k, rx in IDIOMA.items()}
    melhor = max(pontos, key=lambda k: (pontos[k], k == "pt"))
    return melhor if pontos[melhor] else "pt"


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
