"""Contratos: saída do Leitor e resultado.json consumido pela UI (/web)."""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Categoria = Literal["atraso", "troca", "cancelamento", "duvida_produto", "reclamacao", "lgpd", "outro"]
Acao = Literal["responder_auto", "escalar_humano"]
Intencao = Literal["atraso", "troca", "cancelamento", "duvida_produto", "reclamacao", "lgpd", "outro", "desconhecida"]


class Sinais(BaseModel):
    model_config = ConfigDict(extra="forbid")
    injecao: bool = False
    lgpd: bool = False
    juridico: bool = False
    erro_cliente: bool = False
    defeito_nosso: bool = False
    defeito_ambiguo: bool = False


class Leitura(BaseModel):
    """Saída do Leitor (IA). Validada; inválida 2x -> escalar_humano."""
    model_config = ConfigDict(extra="forbid")
    intencao: Intencao
    pedido_citado: Optional[str] = Field(None, description="número de 4 dígitos citado, ou null")
    produto_citado: Optional[Literal["capinha", "caneca", "garrafa"]] = None
    sinais: Sinais


class Auditoria(BaseModel):
    aprovado: bool
    falhas: list[str] = []


class Evidencia(BaseModel):
    sinais: list[str]
    regras: list[str]
    motivo: str
    auditor: Auditoria
    leitor_vs_rede: str


class TicketResultado(BaseModel):
    ticket_id: str
    texto: str
    categoria: Categoria
    acao: Acao
    pedido: str
    resposta: str
    critico: bool
    prioridade: int = Field(description="menor = mais urgente")
    evidencia: Evidencia
    pedido_dados: Optional[dict[str, str]] = None


class Resumo(BaseModel):
    total: int
    auto: int
    humano: int
    criticos: int


class LogEntrada(BaseModel):
    ticket_id: str
    etapa: str
    entrada: object
    saida: object
    ms: float
    versao: str


class Resultado(BaseModel):
    gerado_em: str
    hoje: str
    versao: str
    modo: Literal["api", "fallback", "regex"]
    resumo: Resumo
    tickets: list[TicketResultado]
    log: list[LogEntrada]


if __name__ == "__main__":
    import json
    from pathlib import Path
    raiz = Path(__file__).resolve().parent.parent
    (raiz / "schemas/resultado.schema.json").write_text(json.dumps(Resultado.model_json_schema(), ensure_ascii=False, indent=2), encoding="utf-8")
    (raiz / "schemas/leitura.schema.json").write_text(json.dumps(Leitura.model_json_schema(), ensure_ascii=False, indent=2), encoding="utf-8")
