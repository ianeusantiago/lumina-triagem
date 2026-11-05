"""Leitor: Claude interpreta o ticket; saída validada por Pydantic.

Modos: 'api' (ANTHROPIC_API_KEY presente; respostas salvas em /fallback),
'fallback' (respostas salvas), 'regex' (sem IA).
"""
import hashlib
import json
import os

from pydantic import ValidationError

from .dados import RAIZ
from .modelos import Leitura
from .rede import ler_regex

MODELO = "claude-sonnet-5-5"
PROMPT = (RAIZ / "prompts/leitor.md").read_text(encoding="utf-8")
ARQ_FALLBACK = RAIZ / "fallback/leitor.json"


class LeituraInvalida(Exception):
    pass


def chave(texto):
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()[:16]


def _validar(bruto):
    try:
        return Leitura.model_validate_json(bruto.strip().removeprefix("```json").removesuffix("```").strip())
    except (ValidationError, ValueError) as e:
        raise LeituraInvalida(str(e)[:200])


class Leitor:
    def __init__(self, modo=None):
        self.salvas = json.loads(ARQ_FALLBACK.read_text(encoding="utf-8")) if ARQ_FALLBACK.exists() else {}
        if modo is None:
            modo = "api" if os.environ.get("ANTHROPIC_API_KEY") else ("fallback" if self.salvas else "regex")
        self.modo = modo
        self.cliente = None
        if modo == "api":
            import anthropic
            self.cliente = anthropic.Anthropic()

    def _chamar(self, texto):
        # Sonnet 5.5 rejeita temperature != padrão; repetibilidade vem do Juiz em código + fallback salvo.
        r = self.cliente.messages.create(
            model=MODELO,
            max_tokens=1024,
            system=PROMPT,
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": f"<ticket>\n{texto}\n</ticket>"}],
        )
        if r.stop_reason == "refusal":
            raise LeituraInvalida("recusa do modelo")
        return "".join(b.text for b in r.content if b.type == "text")

    def ler(self, texto):
        """Retorna (Leitura | None, brutos). None = inválido 2x -> escalar_humano."""
        if self.modo == "regex":
            return ler_regex(texto), ["regex"]
        brutos = []
        for _ in range(2):
            if self.modo == "fallback":
                bruto = self.salvas.get(chave(texto))
                if bruto is None:
                    return ler_regex(texto), ["sem fallback salvo: regex"]
            else:
                bruto = self._chamar(texto)
            brutos.append(bruto)
            try:
                leitura = _validar(bruto)
                if self.modo == "api":
                    self.salvas[chave(texto)] = bruto
                return leitura, brutos
            except LeituraInvalida:
                if self.modo == "fallback":
                    break
        return None, brutos

    def salvar(self):
        if self.modo == "api":
            ARQ_FALLBACK.parent.mkdir(exist_ok=True)
            ARQ_FALLBACK.write_text(json.dumps(self.salvas, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
