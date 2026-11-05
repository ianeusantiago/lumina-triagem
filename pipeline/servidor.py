"""python -m pipeline.servidor [--porta 8765] [--hoje AAAA-MM-DD]

Serve o site (/web) e recebe um CSV de tickets em POST /api/triar.
A triagem roda aqui, no mesmo pipeline do `rodar` (Leitor, Juiz, Redator, Auditor):
o navegador só envia o arquivo e mostra o resultado. Nada é gravado em disco.
"""
import argparse
import csv
import io
import json
import sys
from datetime import date
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from .dados import RAIZ
from .rodar import executar, montar

LIMITE_BYTES = 2_000_000
LIMITE_TICKETS = 5000


class CSVInvalido(ValueError):
    pass


def ler_csv_tickets(conteudo: bytes):
    """Valida o CSV (colunas ticket_id,texto; ids únicos; texto não vazio). O texto é conteúdo, nunca instrução."""
    if len(conteudo) > LIMITE_BYTES:
        raise CSVInvalido(f"arquivo maior que {LIMITE_BYTES // 1_000_000} MB")
    try:
        texto = conteudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CSVInvalido("o arquivo precisa estar em UTF-8")
    amostra = texto[:2048]
    try:
        dialeto = csv.Sniffer().sniff(amostra, delimiters=",;")
    except csv.Error:
        dialeto = csv.excel
    leitor = csv.DictReader(io.StringIO(texto), dialect=dialeto)
    campos = [c.strip().lower() for c in (leitor.fieldnames or [])]
    if "ticket_id" not in campos or "texto" not in campos:
        raise CSVInvalido("o CSV precisa das colunas ticket_id e texto")
    tickets, vistos, erros = [], set(), []
    for n, linha in enumerate(leitor, start=2):
        linha = {(k or "").strip().lower(): (v or "").strip() for k, v in linha.items()}
        tid, txt = linha.get("ticket_id", ""), linha.get("texto", "")
        if not tid and not txt:
            continue
        if not tid:
            erros.append(f"linha {n}: ticket_id vazio")
        elif tid in vistos:
            erros.append(f"linha {n}: ticket_id {tid} repetido")
        elif not txt:
            erros.append(f"linha {n}: texto vazio ({tid})")
        else:
            vistos.add(tid)
            tickets.append({"ticket_id": tid, "texto": txt})
    if erros:
        raise CSVInvalido("; ".join(erros[:5]) + (f" (e mais {len(erros) - 5})" if len(erros) > 5 else ""))
    if not tickets:
        raise CSVInvalido("nenhum ticket encontrado")
    if len(tickets) > LIMITE_TICKETS:
        raise CSVInvalido(f"máximo de {LIMITE_TICKETS} tickets por arquivo")
    return tickets


def triar_csv(conteudo: bytes, hoje: date):
    tickets = ler_csv_tickets(conteudo)
    modo, res, log = executar(hoje, None, tickets)
    resultado, entrada = montar(hoje, modo, res, log, tickets)
    return {"resultado": json.loads(resultado.model_dump_json()), "entrada": entrada}


class Handler(SimpleHTTPRequestHandler):
    hoje = date(2026, 11, 10)

    def _json(self, status, corpo):
        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_GET(self):
        if self.path == "/api/status":
            return self._json(200, {"ok": True, "hoje": str(self.hoje)})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/triar":
            return self._json(404, {"erro": "rota não encontrada"})
        tamanho = int(self.headers.get("Content-Length") or 0)
        if tamanho > LIMITE_BYTES:
            return self._json(413, {"erro": "arquivo grande demais"})
        try:
            return self._json(200, triar_csv(self.rfile.read(tamanho), self.hoje))
        except CSVInvalido as e:
            return self._json(400, {"erro": str(e)})
        except Exception as e:  # erro inesperado: avisa sem derrubar o servidor
            return self._json(500, {"erro": f"falha ao triar: {e.__class__.__name__}"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=8765)
    ap.add_argument("--hoje", default="2026-11-10")
    a = ap.parse_args()
    Handler.hoje = date.fromisoformat(a.hoje)
    srv = ThreadingHTTPServer(("127.0.0.1", a.porta), partial(Handler, directory=str(RAIZ / "web")))
    print(f"Lumina Triagem em http://localhost:{a.porta} (hoje={a.hoje}). Ctrl+C para parar.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
