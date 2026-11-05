"""Redator: templates em código; só usa campos do CSV. Nunca promete reembolso, prazo novo, desconto ou indenização."""
STATUS = {
    "aguardando_producao": "aguardando produção",
    "em_producao": "em produção",
    "enviado": "enviado",
    "em_transporte": "em transporte",
    "entregue": "entregue",
}
ESCALADO = "Recebemos sua mensagem e ela foi encaminhada para uma atendente da nossa equipe, que vai analisar o seu caso."
PEDE_NUMERO = "Não localizamos esse pedido. Pode nos informar o número do pedido para verificarmos?"


def redigir(d, p):
    if d.acao == "escalar_humano":
        return ESCALADO
    if not p:
        if d.categoria == "duvida_produto":
            return ("Obrigado pelo interesse! Não temos essa informação de catálogo por aqui; "
                    "uma atendente pode confirmar os modelos disponíveis.")
        if d.categoria == "outro":
            return "Olá! Como podemos ajudar? Conte o assunto e, se for sobre uma compra, o número do pedido."
        return PEDE_NUMERO
    base = f"Pedido {p['pedido']} ({p['produto']}): status {STATUS.get(p['status'], p['status'])}"
    if d.categoria == "duvida_produto":
        return f"{base}, com prazo de entrega previsto para {p['prazo_entrega']}."
    if d.categoria == "atraso":
        if d.atrasado:
            return (f"{base}, com prazo de entrega previsto para {p['prazo_entrega']}, que já passou. "
                    "Pedimos desculpas; seu caso fica registrado e acompanhamos a entrega.")
        return f"{base}, com prazo de entrega previsto para {p['prazo_entrega']}."
    if d.categoria == "cancelamento":
        return f"{base}. Como ainda não entrou em produção, o cancelamento é possível e foi registrado."
    if d.categoria == "troca":
        if "defeito" in d.motivo:
            return f"{base}. Para seguir com a troca, envie uma foto do produto mostrando o problema."
        return f"{base}. Para seguir com a troca, envie uma foto do produto que você recebeu."
    return ESCALADO
