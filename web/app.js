"use strict";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ROTULO = { responder_auto: "resposta automática", escalar_humano: "atendente" };
const URG = { urgente: ["bad", "Urgente"], media: ["warn", "Média"], baixa: ["info", "Baixa"] };
const CH_APROV = "lumina-aprovacoes", CH_TRIADOS = "lumina-triados";
const PAGINA = 200;
let dados = null, entrada = [], porId = new Map();
let sel = new Set(), triados = new Set(lerJSON(CH_TRIADOS, []));
let filtro = { urg: "", status: "abertos", busca: "" }, limite = PAGINA, rodando = false;

function lerJSON(k, pad) { try { return JSON.parse(localStorage.getItem(k)) ?? pad; } catch { return pad; } }
function gravarJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
const lerAprov = () => lerJSON(CH_APROV, {});
const salvarTriados = () => gravarJSON(CH_TRIADOS, [...triados]);

function valido(d) {
  return d && Array.isArray(d.tickets) && d.tickets.every((t) => t && t.ticket_id && typeof t.texto === "string" && t.acao);
}

async function lerArq(arq) {
  const r = await fetch(arq, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

async function carregar() {
  const fonte = $("#fonte");
  try {
    let d = await lerArq("dados/resultado.json"), real = true;
    if (!d) { d = await lerArq("dados/exemplo.json"); real = false; }
    if (!d) throw new Error("nenhum arquivo em web/dados/. Rode python -m pipeline.rodar e abra por um servidor local.");
    if (!valido(d)) throw new Error("resultado.json não segue o formato esperado");
    dados = d;
    porId = new Map(d.tickets.map((t) => [t.ticket_id, t]));
    const e = await lerArq("dados/entrada.json").catch(() => null);
    entrada = e?.tickets?.length ? e.tickets
      : d.tickets.map((t) => ({ ticket_id: t.ticket_id, texto: t.texto, urgencia: "baixa", motivo: "sem pré-triagem (rode o pipeline)" }));
    const num = (t) => parseInt(String(t.ticket_id).replace(/\D/g, ""), 10) || 0;
    entrada.sort((a, b) => num(a) - num(b));
    triados = new Set([...triados].filter((id) => porId.has(id)));
    fonte.className = "fonte" + (real ? "" : " aviso");
    fonte.innerHTML = `${real ? "resultado.json" : "exemplo.json (demonstração)"} · hoje ${esc(d.hoje)} · leitura ${d.modo === "regex" ? "por regras (reserva)" : esc(d.modo)}`;
  } catch (err) {
    mostrarErro(err.message);
    fonte.textContent = "Erro ao carregar dados";
  }
}

function mostrarErro(msg) {
  dados = null;
  const e = $("#estado"); e.className = "estado erro"; e.setAttribute("role", "alert");
  e.innerHTML = `<strong>Não deu para carregar a triagem.</strong> ${esc(msg)} <button class="btn btn--fantasma" onclick="location.reload()">Tentar de novo</button>`;
  $$(".tela").forEach((t) => (t.hidden = true));
}

const ICO = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const SINAL = { juridico: ["bad", "jurídico / Procon"], lgpd: ["bad", "LGPD"], injecao: ["warn", "manipulação"],
  erro_cliente: ["info", "erro do cliente"], defeito_nosso: ["info", "defeito nosso"], defeito_ambiguo: ["info", "defeito ambíguo"] };
const seloUrg = (u) => `<span class="selo selo--${URG[u]?.[0] || "neutro"}">${u === "urgente" ? ICO("alerta") : ""}${esc(URG[u]?.[1] || u)}</span>`;
const ordenar = (l) => [...l].sort((a, b) => ((a.prioridade ?? 9) - (b.prioridade ?? 9)) || String(a.ticket_id).localeCompare(String(b.ticket_id)));
const triadosLista = () => [...triados].map((id) => porId.get(id)).filter(Boolean);
const humanos = () => ordenar(triadosLista().filter((t) => t.acao === "escalar_humano"));
const tom = (t) => t.acao === "responder_auto" ? "auto" : (t.evidencia?.sinais || []).includes("injecao") ? "manip" : t.critico ? "critico" : "humano";
function selos(t) {
  const s = (t.evidencia?.sinais || []).filter((x) => SINAL[x]).map((x) => `<span class="selo selo--${SINAL[x][0]}">${SINAL[x][0] === "bad" ? ICO("alerta") : ""}${esc(SINAL[x][1])}</span>`);
  s.push(t.acao === "responder_auto" ? `<span class="selo selo--ok">${ICO("check")}respondido</span>` : `<span class="selo selo--info">atendente</span>`);
  s.push(`<span class="selo selo--neutro">${esc(t.categoria)}</span>`);
  if (t.pedido) s.push(`<span class="selo selo--neutro">pedido ${esc(t.pedido)}</span>`);
  return s.join("");
}

/* ---------- Entrada ---------- */
const abertos = () => entrada.filter((t) => !triados.has(t.ticket_id));

function renderGrupos() {
  $("#grupos").innerHTML = Object.keys(URG).map((u) => {
    const todos = entrada.filter((t) => t.urgencia === u);
    const ab = todos.filter((t) => !triados.has(t.ticket_id));
    const marcados = ab.filter((t) => sel.has(t.ticket_id)).length;
    const estado = !ab.length ? "" : marcados === ab.length ? "checked" : "";
    return `<div class="grupo grupo--${u} ${filtro.urg === u ? "ativo" : ""}">
      <button class="grupo__corpo" data-filtrar="${u}" aria-pressed="${filtro.urg === u}">
        <span class="grupo__nome">${seloUrg(u)}</span>
        <span class="grupo__num">${ab.length}</span>
        <span class="grupo__sub">abertos · ${todos.length - ab.length} já triados</span>
      </button>
      <label class="grupo__marcar"><input type="checkbox" data-marcar-grupo="${u}" ${estado} ${ab.length ? "" : "disabled"}
        ${marcados && marcados < ab.length ? 'data-parcial="1"' : ""}> Selecionar ${ab.length ? `os ${ab.length}` : ""} abertos</label>
    </div>`;
  }).join("");
  $$("[data-parcial]").forEach((c) => (c.indeterminate = true));
}

function visiveis() {
  const b = filtro.busca.trim().toLowerCase();
  return entrada.filter((t) =>
    (!filtro.urg || t.urgencia === filtro.urg) &&
    (filtro.status === "todos" || (filtro.status === "abertos") !== triados.has(t.ticket_id)) &&
    (!b || t.ticket_id.toLowerCase().includes(b) || t.texto.toLowerCase().includes(b)));
}

function renderEntrada() {
  renderGrupos();
  const foco = new URLSearchParams(location.search).get("ticket");
  const ordem = { urgente: 0, media: 1, baixa: 2 };
  const l = visiveis().sort((a, b) => ordem[a.urgencia] - ordem[b.urgencia]);
  $("#corpo-entrada").innerHTML = l.slice(0, limite).map((t) => {
    const feito = triados.has(t.ticket_id), r = porId.get(t.ticket_id);
    return `<tr class="${t.ticket_id === foco ? "foco" : ""} ${feito ? "feito" : ""}">
      <td class="c-sel"><input type="checkbox" data-marcar="${esc(t.ticket_id)}" aria-label="Selecionar ${esc(t.ticket_id)}" ${sel.has(t.ticket_id) ? "checked" : ""} ${feito ? "disabled" : ""}></td>
      <td class="c-id">${esc(t.ticket_id)}</td>
      <td>${seloUrg(t.urgencia)}</td>
      <td class="c-mot">${esc(t.motivo)}</td>
      <td class="c-txt">${esc(t.texto)}</td>
      <td class="c-acao">${feito
        ? `<button class="btn btn--fantasma btn--p" data-abrir="${esc(t.ticket_id)}">${r?.acao === "responder_auto" ? "Respondido" : "Na fila"}</button>`
        : `<button class="btn btn--lima btn--p" data-triar-um="${esc(t.ticket_id)}">Triar</button>`}</td></tr>`;
  }).join("") || `<tr><td colspan="6" class="vazio">${filtro.status === "abertos" && !abertos().length ? "Todos os tickets já foram triados." : "Nenhum ticket com esses filtros."}</td></tr>`;
  $("#mais").hidden = l.length <= limite;
  $("#mais").textContent = `Mostrar mais (${l.length - limite} restantes)`;
  $("#conta-lista").textContent = `${Math.min(l.length, limite)} de ${l.length} tickets`;
  renderBarra();
}

function renderBarra() {
  const n = sel.size;
  $("#barra-sel").hidden = !n;
  $("#n-sel").textContent = n === 1 ? "1 ticket selecionado" : `${n} tickets selecionados`;
}

/* ---------- Triagem ---------- */
const ETAPAS = ["leitor", "juiz", "redator", "auditor"];
function resumoLog(r) {
  const s = r.saida || {};
  if (r.etapa === "leitor") return `intenção: ${esc(s.intencao)}${s.pedido_citado ? ` · pedido ${esc(s.pedido_citado)}` : ""}`;
  if (r.etapa === "juiz") return `<span class="${s.acao === "escalar_humano" ? ((s.regras || []).some((x) => x.includes("regra 6")) ? "manip" : s.critico ? "crit" : "esc") : "ok"}">${esc(ROTULO[s.acao] || s.acao)}</span> · ${esc((s.regras || []).join(", "))}`;
  if (r.etapa === "redator") return "resposta montada só com dados do pedido";
  return s.aprovado === false ? `<span class="crit">reprovado: ${esc((s.falhas || []).join(", "))}</span>` : `<span class="ok">aprovado</span>`;
}

async function triar(ids) {
  if (rodando || !ids.length) return;
  rodando = true;
  ir("resultado");
  const passos = $$("#etapas li"), alvo = new Set(ids), total = ids.length;
  passos.forEach((p) => p.classList.remove("ativa", "feita"));
  const cont = Object.fromEntries(ETAPAS.map((e) => [e, 0]));
  const pinta = () => ETAPAS.forEach((e) => { $(`[data-c="${e}"]`).textContent = `${cont[e]}/${total}`; $(`[data-b="${e}"]`).style.width = `${(cont[e] / total) * 100}%`; });
  pinta();
  const feed = $("#feed"), lista = $("#feed-lista"), agora = $("#feed-agora");
  lista.innerHTML = ""; feed.hidden = false; feed.classList.remove("pronto");
  $("#lote").textContent = `Lote atual: ${total} ticket${total > 1 ? "s" : ""}`;
  const reg = (dados.log || []).filter((x) => alvo.has(x.ticket_id) && ETAPAS.includes(x.etapa));
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const espera = reduz ? 0 : Math.max(0, Math.min(120, 4000 / Math.max(reg.length, 1)));
  for (const r of reg) {
    passos.forEach((p) => p.classList.toggle("ativa", p.dataset.e === r.etapa));
    cont[r.etapa]++; pinta();
    agora.textContent = `${r.ticket_id} → ${r.etapa}`;
    lista.insertAdjacentHTML("afterbegin", `<li><b>${esc(r.ticket_id)}</b> ${esc(r.etapa)}: ${resumoLog(r)}</li>`);
    if (espera >= 4) await new Promise((ok) => setTimeout(ok, espera));
  }
  passos.forEach((p) => { p.classList.remove("ativa"); p.classList.add("feita"); });
  agora.textContent = `${total} ticket${total > 1 ? "s" : ""} passaram pelos 4 agentes`; feed.classList.add("pronto");
  ids.forEach((id) => { triados.add(id); sel.delete(id); });
  salvarTriados();
  renderResultado(); renderEntrada();
  rodando = false;
}

function renderResultado() {
  const l = triadosLista();
  const auto = ordenar(l.filter((t) => t.acao === "responder_auto")), hum = humanos();
  $("#k-auto").textContent = auto.length;
  $("#k-humano").textContent = hum.length;
  $("#k-crit").textContent = hum.filter((t) => t.critico).length;
  $("#k-abertos").textContent = abertos().length;
  const item = (t) => `<li><button class="linha-res ${tom(t)}" data-abrir="${esc(t.ticket_id)}">
    <span class="id">${esc(t.ticket_id)}</span><span class="txt">${esc(t.texto)}</span><span class="meta">${selos(t)}</span></button></li>`;
  $("#lista-humano").innerHTML = hum.map(item).join("") || '<li class="vazio">Nenhum caso para a atendente.</li>';
  $("#lista-auto").innerHTML = auto.map(item).join("") || '<li class="vazio">Nenhuma resposta automática.</li>';
  $("#sem-triagem").hidden = !!l.length || rodando;
  $("#saida-resultado").hidden = !l.length;
  renderBadge();
}

/* ---------- Fila da atendente ---------- */
function renderAprovacao() {
  const ap = lerAprov(), l = humanos();
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
  }).join("") : `<li class="vazio">${triados.size ? "Nenhum caso escalado entre os tickets triados." : "Nenhum ticket triado ainda. Selecione tickets na Entrada e envie para a triagem."}</li>`;
}

function renderBadge() {
  const ap = lerAprov(), pend = humanos().filter((t) => !ap[t.ticket_id]).length;
  $("#badge-fila").textContent = pend || "";
  $("#badge-fila").setAttribute("aria-label", pend + " pendentes");
}

/* ---------- Log ---------- */
function renderLog() {
  const log = (dados.log || []).filter((x) => triados.has(x.ticket_id));
  $("#log-meta").textContent = `Versão ${dados.versao ?? "?"} · hoje = ${dados.hoje ?? "?"} · ${log.length} registros dos tickets triados`;
  const sel = $("#filtro-log"), atual = sel.value;
  sel.innerHTML = '<option value="">Todos</option>' + [...triados].sort().map((id) => `<option>${esc(id)}</option>`).join("");
  sel.value = triados.has(atual) ? atual : "";
  const linhas = log.filter((x) => !sel.value || x.ticket_id === sel.value);
  $("#corpo-log").innerHTML = linhas.length ? linhas.map((x) => `<tr><td>${esc(x.ticket_id)}</td><td>${esc(x.etapa)}</td>
    <td>${esc(typeof x.entrada === "object" ? JSON.stringify(x.entrada) : x.entrada)}</td><td>${esc(typeof x.saida === "object" ? JSON.stringify(x.saida) : x.saida)}</td>
    <td class="n">${esc(x.ms)}</td><td>${esc(x.versao)}</td></tr>`).join("") : '<tr><td colspan="6" class="vazio">Sem registros. Os passos aparecem aqui depois da triagem.</td></tr>';
}

function abrirEvidencia(id) {
  const t = porId.get(id); if (!t) return;
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
  $("#evidencia").showModal();
}

function ir(tela) {
  if (!dados) return;
  $$(".passos button").forEach((b) => b.dataset.tela === tela ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  $$(".tela").forEach((s) => (s.hidden = s.id !== "tela-" + tela));
  if (tela === "entrada") renderEntrada();
  if (tela === "resultado") renderResultado();
  if (tela === "aprovacao") renderAprovacao();
  if (tela === "log") renderLog();
  history.replaceState(null, "", location.search + "#" + tela);
  $("#principal").focus({ preventScroll: true });
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-tela],[data-ir],[data-abrir],[data-aprovar],[data-triar-um],[data-filtrar],[data-status],.fechar,#triar-sel,#limpar-sel,#limpar,#mais,#reiniciar");
  if (!el) return;
  if (el.dataset.tela || el.dataset.ir) ir(el.dataset.tela || el.dataset.ir);
  else if (el.dataset.abrir) abrirEvidencia(el.dataset.abrir);
  else if (el.dataset.triarUm) triar([el.dataset.triarUm]);
  else if (el.dataset.filtrar) { filtro.urg = filtro.urg === el.dataset.filtrar ? "" : el.dataset.filtrar; limite = PAGINA; renderEntrada(); }
  else if (el.dataset.status) {
    filtro.status = el.dataset.status; limite = PAGINA;
    $$("[data-status]").forEach((b) => b.setAttribute("aria-pressed", b === el)); renderEntrada();
  } else if (el.id === "triar-sel") triar(entrada.map((t) => t.ticket_id).filter((id) => sel.has(id)));
  else if (el.id === "limpar-sel") { sel.clear(); renderEntrada(); }
  else if (el.id === "mais") { limite += PAGINA; renderEntrada(); }
  else if (el.id === "reiniciar") { triados.clear(); sel.clear(); salvarTriados(); gravarJSON(CH_APROV, {}); renderEntrada(); renderBadge(); }
  else if (el.dataset.aprovar) {
    const id = el.dataset.aprovar, ap = lerAprov();
    if (ap[id]) delete ap[id]; else ap[id] = { resposta: document.querySelector(`[data-edit="${CSS.escape(id)}"]`).value, em: new Date().toISOString() };
    gravarJSON(CH_APROV, ap); renderAprovacao(); renderBadge();
  } else if (el.classList.contains("fechar")) $("#evidencia").close();
  else if (el.id === "limpar") { gravarJSON(CH_APROV, {}); renderAprovacao(); renderBadge(); }
});
document.addEventListener("change", (e) => {
  const c = e.target;
  if (c.dataset.marcar) { c.checked ? sel.add(c.dataset.marcar) : sel.delete(c.dataset.marcar); renderGrupos(); renderBarra(); }
  else if (c.dataset.marcarGrupo) {
    entrada.filter((t) => t.urgencia === c.dataset.marcarGrupo && !triados.has(t.ticket_id))
      .forEach((t) => (c.checked ? sel.add(t.ticket_id) : sel.delete(t.ticket_id)));
    renderEntrada();
  } else if (c.id === "filtro-log") renderLog();
});
let tBusca;
$("#busca").addEventListener("input", (e) => { clearTimeout(tBusca); tBusca = setTimeout(() => { filtro.busca = e.target.value; limite = PAGINA; renderEntrada(); }, 150); });
$("#evidencia").addEventListener("click", (e) => { if (e.target.id === "evidencia") e.target.close(); });

carregar().then(() => {
  if (!dados) return;
  const foco = new URLSearchParams(location.search).get("ticket");
  if (foco && !triados.has(foco)) sel.add(foco);
  renderBadge();
  const t = location.hash.slice(1);
  ir(["entrada", "resultado", "aprovacao", "log"].includes(t) ? t : "entrada");
});
