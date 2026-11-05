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
  e.innerHTML = `<strong>Não deu para carregar a triagem.</strong> ${esc(msg)} <button class="btn btn--fantasma" onclick="location.reload()">Tentar de novo</button>`;
  document.querySelectorAll(".tela").forEach((t) => (t.hidden = true));
}

const pos = (t) => dados.tickets.indexOf(t);
const ordenar = (l) => [...l].sort((a, b) => ((a.prioridade ?? 9) - (b.prioridade ?? 9)) || (pos(a) - pos(b)));
const foco = new URLSearchParams(location.search).get("ticket");
const humanos = () => ordenar(dados.tickets.filter((t) => t.acao === "escalar_humano"));

const SINAL = { juridico: ["bad", "jurídico / Procon"], lgpd: ["bad", "LGPD"], injecao: ["warn", "manipulação"],
  erro_cliente: ["info", "erro do cliente"], defeito_nosso: ["info", "defeito nosso"], defeito_ambiguo: ["info", "defeito ambíguo"] };
const ICO = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const tom = (t) => t.acao === "responder_auto" ? "auto" : (t.evidencia?.sinais || []).includes("injecao") ? "manip" : t.critico ? "critico" : "humano";
function selos(t) {
  const s = (t.evidencia?.sinais || []).filter((x) => SINAL[x]).map((x) => `<span class="selo selo--${SINAL[x][0]}">${SINAL[x][0] === "bad" ? ICO("alerta") : ""}${esc(SINAL[x][1])}</span>`);
  s.push(t.acao === "responder_auto" ? `<span class="selo selo--ok">${ICO("check")}respondido</span>` : `<span class="selo selo--info">atendente</span>`);
  s.push(`<span class="selo selo--neutro">${esc(t.categoria)}</span>`);
  if (t.pedido) s.push(`<span class="selo selo--neutro">pedido ${esc(t.pedido)}</span>`);
  return s.join("");
}

function card(t, { botao = true, decisao = true, destaque = false, i = 0 } = {}) {
  const cls = ["tk", decisao ? tom(t) : "", destaque ? "destaque" : ""].join(" ");
  const tag = botao ? "button" : "div";
  return `<${tag} class="${cls}" style="--i:${i}" ${botao ? `data-abrir="${esc(t.ticket_id)}" aria-label="Ver evidência de ${esc(t.ticket_id)}"` : ""}>
    <span class="tk__topo"><span class="id">${esc(t.ticket_id)}</span>${botao ? '<span class="id">ver evidência →</span>' : ""}</span>
    <span class="txt">${esc(t.texto)}</span>${decisao ? `<span class="meta">${selos(t)}</span>` : ""}</${tag}>`;
}

function renderEntrada() {
  const num = (t) => parseInt(String(t.ticket_id).replace(/\D/g, ""), 10) || 0;
  const l = [...dados.tickets].sort((a, b) => num(a) - num(b));
  $("#lista-entrada").innerHTML = l.length
    ? l.map((t, i) => `<li>${card(t, { botao: false, decisao: false, destaque: t.ticket_id === foco, i })}</li>`).join("")
    : '<li class="estado">Nenhum ticket na entrada.</li>';
  $("#h-total").textContent = l.length; $("#h-hoje").textContent = dados.hoje ?? "—"; $("#h-modo").textContent = dados.modo === "regex" ? "regras (reserva)" : (dados.modo ?? "—");
  const alvo = l.find((t) => t.ticket_id === foco);
  if (alvo) {
    $("#gatilho").hidden = false;
    $("#gatilho").innerHTML = `<span class="etiqueta">Ticket em foco</span> <span class="id">${esc(alvo.ticket_id)}</span> <span class="txt">${esc(alvo.texto)}</span>
      <small>Posição ${l.indexOf(alvo) + 1} de ${l.length} na fila</small>`;
  }
}

function renderResultado() {
  const r = dados.resumo || {};
  const auto = dados.tickets.filter((t) => t.acao === "responder_auto");
  const hum = humanos();
  $("#k-auto").textContent = r.auto ?? auto.length;
  $("#k-humano").textContent = r.humano ?? hum.length;
  $("#k-crit").textContent = r.criticos ?? hum.filter((t) => t.critico).length;
  $("#lista-humano").innerHTML = hum.map((t, i) => `<li>${card(t, { i })}</li>`).join("") || '<li class="estado">Nenhum caso para a atendente.</li>';
  $("#lista-auto").innerHTML = auto.map((t, i) => `<li>${card(t, { i })}</li>`).join("") || '<li class="estado">Nenhuma resposta automática.</li>';
  $("#saida-resultado").hidden = false;
  triado = true;
  renderBadge();
}

async function rodar() {
  const b = $("#rodar"), bt = b.querySelector("span"); b.disabled = true; bt.textContent = "Triando…";
  $("#saida-resultado").hidden = true;
  const passos = [...document.querySelectorAll("#etapas li")];
  passos.forEach((p) => p.classList.remove("ativa", "feita"));
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const espera = reduz ? 0 : 110;
  const ETAPAS = ["leitor", "juiz", "redator", "auditor"];
  const total = dados.tickets.length;
  const cont = Object.fromEntries(ETAPAS.map((e) => [e, 0]));
  const pinta = () => ETAPAS.forEach((e) => { $(`[data-c="${e}"]`).textContent = `${cont[e]}/${total}`; $(`[data-b="${e}"]`).style.width = `${(cont[e] / total) * 100}%`; });
  pinta();
  const feed = $("#feed"), lista = $("#feed-lista"), agora = $("#feed-agora");
  lista.innerHTML = ""; feed.hidden = false; feed.classList.remove("pronto");
  const resumo = (r) => {
    const s = r.saida || {};
    if (r.etapa === "leitor") return `intenção: ${esc(s.intencao)}${s.pedido_citado ? ` · pedido ${esc(s.pedido_citado)}` : ""}`;
    if (r.etapa === "juiz") return `<span class="${s.acao === "escalar_humano" ? ((s.regras || []).some((x) => x.includes("regra 6")) ? "manip" : s.critico ? "crit" : "esc") : "ok"}">${esc(ROTULO[s.acao] || s.acao)}</span> · ${esc((s.regras || []).join(", "))}`;
    if (r.etapa === "redator") return "resposta montada só com dados do pedido";
    return s.aprovado === false ? `<span class="crit">reprovado: ${esc((s.falhas || []).join(", "))}</span>` : `<span class="ok">aprovado</span>`;
  };
  for (const r of (dados.log || []).filter((x) => ETAPAS.includes(x.etapa))) {
    passos.forEach((p) => p.classList.toggle("ativa", p.dataset.e === r.etapa));
    cont[r.etapa]++; pinta();
    agora.textContent = `${r.ticket_id} → ${r.etapa}`;
    lista.insertAdjacentHTML("afterbegin", `<li><b>${esc(r.ticket_id)}</b> ${esc(r.etapa)}: ${resumo(r)}</li>`);
    if (espera) await new Promise((ok) => setTimeout(ok, espera));
  }
  passos.forEach((p) => p.classList.remove("ativa"));
  passos.forEach((p) => p.classList.add("feita"));
  agora.textContent = `${total} tickets passaram pelos 4 agentes · modo ${dados.modo}`; feed.classList.add("pronto");
  renderResultado();
  b.disabled = false; bt.textContent = "Rodar de novo";
}

function renderAprovacao() {
  const ap = lerAprov();
  const l = humanos();
  $("#lista-aprovacao").innerHTML = l.length ? l.map((t) => {
    const a = ap[t.ticket_id];
    return `<li><div class="aprov-card ${tom(t)} ${a ? "aprovado" : ""}">
      <span class="tk__topo"><span class="id">${esc(t.ticket_id)} · prioridade ${esc(t.prioridade)}</span></span>
      <span class="txt">${esc(t.texto)}</span>
      <span class="meta">${selos(t)}</span>
      <span class="sub">Motivo: ${esc(t.evidencia?.motivo || "—")}</span>
      <label><span class="etiqueta">Resposta sugerida</span><textarea rows="3" data-edit="${esc(t.ticket_id)}">${esc(a?.resposta ?? t.resposta)}</textarea></label>
      <div class="aprov">
        <button class="btn ${a ? "btn--ok" : "btn--lima"}" data-aprovar="${esc(t.ticket_id)}">${a ? ICO("check") + " Aprovado" : "Aprovar"}</button>
        <button class="btn btn--fantasma" data-abrir="${esc(t.ticket_id)}">Ver evidência</button>
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
    <dt>Decisão</dt><dd><strong>${esc(ROTULO[t.acao] || t.acao)}</strong>${t.critico ? ` <span class="selo selo--bad">${ICO("alerta")}crítico</span>` : ""}</dd>
    <dt>Sinais do Leitor</dt><dd>${(ev.sinais || []).length ? ev.sinais.map((s) => `<span class="selo selo--${(SINAL[s] || ["neutro"])[0]}">${esc(SINAL[s]?.[1] || s)}</span>`).join(" ") : "nenhum"}</dd>
    <dt>Leitor × rede</dt><dd>${esc(ev.leitor_vs_rede || "—")}</dd>
    <dt>Regra aplicada</dt><dd>${esc((ev.regras || []).join(", ") || "—")}</dd>
    <dt>Motivo</dt><dd>${esc(ev.motivo || "—")}</dd>
    <dt>Auditor</dt><dd>${au.aprovado ? `<span class="selo selo--ok">${ICO("check")}aprovado</span>` : `<span class="selo selo--bad">reprovado</span>`}${(au.falhas || []).length ? ": " + au.falhas.map(esc).join("; ") : ""}</dd>
    <dt>Pedido</dt><dd>${p ? `${esc(p.pedido)} · ${esc(p.produto)} · personalizado: ${esc(p.personalizado)} · status <b>${esc(p.status)}</b> · pedido em ${esc(p.data_pedido)} · prazo ${esc(p.prazo_entrega)}`
      : t.pedido ? esc(t.pedido) : "nenhum pedido válido citado"}</dd>
    <dt>Resposta sugerida</dt><dd>${esc(t.resposta || "—")}</dd>
  </dl>`;
  const d = $("#evidencia"); d.showModal();
}

function ir(tela) {
  if (!dados) return;
  document.querySelectorAll(".passos button").forEach((b) => b.dataset.tela === tela ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
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
