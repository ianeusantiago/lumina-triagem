"use strict";
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ROTULO = { responder_auto: "resposta automática", escalar_humano: "atendente" };
const CHAVE = "lumina-aprovacoes";
let dados = null, triado = false;

function lerAprov() { try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { return {}; } }
function gravarAprov(a) { try { localStorage.setItem(CHAVE, JSON.stringify(a)); } catch {} }

function valido(d) {
  return d && Array.isArray(d.tickets) && d.tickets.every((t) => t && t.ticket_id && typeof t.texto === "string" && t.acao);
}

async function carregar() {
  const fonte = $("#fonte");
  for (const [arq, real] of [["dados/resultado.json", true], ["dados/exemplo.json", false]]) {
    try {
      const r = await fetch(arq, { cache: "no-store" });
      if (!r.ok) continue;
      const d = await r.json();
      if (!valido(d)) throw new Error(arq + " não segue o formato esperado");
      dados = d;
      fonte.className = "fonte" + (real ? "" : " aviso");
      fonte.innerHTML = real
        ? `Dados: <b>resultado.json</b> · gerado em ${esc(d.gerado_em)} · hoje = ${esc(d.hoje)} · modo ${esc(d.modo)}`
        : `Dados: <b>exemplo.json (demonstração)</b> · rode <code>python -m pipeline.rodar</code> para gerar resultado.json`;
      return;
    } catch (e) {
      mostrarErro(`Não foi possível ler ${arq}: ${e.message}`);
      fonte.textContent = "Erro ao carregar dados";
      return;
    }
  }
  mostrarErro("Nenhum arquivo de dados encontrado em web/dados/. Rode o pipeline ou abra a página por um servidor local (python -m http.server dentro de /web).");
  fonte.textContent = "Sem dados";
}

function mostrarErro(msg) {
  dados = null;
  const e = $("#estado"); e.className = "estado erro"; e.setAttribute("role", "alert");
  e.innerHTML = `<strong>Não deu para carregar a triagem.</strong> ${esc(msg)} <button class="secundario" onclick="location.reload()">Tentar de novo</button>`;
  document.querySelectorAll(".tela").forEach((t) => (t.hidden = true));
}

const ordenar = (l) => [...l].sort((a, b) => (b.critico - a.critico) || ((a.prioridade ?? 9) - (b.prioridade ?? 9)) || a.ticket_id.localeCompare(b.ticket_id));
const humanos = () => ordenar(dados.tickets.filter((t) => t.acao === "escalar_humano"));

function card(t, { botao = true, decisao = true, destaque = false } = {}) {
  const cls = ["card", decisao ? (t.critico ? "critico" : t.acao === "escalar_humano" ? "humano" : "auto") : "", destaque ? "destaque" : ""].join(" ");
  const meta = decisao
    ? `<span class="meta">${t.critico ? '<span class="tag crit">⚠ Crítico</span>' : ""}
       <span class="tag ${t.acao === "responder_auto" ? "auto" : "hum"}">${esc(ROTULO[t.acao] || t.acao)}</span>
       <span class="tag">${esc(t.categoria)}</span>${t.pedido ? `<span class="tag">pedido ${esc(t.pedido)}</span>` : ""}</span>`
    : "";
  const tag = botao ? "button" : "div";
  return `<${tag} class="${cls}" ${botao ? `data-abrir="${esc(t.ticket_id)}" aria-label="Ver evidência de ${esc(t.ticket_id)}"` : ""}>
    <span class="id">${esc(t.ticket_id)}</span><span class="txt">${esc(t.texto)}</span>${meta}</${tag}>`;
}

function renderEntrada() {
  const l = dados.tickets;
  $("#lista-entrada").innerHTML = l.length
    ? [...l].sort((a, b) => a.ticket_id.localeCompare(b.ticket_id, undefined, { numeric: true }))
        .map((t) => `<li>${card(t, { botao: false, decisao: false })}</li>`).join("")
    : '<li class="estado">Nenhum ticket na entrada.</li>';
}

function renderResultado() {
  const r = dados.resumo || {};
  const auto = dados.tickets.filter((t) => t.acao === "responder_auto");
  const hum = humanos();
  $("#k-auto").textContent = r.auto ?? auto.length;
  $("#k-humano").textContent = r.humano ?? hum.length;
  $("#k-crit").textContent = r.criticos ?? hum.filter((t) => t.critico).length;
  $("#lista-humano").innerHTML = hum.map((t) => `<li>${card(t)}</li>`).join("") || '<li class="estado">Nenhum caso para a atendente.</li>';
  $("#lista-auto").innerHTML = auto.map((t) => `<li>${card(t)}</li>`).join("") || '<li class="estado">Nenhuma resposta automática.</li>';
  $("#saida-resultado").hidden = false;
  triado = true;
  renderBadge();
}

async function rodar() {
  const b = $("#rodar"); b.disabled = true; b.textContent = "Triando…";
  $("#saida-resultado").hidden = true;
  const passos = [...document.querySelectorAll("#etapas li")];
  passos.forEach((p) => p.classList.remove("ativa", "feita"));
  const espera = matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 650;
  for (const p of passos) {
    p.classList.add("ativa");
    await new Promise((r) => setTimeout(r, espera));
    p.classList.replace("ativa", "feita");
  }
  renderResultado();
  b.disabled = false; b.textContent = "Rodar de novo";
}

function renderAprovacao() {
  const ap = lerAprov();
  const l = humanos();
  $("#lista-aprovacao").innerHTML = l.length ? l.map((t) => {
    const a = ap[t.ticket_id];
    return `<li><div class="card ${t.critico ? "critico" : "humano"} ${a ? "aprovado" : ""}">
      <span class="id">${esc(t.ticket_id)}</span><span class="txt">${esc(t.texto)}</span>
      <span class="meta">${t.critico ? '<span class="tag crit">⚠ Crítico</span>' : ""}<span class="tag">${esc(t.categoria)}</span>
        <span class="tag">${esc(t.evidencia?.motivo || "")}</span></span>
      <div class="aprov">
        <label style="width:100%">Resposta sugerida<textarea rows="2" data-edit="${esc(t.ticket_id)}">${esc(a?.resposta ?? t.resposta)}</textarea></label>
        <button class="primario" data-aprovar="${esc(t.ticket_id)}">${a ? "Aprovado ✓" : "Aprovar"}</button>
        <button class="secundario" data-abrir="${esc(t.ticket_id)}">Ver evidência</button>
      </div></div></li>`;
  }).join("") : '<li class="estado">Nenhum caso escalado. A fila está vazia.</li>';
}

function renderBadge() {
  const ap = lerAprov();
  const pend = humanos().filter((t) => !ap[t.ticket_id]).length;
  $("#badge-fila").textContent = dados && triado ? pend : "";
  $("#badge-fila").setAttribute("aria-label", pend + " pendentes");
}

function renderLog() {
  const log = dados.log || [];
  $("#log-meta").textContent = `Versão ${dados.versao ?? "?"} · hoje = ${dados.hoje ?? "?"} · ${log.length} registros · total ${log.reduce((s, x) => s + (+x.ms || 0), 0)} ms`;
  const sel = $("#filtro-log");
  if (sel.options.length === 1) dados.tickets.forEach((t) => sel.add(new Option(t.ticket_id, t.ticket_id)));
  const f = sel.value;
  const linhas = log.filter((x) => !f || x.ticket_id === f);
  $("#corpo-log").innerHTML = linhas.length ? linhas.map((x) => `<tr><td>${esc(x.ticket_id)}</td><td>${esc(x.etapa)}</td>
    <td>${esc(typeof x.entrada === "object" ? JSON.stringify(x.entrada) : x.entrada)}</td><td>${esc(typeof x.saida === "object" ? JSON.stringify(x.saida) : x.saida)}</td>
    <td class="n">${esc(x.ms)}</td><td>${esc(x.versao)}</td></tr>`).join("") : '<tr><td colspan="6">Sem registros no log.</td></tr>';
}

function abrirEvidencia(id) {
  const t = dados.tickets.find((x) => x.ticket_id === id); if (!t) return;
  const ev = t.evidencia || {}, au = ev.auditor || {}, p = t.pedido_dados;
  $("#ev-titulo").textContent = `${t.ticket_id} · ${t.categoria}`;
  $("#ev-corpo").innerHTML = `<blockquote>${esc(t.texto)}</blockquote>
  <dl>
    <dt>Decisão</dt><dd><strong>${esc(ROTULO[t.acao] || t.acao)}</strong>${t.critico ? ' <span class="tag crit">⚠ Crítico</span>' : ""}</dd>
    <dt>Sinais do Leitor</dt><dd>${(ev.sinais || []).length ? ev.sinais.map((s) => `<span class="tag">${esc(s)}</span>`).join(" ") : "nenhum"}</dd>
    <dt>Leitor × rede</dt><dd>${esc(ev.leitor_vs_rede || "—")}</dd>
    <dt>Regra aplicada</dt><dd>${esc((ev.regras || []).join(", ") || "—")}</dd>
    <dt>Motivo</dt><dd>${esc(ev.motivo || "—")}</dd>
    <dt>Auditor</dt><dd>${au.aprovado ? '<span class="ok">✓ aprovado</span>' : '<span class="falha">✗ reprovado</span>'}${(au.falhas || []).length ? ": " + au.falhas.map(esc).join("; ") : ""}</dd>
    <dt>Pedido</dt><dd>${p ? `${esc(p.pedido)} · ${esc(p.produto)} · personalizado: ${esc(p.personalizado)} · status <b>${esc(p.status)}</b> · pedido em ${esc(p.data_pedido)} · prazo ${esc(p.prazo_entrega)}`
      : t.pedido ? esc(t.pedido) : "nenhum pedido válido citado"}</dd>
    <dt>Resposta sugerida</dt><dd>${esc(t.resposta || "—")}</dd>
  </dl>`;
  const d = $("#evidencia"); d.showModal();
}

function ir(tela) {
  if (!dados) return;
  document.querySelectorAll(".abas button").forEach((b) => b.dataset.tela === tela ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  document.querySelectorAll(".tela").forEach((s) => (s.hidden = s.id !== "tela-" + tela));
  if (tela === "aprovacao") renderAprovacao();
  if (tela === "log") renderLog();
  history.replaceState(null, "", "#" + tela);
  $("#principal").focus({ preventScroll: true });
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-tela],[data-ir],[data-abrir],[data-aprovar],.fechar,#rodar,#limpar");
  if (!el) return;
  if (el.dataset.tela || el.dataset.ir) ir(el.dataset.tela || el.dataset.ir);
  else if (el.dataset.abrir) abrirEvidencia(el.dataset.abrir);
  else if (el.dataset.aprovar) {
    const id = el.dataset.aprovar, ap = lerAprov();
    if (ap[id]) delete ap[id]; else ap[id] = { resposta: document.querySelector(`[data-edit="${CSS.escape(id)}"]`).value, em: new Date().toISOString() };
    gravarAprov(ap); renderAprovacao(); renderBadge();
  } else if (el.classList.contains("fechar")) $("#evidencia").close();
  else if (el.id === "rodar") rodar();
  else if (el.id === "limpar") { gravarAprov({}); renderAprovacao(); renderBadge(); }
});
$("#filtro-log").addEventListener("change", renderLog);
$("#evidencia").addEventListener("click", (e) => { if (e.target.id === "evidencia") e.target.close(); });

carregar().then(() => {
  if (!dados) return;
  renderEntrada();
  const t = location.hash.slice(1);
  ir(["entrada", "resultado", "aprovacao", "log"].includes(t) ? t : "entrada");
});
