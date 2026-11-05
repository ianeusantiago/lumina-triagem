"""Leitor: a IA interpreta o ticket; saída validada por Pydantic.

Modos: 'api' (Claude; ANTHROPIC_API_KEY presente; respostas salvas em /fallback),
'ollama' (modelo local e gratuito via Ollama; mesmo prompt e mesma validação),
'fallback' (respostas salvas do Claude), 'regex' (sem IA).
Em qualquer modo a IA só lê: a ação continua sendo decidida pelo Juiz em código.
"""
import hashlib
import json
import os
import urllib.error
import urllib.request

from pydantic import ValidationError

from .dados import RAIZ
from .modelos import Leitura
from .rede import ler_regex

MODELO = "claude-sonnet-5-5"
OLLAMA_URL = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
OLLAMA_MODELO = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")
PROMPT = (RAIZ / "prompts/leitor.md").read_text(encoding="utf-8")
ARQ_FALLBACK = RAIZ / "fallback/leitor.json"


def _schema_sem_refs():
    """JSON Schema da Leitura com os $defs embutidos (o Ollama usa o schema para restringir a saída)."""
    s = Leitura.model_json_schema()
    defs = s.pop("$defs", {})

    def troca(n):
        if isinstance(n, dict):
            if "$ref" in n:
                return troca(defs[n["$ref"].split("/")[-1]])
            return {k: troca(v) for k, v in n.items()}
        if isinstance(n, list):
            return [troca(v) for v in n]
        return n
    return troca(s)


def ollama_disponivel(timeout=0.8):
    """True se o servidor do Ollama responde e tem o modelo configurado."""
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=timeout) as r:
            nomes = {m.get("name") for m in json.load(r).get("models", [])}
        return OLLAMA_MODELO in nomes
    except (urllib.error.URLError, OSError, ValueError):
        return False


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
            if os.environ.get("ANTHROPIC_API_KEY"):
                modo = "api"
            elif ollama_disponivel():
                modo = "ollama"
            else:
                modo = "fallback" if self.salvas else "regex"
        self.modo = modo
        self.cliente = None
        self.schema = _schema_sem_refs()
        if modo == "api":
            import anthropic
            self.cliente = anthropic.Anthropic()

    def _chamar_ollama(self, texto):
        corpo = {
            "model": OLLAMA_MODELO,
            "stream": False,
            "format": self.schema,
            "options": {"temperature": 0},
            "messages": [
                {"role": "system", "content": PROMPT},
                {"role": "user", "content": f"<ticket>\n{texto}\n</ticket>"},
            ],
        }
        req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=json.dumps(corpo).encode("utf-8"),
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)["message"]["content"]
        except (urllib.error.URLError, OSError, KeyError, ValueError) as e:
            raise LeituraInvalida(f"ollama: {e.__class__.__name__}")

    def _chamar(self, texto):
        if self.modo == "ollama":
            return self._chamar_ollama(texto)
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
                try:
                    bruto = self._chamar(texto)
                except LeituraInvalida as e:  # falha de rede/servidor conta como tentativa inválida
                    brutos.append(str(e))
                    continue
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
