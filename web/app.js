"use strict";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ROTULO = { responder_auto: "resposta automática", escalar_humano: "atendente" };
const URG = { urgente: ["bad", "Urgente"], media: ["warn", "Média"], baixa: ["info", "Baixa"] };
const CH = { hist: "lumina-historico", aprov: "lumina-aprovacoes", triados: "lumina-triados", override: "lumina-override", encam: "lumina-encaminhados", corr: "lumina-correcoes" };
const AREAS = { juridico: "Jurídico", privacidade: "Privacidade (encarregado LGPD)", supervisao: "Supervisão do atendimento", logistica: "Logística", producao: "Produção" };
const CATEGORIAS = ["atraso", "troca", "cancelamento", "duvida_produto", "reclamacao", "lgpd", "outro"];
const PAGINA = 200;
let dados = null, entrada = [], porId = new Map(), entradaPorId = new Map();
let sel = new Set(), triados = new Set(lerJSON(CH.triados, []));
let filtro = { urg: "", status: "abertos", busca: "" }, limite = PAGINA, rodando = false;

function lerJSON(k, pad) { try { return JSON.parse(localStorage.getItem(k)) ?? pad; } catch { return pad; } }
function gravarJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
const lerAprov = () => lerJSON(CH.aprov, {});
const lerOverride = () => lerJSON(CH.override, {});
const lerEncam = () => lerJSON(CH.encam, {});
const lerCorr = () => lerJSON(CH.corr, {});
const rascunhos = new Map();
let focoFila = 0;

/* Histórico das ações da atendente (sem login: fica neste navegador). */
function registrar(acao, tickets, detalhe = "") {
  const h = lerJSON(CH.hist, []);
  h.push({ em: new Date().toISOString(), acao, tickets, detalhe });
  gravarJSON(CH.hist, h.slice(-2000));
}
const horaBR = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const salvarTriados = () => gravarJSON(CH.triados, [...triados]);

/* Auditor da edição humana: espelho de pipeline/auditor.py (tests/test_pipeline.py confere o PROIBIDO). */
const PROIBIDO = "reembols|estorn|desconto|indeniza|novo prazo|nova data|ressarc|compensa";
const normTxt = (t) => t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
function auditarTexto(resp, pedido, p) {
  const falhas = [];
  const datasOk = new Set(p ? [p.data_pedido, p.prazo_entrega] : []);
  for (const dt of resp.match(/\d{4}-\d{2}-\d{2}|\b\d{1,2}\/\d{1,2}\b/g) || [])
    if (!datasOk.has(dt)) falhas.push(`data "${dt}" não está nos dados do pedido`);
  for (const n of resp.replace(/\d{4}-\d{2}-\d{2}/g, "").match(/\d+/g) || [])
    if (n !== pedido && !(p && String(p.produto).includes(n))) falhas.push(`número "${n}" não está nos dados`);
  if (new RegExp(PROIBIDO).test(normTxt(resp))) falhas.push("promessa proibida: reembolso, desconto, indenização ou prazo novo");
  if (!resp.trim()) falhas.push("resposta vazia");
  return falhas;
}

function valido(d) {
  return d && Array.isArray(d.tickets) && d.tickets.every((t) => t && t.ticket_id && typeof t.texto === "string" && t.acao);
}
async function lerArq(arq) { const r = await fetch(arq, { cache: "no-store" }); return r.ok ? r.json() : null; }
const dataBR = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split("-"); return d ? `${d}/${m}/${a}` : iso; };

async function carregar() {
  const fonte = $("#fonte");
  try {
    let d = await lerArq("dados/resultado.json");
    if (!d) d = await lerArq("dados/exemplo.json");
    if (!d) throw new Error("nenhum arquivo em web/dados/. Rode python -m pipeline.rodar e abra por um servidor local.");
    if (!valido(d)) throw new Error("resultado.json não segue o formato esperado");
    dados = d;
    porId = new Map(d.tickets.map((t) => [t.ticket_id, t]));
    const e = await lerArq("dados/entrada.json").catch(() => null);
    entrada = e?.tickets?.length ? e.tickets
      : d.tickets.map((t) => ({ ticket_id: t.ticket_id, texto: t.texto, urgencia: "baixa", motivo: "sem pré-triagem" }));
    const num = (t) => parseInt(String(t.ticket_id).replace(/\D/g, ""), 10) || 0;
    entrada.sort((a, b) => num(a) - num(b));
    entradaPorId = new Map(entrada.map((t) => [t.ticket_id, t]));
    triados = new Set([...triados].filter((id) => porId.has(id)));
    fonte.textContent = `Atualizado em ${dataBR(d.gerado_em)} ${String(d.gerado_em).slice(11, 16)} · data de referência ${dataBR(d.hoje)}`;
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

/* Decisão efetiva: a atendente pode puxar uma resposta automática para revisão. */
function efetivo(t) {
  const o = lerOverride()[t.ticket_id];
  if (!o || t.acao === "escalar_humano") return t;
  return { ...t, acao: "escalar_humano", critico: false, prioridade: 4, puxado: true,
    evidencia: { ...t.evidencia, motivo: "puxado para revisão pela atendente" } };
}
const triadosLista = () => [...triados].map((id) => porId.get(id)).filter(Boolean).map(efetivo);
const ordenar = (l) => [...l].sort((a, b) => ((a.prioridade ?? 9) - (b.prioridade ?? 9)) || a.ticket_id.localeCompare(b.ticket_id));
const humanos = () => ordenar(triadosLista().filter((t) => t.acao === "escalar_humano"));
const tom = (t) => t.acao === "responder_auto" ? "auto" : (t.evidencia?.sinais || []).includes("injecao") ? "manip" : t.critico ? "critico" : "humano";
function rotuloPrioridade(t) {
  const s = t.evidencia?.sinais || [];
  if (s.includes("juridico")) return ["bad", "Jurídico / Procon"];
  if (s.includes("lgpd")) return ["bad", "LGPD"];
  if (s.includes("injecao")) return ["warn", "Manipulação"];
  if (t.puxado) return ["neutro", "Revisão manual"];
  return ["info", "Revisão"];
}
function selos(t) {
  const s = (t.evidencia?.sinais || []).filter((x) => SINAL[x]).map((x) => `<span class="selo selo--${SINAL[x][0]}">${SINAL[x][0] === "bad" ? ICO("alerta") : ""}${esc(SINAL[x][1])}</span>`);
  s.push(t.acao === "responder_auto" ? `<span class="selo selo--ok">${ICO("check")}respondido</span>` : `<span class="selo selo--info">atendente</span>`);
  s.push(`<span class="selo selo--neutro">${esc(t.categoria)}</span>`);
  return s.join("");
}

/* Modelos de resposta: preenchidos só com dados do pedido e conferidos pelo Auditor antes de aparecer. */
function modelos(t) {
  const p = t.pedido_dados, ped = p ? `o pedido ${p.pedido} (${p.produto})` : "a sua solicitação";
  const lista = [
    ["Em análise", `Recebemos sua mensagem sobre ${ped} e uma atendente está analisando o seu caso. Retornamos por este mesmo canal.`],
    ["Encaminhado à área responsável", `Seu caso sobre ${ped} foi encaminhado para a equipe responsável, que vai retornar por este mesmo canal.`],
  ];
  if (p) lista.push(
    ["Status do pedido", `Pedido ${p.pedido} (${p.produto}): status ${String(p.status).replace(/_/g, " ")}, com prazo de entrega previsto para ${p.prazo_entrega}.`],
    ["Pedir foto do produto", `Para seguirmos com a análise do pedido ${p.pedido}, envie uma foto do produto mostrando o problema.`]);
  if ((t.evidencia?.sinais || []).includes("lgpd")) lista.push(
    ["Privacidade (LGPD)", "Recebemos sua solicitação sobre os seus dados pessoais. Ela foi encaminhada ao responsável pela privacidade, que vai retornar por este mesmo canal."]);
  return lista.filter(([, txt]) => !auditarTexto(txt, t.pedido, p).length);
}

/* Área sugerida por regra em código; a atendente pode trocar. */
function areaSugerida(tickets) {
  const s = new Set(tickets.flatMap((t) => t.evidencia?.sinais || []));
  if (s.has("juridico")) return "juridico";
  if (s.has("lgpd")) return "privacidade";
  if (s.has("injecao")) return "supervisao";
  if (s.has("defeito_nosso") || s.has("defeito_ambiguo") || s.has("erro_cliente")) return "producao";
  if (tickets.some((t) => t.categoria === "atraso")) return "logistica";
  return "supervisao";
}

/* Pedido: situação calculada contra a data de referência. */
function situacaoPedido(p) {
  if (!p) return null;
  const dias = Math.round((new Date(dados.hoje) - new Date(p.prazo_entrega)) / 864e5);
  if (p.status === "entregue") return ["ok", "entregue"];
  if (dias > 0) return ["bad", `atrasado há ${dias} dia${dias > 1 ? "s" : ""}`];
  return ["info", dias === 0 ? "vence hoje" : `no prazo · faltam ${-dias} dia${dias < -1 ? "s" : ""}`];
}
function blocoPedido(t) {
  const p = t.pedido_dados;
  if (!p) return `<div class="pedido pedido--vazio">${t.pedido ? `Pedido ${esc(t.pedido)} não encontrado na base` : "Nenhum pedido citado"}</div>`;
  const [c, txt] = situacaoPedido(p);
  return `<div class="pedido">
    <span><b>Pedido ${esc(p.pedido)}</b> · ${esc(p.produto)}${p.personalizado === "sim" ? " · personalizado" : ""}</span>
    <span>Status <b>${esc(String(p.status).replace(/_/g, " "))}</b> · prazo ${dataBR(p.prazo_entrega)}</span>
    <span class="selo selo--${c}">${esc(txt)}</span></div>`;
}

/* ---------- Entrada ---------- */
const abertos = () => entrada.filter((t) => !triados.has(t.ticket_id));
const contaPedido = () => { const m = new Map(); entrada.forEach((t) => t.pedido_citado && m.set(t.pedido_citado, (m.get(t.pedido_citado) || 0) + 1)); return m; };

function renderGrupos() {
  $("#grupos").innerHTML = Object.keys(URG).map((u) => {
    const todos = entrada.filter((t) => t.urgencia === u);
    const ab = todos.filter((t) => !triados.has(t.ticket_id));
    const marcados = ab.filter((t) => sel.has(t.ticket_id)).length;
    return `<div class="grupo grupo--${u} ${filtro.urg === u ? "ativo" : ""}">
      <button class="grupo__corpo" data-filtrar="${u}" aria-pressed="${filtro.urg === u}">
        <span class="grupo__nome">${seloUrg(u)}</span>
        <span class="grupo__num">${ab.length}</span>
        <span class="grupo__sub">abertos · ${todos.length - ab.length} já triados</span>
      </button>
      <label class="grupo__marcar"><input type="checkbox" data-marcar-grupo="${u}" ${ab.length && marcados === ab.length ? "checked" : ""} ${ab.length ? "" : "disabled"}
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
    (!b || t.ticket_id.toLowerCase().includes(b) || t.texto.toLowerCase().includes(b) || String(t.pedido_citado || "").includes(b)));
}

function renderEntrada() {
  renderGrupos();
  const foco = new URLSearchParams(location.search).get("ticket");
  const ordem = { urgente: 0, media: 1, baixa: 2 }, cp = contaPedido();
  const l = visiveis().sort((a, b) => ordem[a.urgencia] - ordem[b.urgencia]);
  $("#corpo-entrada").innerHTML = l.slice(0, limite).map((t) => {
    const feito = triados.has(t.ticket_id), r = porId.get(t.ticket_id) && efetivo(porId.get(t.ticket_id));
    const n = cp.get(t.pedido_citado) || 0;
    return `<tr class="${t.ticket_id === foco ? "foco" : ""} ${feito ? "feito" : ""}">
      <td class="c-sel"><input type="checkbox" data-marcar="${esc(t.ticket_id)}" aria-label="Selecionar ${esc(t.ticket_id)}" ${sel.has(t.ticket_id) ? "checked" : ""} ${feito ? "disabled" : ""}></td>
      <td class="c-id">${esc(t.ticket_id)}</td>
      <td>${seloUrg(t.urgencia)}</td>
      <td class="c-mot">${esc(t.motivo)}</td>
      <td class="c-txt">${esc(t.texto)}${n > 1 ? ` <span class="selo selo--warn" title="Há outros tickets citando o mesmo pedido">pedido ${esc(t.pedido_citado)} · ${n} tickets</span>` : ""}</td>
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
  $("#sem-triagem").hidden = true;
  $("#lote").textContent = `Lote atual: ${total} ticket${total > 1 ? "s" : ""}.`;
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
  registrar("triagem", ids, `lote de ${ids.length}`);
  salvarTriados();
  rodando = false;
  renderResultado(); renderBadge();
}

function renderResultado() {
  const l = triadosLista();
  const auto = ordenar(l.filter((t) => t.acao === "responder_auto")), hum = humanos();
  $("#k-auto").textContent = auto.length;
  $("#k-humano").textContent = hum.length;
  $("#k-crit").textContent = hum.filter((t) => t.critico).length;
  $("#k-abertos").textContent = abertos().length;
  $("#lista-auto").innerHTML = auto.map((t) => `<li class="linha-auto">
      <button class="linha-res auto" data-abrir="${esc(t.ticket_id)}"><span class="id">${esc(t.ticket_id)}</span>
        <span class="txt">${esc(t.texto)}</span><span class="resp">${esc(t.resposta)}</span></button>
      <button class="btn btn--fantasma btn--p" data-puxar="${esc(t.ticket_id)}">Passar para atendente</button></li>`).join("")
    || '<li class="vazio">Nenhuma resposta automática neste lote.</li>';
  $("#sem-triagem").hidden = !!l.length || rodando;
  $("#saida-resultado").hidden = !l.length;
}

/* ---------- Fila da atendente: um card por pedido ---------- */
function gruposFila() {
  const m = new Map();
  for (const t of humanos()) {
    const k = t.pedido_dados ? "p" + t.pedido : "t" + t.ticket_id;
    if (!m.has(k)) m.set(k, { chave: k, tickets: [] });
    m.get(k).tickets.push(t);
  }
  return [...m.values()].sort((a, b) => (a.tickets[0].prioridade - b.tickets[0].prioridade) || a.tickets[0].ticket_id.localeCompare(b.tickets[0].ticket_id));
}

function renderAprovacao() {
  const ap = lerAprov(), en = lerEncam(), gs = gruposFila();
  const feitos = gs.filter((g) => ap[g.chave] || en[g.chave]).length;
  $("#progresso").textContent = gs.length ? `${feitos} de ${gs.length} casos resolvidos` : "";
  $("#progresso-barra").style.width = gs.length ? `${(feitos / gs.length) * 100}%` : "0";
  const nRes = Object.keys(ap).length + Object.keys(en).length, nCorr = Object.keys(lerCorr()).length;
  $("#exportar").disabled = !nRes;
  $("#exportar").textContent = `Exportar resolvidos (${nRes})`;
  $("#exportar-corr").hidden = !nCorr;
  $("#exportar-corr").textContent = `Baixar correções (${nCorr})`;
  $("#lista-aprovacao").innerHTML = gs.length ? gs.map((g) => {
    const t0 = g.tickets[0], a = ap[g.chave], enc = en[g.chave], [pc, pr] = rotuloPrioridade(t0), sug = areaSugerida(g.tickets);
    const ids = new Set(g.tickets.map((t) => t.ticket_id));
    const outros = t0.pedido_dados ? entrada.filter((e) => e.pedido_citado === t0.pedido && !ids.has(e.ticket_id)) : [];
    const resp = a?.resposta ?? rascunhos.get(g.chave) ?? t0.resposta, mods = a || enc ? [] : modelos(t0);
    const falhas = auditarTexto(resp, t0.pedido, t0.pedido_dados);
    return `<li><article class="aprov-card ${tom(t0)} ${a || enc ? "aprovado" : ""}" data-grupo="${esc(g.chave)}" tabindex="-1" aria-label="Caso ${g.tickets.map((t) => esc(t.ticket_id)).join(" e ")}">
      <header class="aprov-cab"><span class="selo selo--${pc}">${pc === "bad" ? ICO("alerta") : ""}${esc(pr)}</span>
        ${g.tickets.length > 1 ? `<span class="selo selo--warn">${g.tickets.length} tickets do mesmo pedido</span>` : ""}
        <span class="id">${g.tickets.map((t) => esc(t.ticket_id)).join(" · ")}</span></header>
      ${blocoPedido(t0)}
      <ul class="msgs">${g.tickets.map((t) => `<li><button class="msg" data-abrir="${esc(t.ticket_id)}"><span class="id">${esc(t.ticket_id)}</span>
        <span class="txt">${esc(t.texto)}</span><span class="sub">${esc(t.evidencia?.motivo || "")} · ver evidência</span></button></li>`).join("")}</ul>
      ${outros.length ? `<p class="outros">Outros tickets deste pedido: ${outros.map((e) => {
        const r = porId.get(e.ticket_id);
        return `<b>${esc(e.ticket_id)}</b> ${triados.has(e.ticket_id) ? (r && efetivo(r).acao === "responder_auto" ? "(respondido automaticamente)" : "") : `(ainda não triado) <button class="link" data-triar-um="${esc(e.ticket_id)}">triar agora</button>`}`;
      }).join(" · ")}</p>` : ""}
      ${mods.length ? `<label class="modelos"><span class="etiqueta">Modelo de resposta</span><select data-modelo="${esc(g.chave)}">
        <option value="">Usar a resposta sugerida</option>${mods.map(([n], i) => `<option value="${i}">${esc(n)}</option>`).join("")}</select></label>` : ""}
      <label><span class="etiqueta">Resposta ${g.tickets.length > 1 ? "única para os tickets do pedido" : "sugerida"}</span>
        <textarea rows="3" data-edit="${esc(g.chave)}" ${a ? "readonly" : ""}>${esc(resp)}</textarea></label>
      <div class="auditoria ${falhas.length ? "falha" : "ok"}" data-aud="${esc(g.chave)}">${falhas.length
        ? `${ICO("alerta")} Auditor bloqueou: ${falhas.map(esc).join("; ")}` : `${ICO("check")} Auditor: texto confere com os dados`}</div>
      <div class="aprov">${enc
        ? `<span class="selo selo--ok">${ICO("check")}Encaminhado para ${esc(AREAS[enc.area])}</span><button class="link" data-encaminhar="${esc(g.chave)}">desfazer</button>`
        : a ? `<button class="btn btn--ok" data-aprovar="${esc(g.chave)}">${ICO("check")} Aprovado · desfazer</button>`
        : `<button class="btn btn--lima" data-aprovar="${esc(g.chave)}" ${falhas.length ? "disabled" : ""}>Aprovar resposta</button>
           <span class="encaminhar"><label class="sr" for="area-${esc(g.chave)}">Área</label>
             <select id="area-${esc(g.chave)}" data-area="${esc(g.chave)}">${Object.entries(AREAS).map(([k, v]) => `<option value="${k}" ${k === sug ? "selected" : ""}>${esc(v)}${k === sug ? " (sugerida)" : ""}</option>`).join("")}</select>
             <button class="btn btn--fantasma" data-encaminhar="${esc(g.chave)}">Encaminhar</button></span>`}
      </div></article></li>`;
  }).join("") : `<li class="vazio">${triados.size ? "Nenhum caso para a atendente entre os tickets triados." : "Nenhum ticket triado ainda. Selecione tickets na Entrada e envie para a triagem."}</li>`;
}

function focarCaso(i) {
  const cards = $$("#lista-aprovacao .aprov-card"); if (!cards.length) return;
  focoFila = Math.max(0, Math.min(i, cards.length - 1));
  cards.forEach((c, k) => c.classList.toggle("focado", k === focoFila));
  cards[focoFila].focus({ preventScroll: true });
  cards[focoFila].scrollIntoView({ block: "nearest" });
}

function auditarCampo(ta) {
  const g = gruposFila().find((x) => x.chave === ta.dataset.edit); if (!g) return;
  const t0 = g.tickets[0], falhas = auditarTexto(ta.value, t0.pedido, t0.pedido_dados);
  const box = document.querySelector(`[data-aud="${CSS.escape(g.chave)}"]`);
  box.className = "auditoria " + (falhas.length ? "falha" : "ok");
  box.innerHTML = falhas.length ? `${ICO("alerta")} Auditor bloqueou: ${falhas.map(esc).join("; ")}` : `${ICO("check")} Auditor: texto confere com os dados`;
  const b = document.querySelector(`[data-aprovar="${CSS.escape(g.chave)}"]`); if (b && !b.classList.contains("btn--ok")) b.disabled = !!falhas.length;
}

function aprovar(chave) {
  const ap = lerAprov();
  if (ap[chave]) { registrar("aprovação desfeita", ap[chave].tickets); delete ap[chave]; gravarJSON(CH.aprov, ap); renderAprovacao(); renderBadge(); return; }
  const g = gruposFila().find((x) => x.chave === chave); if (!g) return;
  const t0 = g.tickets[0], resp = document.querySelector(`[data-edit="${CSS.escape(chave)}"]`).value;
  if (auditarTexto(resp, t0.pedido, t0.pedido_dados).length) return;
  ap[chave] = { tickets: g.tickets.map((t) => t.ticket_id), pedido: t0.pedido || "", resposta: resp,
    editada: resp !== t0.resposta, em: new Date().toISOString() };
  registrar("resposta aprovada", ap[chave].tickets, ap[chave].editada ? "texto editado pela atendente" : "resposta sugerida sem edição");
  rascunhos.delete(chave);
  gravarJSON(CH.aprov, ap); renderAprovacao(); renderBadge();
}

function encaminhar(chave) {
  const en = lerEncam();
  if (en[chave]) { registrar("encaminhamento desfeito", en[chave].tickets); delete en[chave]; }
  else {
    const g = gruposFila().find((x) => x.chave === chave); if (!g) return;
    en[chave] = { tickets: g.tickets.map((t) => t.ticket_id), pedido: g.tickets[0].pedido || "",
      area: document.querySelector(`[data-area="${CSS.escape(chave)}"]`).value, sugerida: areaSugerida(g.tickets), em: new Date().toISOString() };
    const e = en[chave];
    registrar("encaminhado", e.tickets, AREAS[e.area] + (e.area !== e.sugerida ? ` (sugestão era ${AREAS[e.sugerida]})` : ""));
  }
  gravarJSON(CH.encam, en); renderAprovacao(); renderBadge();
}

function csvBaixar(linhas, nome) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const blob = new Blob(["﻿" + linhas.map((l) => l.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: nome });
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function exportar() {
  const linhas = [["ticket_id", "pedido", "desfecho", "area", "resposta_final", "editada_pela_atendente", "registrado_em"]];
  for (const a of Object.values(lerAprov())) for (const id of a.tickets) linhas.push([id, a.pedido, "resposta_aprovada", "", a.resposta, a.editada ? "sim" : "nao", a.em]);
  for (const e of Object.values(lerEncam())) for (const id of e.tickets) linhas.push([id, e.pedido, "encaminhado", AREAS[e.area], "", "", e.em]);
  csvBaixar(linhas, `resolvidos-${dados.hoje}.csv`);
}

/* Correções da atendente: viram casos no formato de evals/casos.csv (python -m pipeline.importar_correcoes). */
function exportarCorrecoes() {
  const linhas = [["id", "entrada", "resultado_esperado", "tipo", "como_checar"]];
  for (const [id, c] of Object.entries(lerCorr()))
    linhas.push([`A-${id}`, porId.get(id)?.texto ?? "", `${c.categoria}|${c.acao}|${c.pedido}`, "correcao_atendente",
      `sistema decidiu ${c.original.categoria}/${c.original.acao}; atendente: ${c.motivo}`]);
  csvBaixar(linhas, `correcoes-${dados.hoje}.csv`);
}

function salvarCorrecao(id) {
  const t = porId.get(id), motivo = $("#corr-motivo").value.trim();
  if (!motivo) { $("#corr-erro").textContent = "Explique o motivo: ele vira o critério do caso de teste."; $("#corr-motivo").focus(); return; }
  const c = lerCorr();
  c[id] = { categoria: $("#corr-cat").value, acao: $("#corr-acao").value, pedido: t.pedido || "", motivo,
    original: { categoria: t.categoria, acao: t.acao }, em: new Date().toISOString() };
  registrar("correção registrada", [id], `${c[id].categoria} / ${ROTULO[c[id].acao]}: ${motivo}`);
  gravarJSON(CH.corr, c); abrirEvidencia(id); if (!$("#tela-aprovacao").hidden) renderAprovacao();
}

function blocoCorrecao(t) {
  if (!triados.has(t.ticket_id)) return "";
  const c = lerCorr()[t.ticket_id];
  if (c) return `<div class="correcao"><b>Correção registrada:</b> ${esc(c.categoria)} / ${esc(ROTULO[c.acao])}: ${esc(c.motivo)}
    <button class="link" data-remover-corr="${esc(t.ticket_id)}">remover</button></div>`;
  return `<details class="corrigir"><summary>Discordar da decisão</summary>
    <p class="sub">A correção não muda a decisão agora: vira um caso de teste para medir e ajustar as regras.</p>
    <div class="corr-campos">
      <label><span class="etiqueta">Categoria correta</span><select id="corr-cat">${CATEGORIAS.map((k) => `<option ${k === t.categoria ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      <label><span class="etiqueta">Ação correta</span><select id="corr-acao">${Object.entries(ROTULO).map(([k, v]) => `<option value="${k}" ${k !== t.acao ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    </div>
    <label><span class="etiqueta">Motivo</span><textarea id="corr-motivo" rows="2" placeholder="Ex.: o cliente já tinha reclamado deste pedido antes"></textarea></label>
    <p id="corr-erro" class="corr-erro" role="alert"></p>
    <button class="btn btn--lima btn--p" data-salvar-corr="${esc(t.ticket_id)}">Salvar correção</button></details>`;
}

function renderBadge() {
  const ap = lerAprov(), en = lerEncam(), pend = gruposFila().filter((g) => !ap[g.chave] && !en[g.chave]).length;
  $("#badge-fila").textContent = pend || "";
  $("#badge-fila").setAttribute("aria-label", pend + " casos pendentes");
}

/* ---------- Evidência (com o log do ticket) ---------- */
function abrirEvidencia(id) {
  const t0 = porId.get(id); if (!t0) return;
  const t = efetivo(t0), ev = t.evidencia || {}, au = ev.auditor || {};
  const log = (dados.log || []).filter((x) => x.ticket_id === id);
  $("#ev-titulo").textContent = `${t.ticket_id} · ${t.categoria}`;
  $("#ev-corpo").innerHTML = `<blockquote>${esc(t.texto)}</blockquote>
  ${blocoPedido(t)}
  <dl>
    <dt>Decisão</dt><dd><strong>${esc(ROTULO[t.acao] || t.acao)}</strong>${t.critico ? ` <span class="selo selo--bad">${ICO("alerta")}crítico</span>` : ""}${t.puxado ? ' <span class="selo selo--neutro">puxado pela atendente</span>' : ""}</dd>
    <dt>Sinais</dt><dd>${(ev.sinais || []).length ? ev.sinais.map((s) => `<span class="selo selo--${(SINAL[s] || ["neutro"])[0]}">${esc(SINAL[s]?.[1] || s)}</span>`).join(" ") : "nenhum"}</dd>
    <dt>Regra aplicada</dt><dd>${esc((ev.regras || []).join(", ") || "—")}</dd>
    <dt>Motivo</dt><dd>${esc(ev.motivo || "—")}</dd>
    <dt>Auditor</dt><dd>${au.aprovado ? `<span class="selo selo--ok">${ICO("check")}aprovado</span>` : `<span class="selo selo--bad">reprovado</span>`}${(au.falhas || []).length ? ": " + au.falhas.map(esc).join("; ") : ""}</dd>
    <dt>Resposta</dt><dd>${esc(t.resposta || "—")}</dd>
  </dl>
  ${blocoCorrecao(t0)}
  ${blocoHistorico(id)}
  <details class="ev-log"><summary>Passo a passo dos agentes (${log.length} registros)</summary>
    <ol>${log.map((r) => `<li><b>${esc(r.etapa)}</b> ${["leitor", "juiz", "redator", "auditor"].includes(r.etapa) ? resumoLog(r) : esc(typeof r.saida === "object" ? JSON.stringify(r.saida) : r.saida)} <span class="id">${esc(r.ms)} ms</span></li>`).join("")}</ol>
  </details>`;
  $("#evidencia").showModal();
}

function blocoHistorico(id) {
  const h = lerJSON(CH.hist, []).filter((x) => x.tickets.includes(id)).reverse();
  if (!h.length) return "";
  return `<div class="historico"><span class="etiqueta">Histórico da atendente</span><ol>${h.map((x) =>
    `<li><span class="id">${horaBR(x.em)}</span> <b>${esc(x.acao)}</b>${x.detalhe ? ` · ${esc(x.detalhe)}` : ""}</li>`).join("")}</ol></div>`;
}

function ir(tela) {
  if (!dados) return;
  $$(".passos button").forEach((b) => b.dataset.tela === tela ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  $$(".tela").forEach((s) => (s.hidden = s.id !== "tela-" + tela));
  if (tela === "entrada") renderEntrada();
  if (tela === "resultado") renderResultado();
  if (tela === "aprovacao") { renderAprovacao(); setTimeout(() => focarCaso(focoFila), 0); }
  history.replaceState(null, "", location.search + "#" + tela);
  $("#principal").focus({ preventScroll: true });
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-tela],[data-ir],[data-abrir],[data-aprovar],[data-triar-um],[data-filtrar],[data-status],[data-puxar],[data-encaminhar],[data-salvar-corr],[data-remover-corr],.fechar,#triar-sel,#limpar-sel,#mais,#reiniciar,#exportar,#exportar-corr");
  if (!el || el.disabled) return;
  if (el.dataset.tela || el.dataset.ir) ir(el.dataset.tela || el.dataset.ir);
  else if (el.dataset.abrir) abrirEvidencia(el.dataset.abrir);
  else if (el.dataset.triarUm) triar([el.dataset.triarUm]);
  else if (el.dataset.aprovar) aprovar(el.dataset.aprovar);
  else if (el.dataset.encaminhar) encaminhar(el.dataset.encaminhar);
  else if (el.dataset.salvarCorr) salvarCorrecao(el.dataset.salvarCorr);
  else if (el.dataset.removerCorr) { registrar("correção removida", [el.dataset.removerCorr]); const c = lerCorr(); delete c[el.dataset.removerCorr]; gravarJSON(CH.corr, c); abrirEvidencia(el.dataset.removerCorr); if (!$("#tela-aprovacao").hidden) renderAprovacao(); }
  else if (el.id === "exportar-corr") exportarCorrecoes();
  else if (el.dataset.puxar) { registrar("puxado para revisão", [el.dataset.puxar]); const o = lerOverride(); o[el.dataset.puxar] = { em: new Date().toISOString() }; gravarJSON(CH.override, o); renderResultado(); renderBadge(); }
  else if (el.dataset.filtrar) { filtro.urg = filtro.urg === el.dataset.filtrar ? "" : el.dataset.filtrar; limite = PAGINA; renderEntrada(); }
  else if (el.dataset.status) {
    filtro.status = el.dataset.status; limite = PAGINA;
    $$("[data-status]").forEach((b) => b.setAttribute("aria-pressed", b === el)); renderEntrada();
  } else if (el.id === "triar-sel") triar(entrada.map((t) => t.ticket_id).filter((id) => sel.has(id)));
  else if (el.id === "limpar-sel") { sel.clear(); renderEntrada(); }
  else if (el.id === "mais") { limite += PAGINA; renderEntrada(); }
  else if (el.id === "exportar") exportar();
  else if (el.id === "reiniciar") {
    if (!confirm("Reiniciar a demonstração? Triagens, aprovações, encaminhamentos e correções deste navegador serão apagadas.")) return;
    triados.clear(); sel.clear(); salvarTriados(); gravarJSON(CH.aprov, {}); gravarJSON(CH.override, {}); gravarJSON(CH.encam, {}); gravarJSON(CH.corr, {}); gravarJSON(CH.hist, []); rascunhos.clear();
    renderBadge(); ir("entrada");
  } else if (el.classList.contains("fechar")) el.closest("dialog").close();
});
document.addEventListener("change", (e) => {
  const c = e.target;
  if (c.dataset.modelo !== undefined) {
    const chave = c.dataset.modelo, g = gruposFila().find((x) => x.chave === chave), ta = document.querySelector(`[data-edit="${CSS.escape(chave)}"]`);
    if (!g || !ta) return;
    ta.value = c.value === "" ? g.tickets[0].resposta : modelos(g.tickets[0])[+c.value][1];
    rascunhos.set(chave, ta.value); auditarCampo(ta);
    if (c.value !== "") registrar("modelo de resposta usado", g.tickets.map((t) => t.ticket_id), c.options[c.selectedIndex].text);
    return;
  }
  if (c.dataset.marcar) { c.checked ? sel.add(c.dataset.marcar) : sel.delete(c.dataset.marcar); renderGrupos(); renderBarra(); }
  else if (c.dataset.marcarGrupo) {
    entrada.filter((t) => t.urgencia === c.dataset.marcarGrupo && !triados.has(t.ticket_id))
      .forEach((t) => (c.checked ? sel.add(t.ticket_id) : sel.delete(t.ticket_id)));
    renderEntrada();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.dataset.edit) { rascunhos.set(e.target.dataset.edit, e.target.value); auditarCampo(e.target); }
});
/* Atalhos da Fila: J/K navegam, A aprova, F encaminha, E abre a evidência, R edita a resposta, ? mostra a ajuda. */
document.addEventListener("keydown", (e) => {
  if ($("#tela-aprovacao").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if ($("#evidencia").open || $("#atalhos").open) return;
  const alvo = e.target;
  if (alvo.matches("input, textarea, select")) { if (e.key === "Escape") { alvo.blur(); focarCaso(focoFila); } return; }
  const card = $$("#lista-aprovacao .aprov-card")[focoFila];
  const acao = { j: () => focarCaso(focoFila + 1), k: () => focarCaso(focoFila - 1),
    a: () => card?.querySelector("[data-aprovar]:not(:disabled)")?.click(),
    f: () => card?.querySelector("button[data-encaminhar]")?.click(),
    e: () => card?.querySelector("[data-abrir]")?.click(),
    r: () => card?.querySelector("textarea:not([readonly])")?.focus(),
    "?": () => $("#atalhos").showModal() }[e.key.toLowerCase()];
  if (!acao) return;
  e.preventDefault(); acao();
  if ("af".includes(e.key.toLowerCase())) setTimeout(() => focarCaso(focoFila), 0);
});
$("#atalhos").addEventListener("click", (e) => { if (e.target.id === "atalhos" || e.target.closest(".fechar")) $("#atalhos").close(); });

let tBusca;
$("#busca").addEventListener("input", (e) => { clearTimeout(tBusca); tBusca = setTimeout(() => { filtro.busca = e.target.value; limite = PAGINA; renderEntrada(); }, 150); });
$("#evidencia").addEventListener("click", (e) => { if (e.target.id === "evidencia") e.target.close(); });

carregar().then(() => {
  if (!dados) return;
  const foco = new URLSearchParams(location.search).get("ticket");
  if (foco && !triados.has(foco)) sel.add(foco);
  renderBadge();
  const t = location.hash.slice(1);
  ir(["entrada", "resultado", "aprovacao"].includes(t) ? t : "entrada");
});
