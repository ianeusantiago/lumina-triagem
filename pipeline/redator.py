"""Redator: templates em código; só usa campos do CSV. Nunca promete reembolso, prazo novo, desconto ou indenização.

Responde no idioma do ticket (pt, en, es). Os dados do pedido (produto, datas) vêm do CSV como estão.
"""
STATUS = {
    "pt": {"aguardando_producao": "aguardando produção", "em_producao": "em produção", "enviado": "enviado",
           "em_transporte": "em transporte", "entregue": "entregue"},
    "en": {"aguardando_producao": "awaiting production", "em_producao": "in production", "enviado": "shipped",
           "em_transporte": "in transit", "entregue": "delivered"},
    "es": {"aguardando_producao": "esperando producción", "em_producao": "en producción", "enviado": "enviado",
           "em_transporte": "en tránsito", "entregue": "entregado"},
}
T = {
    "pt": {
        "escalado": "Recebemos sua mensagem e ela foi encaminhada para uma atendente da nossa equipe, que vai analisar o seu caso.",
        "pede_numero": "Não localizamos esse pedido. Pode nos informar o número do pedido para verificarmos?",
        "catalogo": "Obrigado pelo interesse! Não temos essa informação de catálogo por aqui; uma atendente pode confirmar os modelos disponíveis.",
        "outro": "Olá! Como podemos ajudar? Conte o assunto e, se for sobre uma compra, o número do pedido.",
        "base": "Pedido {pedido} ({produto}): status {status}",
        "prazo": "{base}, com prazo de entrega previsto para {prazo}.",
        "vencido": "{base}, com prazo de entrega previsto para {prazo}, que já passou. Pedimos desculpas; seu caso fica registrado e acompanhamos a entrega.",
        "cancela": "{base}. Como ainda não entrou em produção, o cancelamento é possível e foi registrado.",
        "foto_defeito": "{base}. Para seguir com a troca, envie uma foto do produto mostrando o problema.",
        "foto": "{base}. Para seguir com a troca, envie uma foto do produto que você recebeu.",
    },
    "en": {
        "escalado": "We received your message and it has been forwarded to a member of our support team, who will review your case.",
        "pede_numero": "We could not find this order. Could you send us the order number so we can check?",
        "catalogo": "Thank you for your interest! We don't have this catalog information here; a support agent can confirm the available models.",
        "outro": "Hello! How can we help? Tell us the subject and, if it is about a purchase, the order number.",
        "base": "Order {pedido} ({produto}): status {status}",
        "prazo": "{base}, with expected delivery on {prazo}.",
        "vencido": "{base}, with expected delivery on {prazo}, which has passed. We are sorry; your case is on record and we are following the delivery.",
        "cancela": "{base}. Since production has not started, the cancellation is possible and has been registered.",
        "foto_defeito": "{base}. To proceed with the exchange, please send a photo of the product showing the problem.",
        "foto": "{base}. To proceed with the exchange, please send a photo of the product you received.",
    },
    "es": {
        "escalado": "Recibimos tu mensaje y fue enviado a una persona de nuestro equipo de atención, que va a analizar tu caso.",
        "pede_numero": "No encontramos ese pedido. ¿Puedes indicarnos el número del pedido para verificarlo?",
        "catalogo": "¡Gracias por tu interés! No tenemos esa información de catálogo aquí; una persona del equipo puede confirmar los modelos disponibles.",
        "outro": "¡Hola! ¿Cómo podemos ayudarte? Cuéntanos el asunto y, si es sobre una compra, el número del pedido.",
        "base": "Pedido {pedido} ({produto}): estado {status}",
        "prazo": "{base}, con entrega prevista para {prazo}.",
        "vencido": "{base}, con entrega prevista para {prazo}, que ya pasó. Lo sentimos; tu caso queda registrado y seguimos la entrega.",
        "cancela": "{base}. Como todavía no entró en producción, la cancelación es posible y quedó registrada.",
        "foto_defeito": "{base}. Para seguir con el cambio, envía una foto del producto mostrando el problema.",
        "foto": "{base}. Para seguir con el cambio, envía una foto del producto que recibiste.",
    },
}
ESCALADO = T["pt"]["escalado"]
PEDE_NUMERO = T["pt"]["pede_numero"]


def redigir(d, p, idioma="pt"):
    t = T.get(idioma, T["pt"])
    if d.acao == "escalar_humano":
        return t["escalado"]
    if not p:
        if d.categoria == "duvida_produto":
            return t["catalogo"]
        if d.categoria == "outro":
            return t["outro"]
        return t["pede_numero"]
    st = STATUS.get(idioma, STATUS["pt"])
    base = t["base"].format(pedido=p["pedido"], produto=p["produto"], status=st.get(p["status"], p["status"]))
    prazo = p["prazo_entrega"]
    if d.categoria == "duvida_produto":
        return t["prazo"].format(base=base, prazo=prazo)
    if d.categoria == "atraso":
        return t["vencido" if d.atrasado else "prazo"].format(base=base, prazo=prazo)
    if d.categoria == "cancelamento":
        return t["cancela"].format(base=base)
    if d.categoria == "troca":
        return t["foto_defeito" if "defeito" in d.motivo else "foto"].format(base=base)
    return t["escalado"]
