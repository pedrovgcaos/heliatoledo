// Panel Helia Toledo — gestión de pedidos y tienda. Interfaz en español.
const SECTIONS = [
  ['resumen', 'Resumen', 'Ventas'],
  ['pedidos', 'Pedidos', 'Ventas'],
  ['productos', 'Productos', 'Tienda'],
  ['ajustes', 'Envíos y pagos', 'Tienda'],
  ['pendientes', 'Pendientes', 'Web'],
];
const STATUS = { nuevo: 'Pendiente de pago', pagado: 'Pagado', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
const STATUS_ORDER = ['nuevo', 'pagado', 'enviado', 'entregado', 'cancelado'];
const SOLD = new Set(['pagado', 'enviado', 'entregado']);
const METHODS = ['Transferencia', 'Bizum', 'PayPal', 'Tarjeta', 'Efectivo', 'Otro'];
const TZ = 'Europe/Madrid';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const euro = n => (n == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n));
const nf = n => Number(n || 0).toLocaleString('es-ES');
const fecha = iso => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const fechaHora = iso => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const diaClave = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const diasDesde = iso => Math.floor((Date.now() - new Date(iso)) / 864e5);
const pill = s => `<span class="pill pill--${s}">${STATUS[s] || s}</span>`;
const itemsTxt = rows => rows.reduce((a, i) => a + i.qty, 0);
const thumb = slug => (state.thumbs[slug] ? `/img/${state.thumbs[slug]}-480.webp` : '');

const state = {
  session: null, index: null, products: null, settings: null, zones: null, sysStatus: null,
  period: 30, filter: '', search: '', productDraft: null,
  thumbs: {},
};
const main = () => $('[data-main]');

// ---------- utilidades ----------
let toastTimer;
function toast(text, error = false) {
  const el = $('[data-toast]');
  el.textContent = text;
  el.classList.toggle('is-error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, error ? 6000 : 3000);
}

async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin',
    ...opts,
    headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('/api/login')) { showLogin('Tu sesión ha caducado. Vuelve a entrar.'); throw new Error(j.error || 'Sesión caducada'); }
  if (!r.ok) throw new Error(j.error || 'No se pudo completar la operación.');
  return j;
}
const post = (body) => api('/api/admin/', { method: 'POST', body: JSON.stringify(body) });

async function loadIndex(force = false) {
  if (state.index && !force) return state.index;
  const j = await api('/api/admin/?view=index');
  state.index = j.rows;
  updateChrome();
  return state.index;
}

function updateChrome() {
  const rows = state.index || [];
  const toCharge = rows.filter(r => r.status === 'nuevo').length;
  const toShip = rows.filter(r => r.status === 'pagado').length;
  const el = $('[data-status]');
  const parts = [];
  if (toCharge) parts.push(`${toCharge} por cobrar`);
  if (toShip) parts.push(`${toShip} por enviar`);
  el.textContent = parts.length ? parts.join(', ') : 'Todo al día';
  el.classList.toggle('is-alert', parts.length > 0);
  const badge = $('[data-badge="pedidos"]');
  if (badge) { badge.textContent = toCharge + toShip; badge.hidden = !(toCharge + toShip); }
  const left = (state.checklist || []).filter(i => !i.done).length;
  const tb = $('[data-badge="pendientes"]');
  if (tb) { tb.textContent = left; tb.hidden = !left; }
}

async function loadChecklist() {
  const j = await api('/api/admin/?view=checklist');
  state.checklist = j.items;
  updateChrome();
  return state.checklist;
}

// ---------- navegación ----------
function route() {
  const h = decodeURIComponent(location.hash.slice(1)) || 'resumen';
  const [path, qs] = h.split('?');
  const [section, id] = path.split('/');
  return { section, id, params: new URLSearchParams(qs || '') };
}

function renderNav() {
  const { section } = route();
  const current = section === 'pedido' ? 'pedidos' : section;
  const groups = [...new Set(SECTIONS.map(s => s[2]))];
  $('[data-nav]').innerHTML = groups.map(g => `<li><p class="side__title">${g}</p><ul>${SECTIONS.filter(s => s[2] === g).map(([id, label]) =>
    `<li><a href="#${id}"${id === current ? ' aria-current="page"' : ''}><span>${label}</span>${id === 'pedidos' || id === 'pendientes' ? `<span class="badge${id === 'pendientes' ? ' badge--soft' : ''}" data-badge="${id}" hidden></span>` : ''}</a></li>`).join('')}</ul></li>`).join('');
  updateChrome();
}

async function render() {
  renderNav();
  const { section, id, params } = route();
  const m = main();
  m.setAttribute('aria-busy', 'true');
  try {
    if (section === 'pedidos') await viewOrders(params);
    else if (section === 'pedido' && id) await viewOrder(id);
    else if (section === 'productos') await viewProducts();
    else if (section === 'ajustes') await viewSettings();
    else if (section === 'pendientes') await viewChecklist();
    else await viewDashboard();
  } catch (err) {
    if (state.session?.admin) m.innerHTML = `<div class="card empty"><strong>No se pudo cargar esta sección</strong>${esc(err.message)}<p style="margin-top:1rem"><button class="btn" type="button" onclick="location.reload()">Reintentar</button></p></div>`;
  } finally {
    m.removeAttribute('aria-busy');
  }
}
addEventListener('hashchange', () => { render(); main().focus({ preventScroll: true }); main().scrollTop = 0; });

const head = (title, text = '', actions = '') => `<header class="sec-head"><div><h1>${title}</h1>${text ? `<p>${text}</p>` : ''}</div>${actions ? `<div class="sec-head__actions">${actions}</div>` : ''}</header>`;

// ---------- Resumen ----------
const PERIODS = [[7, '7 días'], [30, '30 días'], [90, '90 días'], [365, '12 meses'], [0, 'Todo']];

const checklistBanner = () => {
  const items = state.checklist || [];
  const left = items.filter(i => !i.done);
  if (!left.length) return '';
  return `<a class="card banner" href="#pendientes"><span><strong>Faltan ${left.length} tarea${left.length === 1 ? '' : 's'} para terminar la web</strong><span class="muted">Siguiente: ${esc(left[0].title)}</span></span><span class="progress" aria-hidden="true"><i style="width:${((items.length - left.length) / items.length) * 100}%"></i></span></a>`;
};

async function viewChecklist() {
  const items = await loadChecklist();
  const m = main();
  const done = items.filter(i => i.done).length;
  const groups = [...new Set(items.map(i => i.group))];
  const linkLabel = l => (l === '#ajustes' ? 'Ir a Envíos y pagos' : l === '#pedidos' ? 'Ir a Pedidos' : 'Abrir en la web');
  m.innerHTML = `${head('Pendientes', 'Lo que falta para dejar la web terminada. Las tareas automáticas se marcan solas cuando están listas; las demás, márcalas tú.')}
    <section class="card tasks-progress">
      <div><strong>${done} de ${items.length} hechas</strong><span class="muted">${items.length - done ? `Quedan ${items.length - done}.` : 'Todo listo.'}</span></div>
      <span class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${items.length}" aria-valuenow="${done}" aria-label="Progreso"><i style="width:${(done / items.length) * 100}%"></i></span>
    </section>
    ${groups.map(g => `<section class="card"><h2>${g}</h2><ul class="tasks">${items.filter(i => i.group === g).map(i => `
      <li class="task${i.done ? ' is-done' : ''}">
        ${i.auto
          ? `<span class="task__auto${i.done ? ' ok' : ''}" title="Se marca sola">${i.done ? 'Hecho' : 'Pendiente'}</span>`
          : `<label class="task__check"><input type="checkbox" data-task="${i.id}"${i.done ? ' checked' : ''}><span class="sr-only">Marcar «${esc(i.title)}» como hecha</span></label>`}
        <div class="task__body">
          <p class="task__title">${esc(i.title)}</p>
          <p class="task__detail">${esc(i.detail)}</p>
          ${i.note ? `<p class="task__note">${esc(i.note)}</p>` : ''}
          <p class="task__meta">${i.auto ? 'Se marca sola' : i.doneAt ? `Hecha el ${fecha(i.doneAt)}` : 'Márcala cuando esté hecha'}${i.link ? `. <a href="${esc(i.link)}"${i.link.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>${linkLabel(i.link)}</a>` : ''}</p>
        </div>
      </li>`).join('')}</ul></section>`).join('')}`;
  $$('[data-task]', m).forEach(cb => cb.addEventListener('change', async () => {
    cb.disabled = true;
    try {
      const j = await post({ action: 'checklist', item: cb.dataset.task, done: cb.checked });
      state.checklist = j.items;
      toast(cb.checked ? 'Tarea marcada como hecha.' : 'Tarea marcada como pendiente.');
      viewChecklist();
    } catch (err) { toast(err.message, true); cb.checked = !cb.checked; cb.disabled = false; }
  }));
}

async function viewDashboard() {
  const rows = await loadIndex(true);
  loadChecklist().then(() => { const b = $('[data-banner]'); if (b) b.innerHTML = checklistBanner(); }).catch(() => {});
  const m = main();
  if (!rows.length) {
    m.innerHTML = `${head('Resumen', 'Ventas de la tienda online.')}<div data-banner>${checklistBanner()}</div>
      <div class="card empty"><strong>Aún no hay pedidos</strong>Cuando alguien compre en la web, el pedido aparecerá aquí y en Pedidos.<p style="margin-top:1rem"><a class="btn" href="#ajustes">Revisar envíos y pagos</a></p></div>`;
    return;
  }
  const since = state.period ? Date.now() - state.period * 864e5 : 0;
  const inPeriod = rows.filter(r => new Date(r.createdAt) >= since);
  const sold = inPeriod.filter(r => SOLD.has(r.status));
  const revenue = sold.reduce((a, r) => a + r.total, 0);
  const pieces = sold.reduce((a, r) => a + itemsTxt(r.items), 0);
  const valid = inPeriod.filter(r => r.status !== 'cancelado');
  const pending = rows.filter(r => r.status === 'nuevo');
  const toShip = rows.filter(r => r.status === 'pagado');
  const noShipping = rows.filter(r => r.status === 'nuevo' && r.shippingCost == null);

  // top lists
  const tally = (list, key, val) => { const m = new Map(); list.forEach(x => m.set(key(x), (m.get(key(x)) || 0) + val(x))); return [...m].sort((a, b) => b[1] - a[1]); };
  const soldItems = sold.flatMap(r => r.items);
  const byProduct = tally(soldItems, i => i.title, i => i.qty).slice(0, 6);
  const bySize = tally(soldItems, i => i.size, i => i.qty);
  const byCountry = tally(sold, r => r.countryName || r.country, () => 1).slice(0, 6);
  const rank = (list, unit) => list.length
    ? `<ul class="rank">${list.map(([k, v]) => `<li><span>${esc(k)}</span><span class="num">${nf(v)} ${unit}</span><span class="rank__bar"><i style="width:${(v / list[0][1]) * 100}%"></i></span></li>`).join('')}</ul>`
    : '<p class="muted">Sin ventas en este periodo.</p>';

  const attention = [
    ...pending.filter(r => diasDesde(r.createdAt) >= 3).map(r => ({ r, txt: `Pendiente de pago desde hace ${diasDesde(r.createdAt)} días` })),
    ...toShip.filter(r => r.paidAt && diasDesde(r.paidAt) >= 5).map(r => ({ r, txt: `Pagado hace ${diasDesde(r.paidAt)} días, sin enviar` })),
  ];

  m.innerHTML = `${head('Resumen', 'Ventas de la tienda online. Los ingresos cuentan los pedidos pagados, enviados y entregados.')}<div data-banner>${checklistBanner()}</div>
    <div class="dash-filters">
      <div class="seg" role="group" aria-label="Periodo">${PERIODS.map(([d, l]) => `<button type="button" data-period="${d}" aria-pressed="${d === state.period}">${l}</button>`).join('')}</div>
    </div>
    <section class="kpis" aria-label="Indicadores">
      <div class="kpi kpi--hero"><span class="kpi__label">Ingresos</span><span class="kpi__value">${euro(revenue)}</span><span class="kpi__sub">${nf(sold.length)} pedido${sold.length === 1 ? '' : 's'} pagado${sold.length === 1 ? '' : 's'}${state.period ? ` en ${PERIODS.find(p => p[0] === state.period)[1]}` : ''}</span></div>
      <div class="kpi"><span class="kpi__label">Pedidos</span><span class="kpi__value">${nf(valid.length)}</span><span class="kpi__sub">sin contar cancelados</span></div>
      <div class="kpi"><span class="kpi__label">Tapices vendidos</span><span class="kpi__value">${nf(pieces)}</span><span class="kpi__sub">en pedidos pagados</span></div>
      <div class="kpi"><span class="kpi__label">Ticket medio</span><span class="kpi__value">${sold.length ? euro(Math.round(revenue / sold.length)) : '—'}</span><span class="kpi__sub">por pedido pagado</span></div>
      <a class="kpi${pending.length ? ' kpi--warn' : ''}" href="#pedidos?estado=nuevo"><span class="kpi__label">Por cobrar</span><span class="kpi__value">${nf(pending.length)}</span><span class="kpi__sub">${euro(pending.reduce((a, r) => a + r.total, 0))} pendientes</span></a>
      <a class="kpi${toShip.length ? ' kpi--warn' : ''}" href="#pedidos?estado=pagado"><span class="kpi__label">Por enviar</span><span class="kpi__value">${nf(toShip.length)}</span><span class="kpi__sub">pagados, sin enviar</span></a>
      <a class="kpi${noShipping.length ? ' kpi--warn' : ''}" href="#pedidos?estado=nuevo"><span class="kpi__label">Envío por confirmar</span><span class="kpi__value">${nf(noShipping.length)}</span><span class="kpi__sub">pedidos sin coste de envío</span></a>
    </section>
    ${attention.length ? `<section class="card"><h2>Necesita atención</h2><ul class="rank">${attention.map(({ r, txt }) => `<li><a href="#pedido/${r.id}"><strong>${r.id}</strong>, ${esc(r.name)}</a><span class="muted">${txt}</span></li>`).join('')}</ul></section>` : ''}
    <section class="card"><h2>Ingresos ${state.period && state.period <= 90 ? 'por día' : 'por mes'}</h2>${chart(sold)}</section>
    <div class="grid-3" style="margin-top:1rem">
      <section class="card"><h2>Más vendidos</h2>${rank(byProduct, 'uds.')}</section>
      <section class="card"><h2>Tamaños</h2>${rank(bySize, 'uds.')}</section>
      <section class="card"><h2>Países</h2>${rank(byCountry, byCountry.length && byCountry[0][1] === 1 ? 'pedido' : 'pedidos')}</section>
    </div>
    <section class="card" style="margin-top:1rem"><h2>Pedidos recientes</h2>${ordersTable(rows.slice(0, 6))}<p style="margin-top:.8rem"><a class="link" href="#pedidos">Ver todos los pedidos</a></p></section>`;

  $$('[data-period]', m).forEach(b => b.addEventListener('click', () => { state.period = +b.dataset.period; viewDashboard(); }));
}

function chart(sold) {
  const daily = state.period && state.period <= 90;
  const buckets = new Map();
  const now = new Date();
  if (daily) {
    for (let d = state.period - 1; d >= 0; d--) buckets.set(diaClave(new Date(now - d * 864e5)), { v: 0, n: 0 });
  } else {
    const first = state.period ? new Date(now - state.period * 864e5) : new Date(Math.min(...sold.map(r => +new Date(r.paidAt || r.createdAt)), +now));
    const cur = new Date(first.getFullYear(), first.getMonth(), 1);
    while (cur <= now) { buckets.set(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`, { v: 0, n: 0 }); cur.setMonth(cur.getMonth() + 1); }
  }
  sold.forEach(r => {
    const k = daily ? diaClave(r.paidAt || r.createdAt) : diaClave(r.paidAt || r.createdAt).slice(0, 7);
    const b = buckets.get(k);
    if (b) { b.v += r.total; b.n += 1; }
  });
  const data = [...buckets];
  if (!data.length || !sold.length) return '<p class="muted">Aún no hay ingresos en este periodo. Aparecerán aquí cuando marques pedidos como pagados.</p>';
  const max = Math.max(...data.map(([, b]) => b.v), 10);
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  const W = 760, H = 210, L = 44, B = 24, T = 8;
  const bw = (W - L) / data.length;
  const label = k => {
    if (daily) { const [y, mo, d] = k.split('-'); return new Date(y, mo - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); }
    const [y, mo] = k.split('-'); return new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
  };
  const every = Math.ceil(data.length / 8);
  const total = data.reduce((a, [, b]) => a + b.v, 0);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos ${daily ? 'diarios' : 'mensuales'}: ${euro(total)} en total">
    ${[0, .5, 1].map(f => { const y = T + (H - B - T) * (1 - f); return `<line class="grid" x1="${L}" x2="${W}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 8}" y="${y + 4}" text-anchor="end">${euro(Math.round(nice * f))}</text>`; }).join('')}
    ${data.map(([k, b], i) => {
      const h = (b.v / nice) * (H - B - T);
      const x = L + i * bw + bw * .15;
      return `<rect class="b" x="${x}" y="${H - B - h}" width="${Math.max(1, bw * .7)}" height="${Math.max(0, h)}" rx="2"><title>${label(k)}: ${euro(b.v)} (${b.n} pedido${b.n === 1 ? '' : 's'})</title></rect>
        ${i % every === 0 ? `<text class="ax" x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${label(k)}</text>` : ''}`;
    }).join('')}
  </svg>`;
}

// ---------- Pedidos ----------
function ordersTable(rows) {
  if (!rows.length) return '<p class="muted">No hay pedidos con estos filtros.</p>';
  return `<div class="table-scroll orders-table"><table class="data-table">
    <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>País</th><th class="num">Tapices</th><th class="num">Total</th><th>Estado</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="row-link" data-href="#pedido/${r.id}">
      <td><a href="#pedido/${r.id}">${r.id}</a></td><td>${fecha(r.createdAt)}</td><td>${esc(r.name)}<br><span class="muted">${esc(r.email)}</span></td>
      <td>${esc(r.countryName || r.country)}</td><td class="num">${itemsTxt(r.items)}</td><td class="num">${euro(r.total)}${r.shippingCost == null && r.status !== 'cancelado' ? '<br><span class="muted">+ envío</span>' : ''}</td><td>${pill(r.status)}</td></tr>`).join('')}</tbody>
  </table></div>
  <div class="order-cards">${rows.map(r => `<a class="card order-card" href="#pedido/${r.id}"><strong>${esc(r.name)}</strong><strong class="num">${euro(r.total)}</strong><span class="muted">${r.id}, ${fecha(r.createdAt)}</span><span>${pill(r.status)}</span></a>`).join('')}</div>`;
}

async function viewOrders(params) {
  const rows = await loadIndex(true);
  if (params.has('estado')) state.filter = params.get('estado');
  const m = main();
  const counts = Object.fromEntries(STATUS_ORDER.map(s => [s, rows.filter(r => r.status === s).length]));
  m.innerHTML = `${head('Pedidos', 'Todos los pedidos de la web. Abre uno para registrar el pago, el envío o escribir al cliente.',
    rows.length ? '<a class="btn" href="/api/admin/?view=csv" download>Exportar CSV</a>' : '')}
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Filtrar por estado">
        <button type="button" data-filter="" aria-pressed="${!state.filter}">Todos<span class="count">${rows.length}</span></button>
        ${STATUS_ORDER.map(s => `<button type="button" data-filter="${s}" aria-pressed="${state.filter === s}">${STATUS[s]}<span class="count">${counts[s]}</span></button>`).join('')}
      </div>
      <label class="search"><span class="sr-only">Buscar pedidos</span><input type="search" placeholder="Buscar por nombre, e-mail o nº de pedido" value="${esc(state.search)}" data-search></label>
    </div>
    <section class="card" data-list></section>`;
  const draw = () => {
    const q = state.search.trim().toLowerCase();
    const list = rows.filter(r => (!state.filter || r.status === state.filter)
      && (!q || r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)));
    $('[data-list]', m).innerHTML = rows.length ? ordersTable(list) : '<div class="empty"><strong>Aún no hay pedidos</strong>Cuando alguien compre en la web, aparecerá aquí.</div>';
  };
  draw();
  $$('[data-filter]', m).forEach(b => b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    $$('[data-filter]', m).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    history.replaceState(null, '', state.filter ? `#pedidos?estado=${state.filter}` : '#pedidos');
    draw();
  }));
  $('[data-search]', m).addEventListener('input', e => { state.search = e.target.value; draw(); });
}
document.addEventListener('click', e => {
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a, button')) location.hash = tr.dataset.href;
});

// ---------- Detalle del pedido ----------
async function viewOrder(id) {
  const [{ order: o, link, email }] = await Promise.all([api(`/api/admin/?view=order&id=${encodeURIComponent(id)}`), loadSettings(), loadProducts()]);
  const m = main();
  const s = o.shipping;
  const addressTxt = [o.customer.name, s.address, `${s.postal} ${s.city}`, s.region, s.countryName].filter(Boolean).join('\n');
  const actions = {
    nuevo: `<button class="btn btn--primary" data-open="pay">Marcar como pagado</button><button class="btn btn--danger" data-open="cancel">Cancelar pedido</button>`,
    pagado: `<button class="btn btn--primary" data-open="ship">Marcar como enviado</button><button class="btn" data-status="nuevo">Volver a pendiente</button><button class="btn btn--danger" data-open="cancel">Cancelar pedido</button>`,
    enviado: `<button class="btn btn--primary" data-status="entregado">Marcar como entregado</button><button class="btn" data-open="ship">Editar seguimiento</button>`,
    entregado: '',
    cancelado: `<button class="btn" data-status="nuevo">Reabrir pedido</button>`,
  }[o.status];

  m.innerHTML = `<a class="back" href="#pedidos">Volver a pedidos</a>
    <div class="print-only"><img src="/img/logo-helia.svg" alt="Helia Toledo" width="150"><h2 style="margin:1rem 0 .3rem">Albarán ${o.id}</h2><p>${fechaHora(o.createdAt)}</p></div>
    <div class="detail-head"><h1>${o.id}</h1>${pill(o.status)}<span class="muted">${fechaHora(o.createdAt)}</span></div>
    <div class="detail">
      <div class="stack">
        ${actions ? `<section class="card no-print"><h2>Siguiente paso</h2><div class="actions">${actions}</div><div data-form></div></section>` : ''}
        <section class="card">
          <h2>Artículos</h2>
          <div class="table-scroll"><table class="data-table items"><thead><tr><th>Tapiz</th><th>Tamaño</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
          <tbody>${o.items.map(i => `<tr><td>${thumb(i.slug) ? `<img src="${thumb(i.slug)}" alt="" class="no-print">` : ''}<span><strong>${esc(i.title)}</strong><br><span class="muted">${esc(i.sku || '')}</span></span></td><td>${esc(i.size)}</td><td class="num">${i.qty}</td><td class="num">${euro(i.unit)}</td><td class="num">${euro(i.unit * i.qty)}</td></tr>`).join('')}</tbody></table></div>
          <div class="totals">
            <div><span>Subtotal</span><span>${euro(o.subtotal)}</span></div>
            <div><span>Envío</span><span>${o.shippingCost == null ? '<strong class="warn">Por confirmar</strong>' : euro(o.shippingCost)}</span></div>
            <div class="total"><span>Total</span><span>${euro(o.total)}</span></div>
          </div>
          ${o.status === 'nuevo' || o.status === 'pagado' ? `<form class="panel-form no-print" data-shipping-form>
            <label class="field">Coste de envío de este pedido<span class="money"><input name="shippingCost" inputmode="decimal" value="${o.shippingCost ?? ''}" placeholder="Por confirmar"></span><small>Se suma al total. Déjalo vacío si aún no lo sabes.</small></label>
            <div class="panel-form__row"><button class="btn btn--small" type="submit">Guardar envío</button></div>
          </form>` : ''}
        </section>
        ${o.notes ? `<section class="card"><h2>Nota del cliente</h2><p class="quote">${esc(o.notes)}</p></section>` : ''}
        <section class="card no-print">
          <h2>Nota interna</h2>
          <p class="card__hint">Solo la ves tú. Útil para apuntar cómo pagó, qué embalaje usar, etc.</p>
          <form class="stack" data-note-form><label class="field"><span class="sr-only">Nota interna</span><textarea name="note" rows="3">${esc(o.internalNote || '')}</textarea></label>
          <div class="panel-form__row"><span class="note-saved" data-note-saved></span><button class="btn btn--small" type="submit">Guardar nota</button></div></form>
        </section>
      </div>
      <div class="stack">
        <section class="card">
          <h2>Cliente</h2>
          <dl class="kv">
            <dt>Nombre</dt><dd>${esc(o.customer.name)}</dd>
            <dt>E-mail</dt><dd><a href="mailto:${esc(o.customer.email)}">${esc(o.customer.email)}</a></dd>
            ${o.customer.phone ? `<dt>Teléfono</dt><dd><a href="tel:${esc(o.customer.phone.replace(/\s/g, ''))}">${esc(o.customer.phone)}</a></dd>` : ''}
            <dt>Idioma</dt><dd>${o.lang === 'es' ? 'Español' : 'Inglés'}</dd>
            ${o.payment?.method ? `<dt>Pago</dt><dd>${esc(o.payment.method)}${o.payment.reference ? `, ${esc(o.payment.reference)}` : ''}<br><span class="muted">${o.payment.paidAt ? fechaHora(o.payment.paidAt) : ''}</span></dd>` : ''}
            ${o.tracking?.number || o.tracking?.carrier ? `<dt>Seguimiento</dt><dd>${esc([o.tracking.carrier, o.tracking.number].filter(Boolean).join(' '))}${o.tracking.url ? `<br><a href="${esc(o.tracking.url)}" target="_blank" rel="noopener">Abrir seguimiento</a>` : ''}</dd>` : ''}
          </dl>
        </section>
        <section class="card">
          <h2>Dirección de envío</h2>
          <p class="address">${esc(addressTxt)}</p>
          <p class="no-print" style="margin-top:.7rem"><button class="btn btn--small" type="button" data-copy="${esc(addressTxt)}">Copiar dirección</button></p>
        </section>
        <section class="card no-print">
          <h2>Escribir al cliente</h2>
          <p class="card__hint">Abre tu correo con el mensaje ya escrito${o.lang === 'es' ? ' en español' : ' en inglés'}, para revisarlo y enviarlo.</p>
          <div class="actions">
            ${o.status === 'nuevo' ? '<button class="btn btn--small" type="button" data-mail="pay">Pedir el pago</button>' : ''}
            ${o.status === 'enviado' ? '<button class="btn btn--small" type="button" data-mail="shipped">Avisar del envío</button>' : ''}
            <a class="btn btn--small" href="mailto:${esc(o.customer.email)}?subject=${encodeURIComponent(`${o.lang === 'es' ? 'Tu pedido' : 'Your order'} ${o.id}`)}">Mensaje en blanco</a>
          </div>
          ${email ? `<div class="actions" style="margin-top:.6rem">
            <button class="btn btn--small btn--ghost" type="button" data-resend="confirmation">Reenviar confirmación automática</button>
            ${o.status === 'enviado' || o.status === 'entregado' ? '<button class="btn btn--small btn--ghost" type="button" data-resend="shipped">Reenviar aviso de envío</button>' : ''}
          </div>` : ''}
          <p class="card__hint" style="margin:1rem 0 .4rem">Página del pedido para el cliente:</p>
          <div class="copy-row"><input readonly value="${esc(link)}" aria-label="Enlace de seguimiento del cliente"><button class="btn btn--small" type="button" data-copy="${esc(link)}">Copiar</button></div>
        </section>
        <section class="card no-print">
          <h2>Historial</h2>
          <ol class="timeline">${[...(o.history || [])].reverse().map(h => `<li>${esc(h.text)}<time datetime="${h.at}">${fechaHora(h.at)}${h.by === 'web' ? ', web' : ''}</time></li>`).join('')}</ol>
        </section>
        <p class="no-print"><button class="btn" type="button" data-print>Imprimir albarán</button></p>
      </div>
    </div>`;

  const refresh = async () => { await loadIndex(true); viewOrder(id); };
  const act = async (body, ok) => {
    try { await post({ id: o.id, ...body }); toast(ok); await refresh(); } catch (err) { toast(err.message, true); }
  };
  const formSlot = $('[data-form]', m);

  $$('[data-status]', m).forEach(b => b.addEventListener('click', () => {
    b.disabled = true;
    act({ action: 'status', status: b.dataset.status }, b.dataset.status === 'entregado' ? 'Pedido marcado como entregado.' : 'Pedido actualizado.');
  }));
  $$('[data-open]', m).forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.open;
    if (kind === 'pay') {
      formSlot.innerHTML = `<form class="panel-form" data-sub>
        <div class="grid-2"><label class="field">Método de pago<select name="method">${METHODS.map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="field">Referencia <small>opcional</small><input name="reference" placeholder="Ej.: concepto o nº de operación"></label></div>
        <div class="panel-form__row"><button class="btn btn--ghost btn--small" type="button" data-close>Cancelar</button><button class="btn btn--primary btn--small" type="submit">Confirmar pago de ${euro(o.total)}</button></div></form>`;
    } else if (kind === 'ship') {
      formSlot.innerHTML = `<form class="panel-form" data-sub>
        <div class="grid-2"><label class="field">Transportista<input name="carrier" value="${esc(o.tracking?.carrier || '')}" placeholder="Correos, SEUR, DHL…"></label>
        <label class="field">Nº de seguimiento<input name="number" value="${esc(o.tracking?.number || '')}"></label></div>
        <label class="field">Enlace de seguimiento <small>opcional</small><input name="url" type="url" value="${esc(o.tracking?.url || '')}" placeholder="https://"></label>
        ${email ? '<label class="check"><input type="checkbox" name="notify" checked> Avisar al cliente por e-mail</label>' : ''}
        <div class="panel-form__row"><button class="btn btn--ghost btn--small" type="button" data-close>Cancelar</button><button class="btn btn--primary btn--small" type="submit">${o.status === 'enviado' ? 'Guardar seguimiento' : 'Marcar como enviado'}</button></div></form>`;
    } else if (kind === 'cancel') {
      formSlot.innerHTML = `<form class="panel-form" data-sub>
        <label class="field">Motivo <small>opcional, solo para ti</small><input name="reason" placeholder="Ej.: el cliente no pagó"></label>
        <div class="panel-form__row"><button class="btn btn--ghost btn--small" type="button" data-close>Volver</button><button class="btn btn--danger btn--small" type="submit">Cancelar pedido</button></div></form>`;
    }
    const f = $('[data-sub]', formSlot);
    f.querySelector('input, select')?.focus();
    $('[data-close]', f).addEventListener('click', () => { formSlot.innerHTML = ''; });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      f.querySelector('[type=submit]').disabled = true;
      if (kind === 'pay') act({ action: 'status', status: 'pagado', method: d.method, reference: d.reference }, 'Pago registrado.');
      if (kind === 'ship') act({ action: 'status', status: 'enviado', carrier: d.carrier, number: d.number, url: d.url, notify: Boolean(d.notify) }, 'Pedido marcado como enviado.');
      if (kind === 'cancel') act({ action: 'status', status: 'cancelado', reason: d.reason }, 'Pedido cancelado.');
    });
  }));

  $('[data-shipping-form]', m)?.addEventListener('submit', e => {
    e.preventDefault();
    const v = e.target.elements.shippingCost.value.trim().replace(',', '.');
    act({ action: 'shipping', shippingCost: v === '' ? null : v }, 'Coste de envío guardado.');
  });
  $('[data-note-form]', m).addEventListener('submit', async e => {
    e.preventDefault();
    try { await post({ action: 'note', id: o.id, note: e.target.elements.note.value }); $('[data-note-saved]', m).textContent = 'Guardada'; toast('Nota guardada.'); } catch (err) { toast(err.message, true); }
  });
  $$('[data-copy]', m).forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiado.'); } catch { toast('No se pudo copiar. Selecciona el texto y cópialo a mano.', true); }
  }));
  $$('[data-mail]', m).forEach(b => b.addEventListener('click', () => { location.href = mailto(o, b.dataset.mail, link); }));
  $$('[data-resend]', m).forEach(b => b.addEventListener('click', () => {
    b.disabled = true;
    act({ action: 'email', kind: b.dataset.resend }, 'E-mail enviado al cliente.');
  }));
  $('[data-print]', m).addEventListener('click', () => print());
}

function mailto(o, kind, link) {
  const es = o.lang === 'es';
  const first = o.customer.name.split(' ')[0];
  const lines = o.items.map(i => `- ${i.title}, ${i.size} × ${i.qty}: ${euro(i.unit * i.qty)}`).join('\n');
  const ship = o.shippingCost == null ? (es ? 'por confirmar' : 'to be confirmed') : euro(o.shippingCost);
  const pay = state.settings?.paymentInstructions?.[es ? 'es' : 'en'] || (es ? '[Escribe aquí cómo pagar: IBAN, Bizum…]' : '[Write how to pay here: IBAN, Bizum…]');
  let subject; let body;
  if (kind === 'pay') {
    subject = es ? `Tu pedido ${o.id}: datos de pago` : `Your order ${o.id}: payment details`;
    body = es
      ? `Hola ${first}:\n\nGracias por tu pedido ${o.id}.\n\n${lines}\nSubtotal: ${euro(o.subtotal)}\nEnvío: ${ship}\nTotal: ${euro(o.total)}\n\nPara pagar:\n${pay}\n\nIndica el número de pedido ${o.id} en el concepto. En cuanto reciba el pago, preparo el envío (10–15 días).\n\nPuedes seguir tu pedido aquí: ${link}\n\nUn abrazo,\nHelia`
      : `Hello ${first},\n\nThank you for your order ${o.id}.\n\n${lines}\nSubtotal: ${euro(o.subtotal)}\nShipping: ${ship}\nTotal: ${euro(o.total)}\n\nTo pay:\n${pay}\n\nPlease include the order number ${o.id} as the payment reference. As soon as I receive it, I'll prepare your tapestry (10–15 days).\n\nYou can follow your order here: ${link}\n\nBest,\nHelia`;
  } else {
    const t = [o.tracking?.carrier, o.tracking?.number].filter(Boolean).join(' ');
    subject = es ? `Tu pedido ${o.id} ya está en camino` : `Your order ${o.id} is on its way`;
    body = es
      ? `Hola ${first}:\n\nTu pedido ${o.id} ya está en camino.${t ? `\nSeguimiento: ${t}` : ''}${o.tracking?.url ? `\n${o.tracking.url}` : ''}\n\nDetalles del pedido: ${link}\n\n¡Gracias!\nHelia`
      : `Hello ${first},\n\nYour order ${o.id} is on its way.${t ? `\nTracking: ${t}` : ''}${o.tracking?.url ? `\n${o.tracking.url}` : ''}\n\nOrder details: ${link}\n\nThank you!\nHelia`;
  }
  return `mailto:${o.customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------- Productos ----------
async function loadProducts(force = false) {
  if (state.products && !force) return state.products;
  const j = await api('/api/admin/?view=products');
  state.products = j.products;
  j.products.forEach(p => { state.thumbs[p.slug] = p.image; });
  return state.products;
}

async function viewProducts() {
  const products = await loadProducts(true);
  state.productDraft = structuredClone(products);
  const m = main();
  m.innerHTML = `${head('Productos', 'Precios por tamaño y disponibilidad de cada tapiz. Los cambios se ven en la web en unos segundos.')}
    <div class="products">${products.map((p, i) => `
      <article class="card product${p.hidden ? ' is-hidden' : ''}" data-i="${i}">
        <img src="${thumb(p.slug)}" alt="" loading="lazy">
        <div><p class="product__name"><a href="/shop/${p.slug}/" target="_blank" rel="noopener">${esc(p.title)}</a></p><p class="product__meta">Colección ${p.collection}, ref. ${esc(p.sku)}</p></div>
        <div class="sizes">${p.sizes.map((s, j) => `
          <div class="size"><span>${esc(s.label)}</span>
            <span class="money"><input inputmode="decimal" aria-label="Precio ${esc(p.title)} ${esc(s.label)}" data-price="${j}" value="${s.price}"></span>
            <label class="check"><input type="checkbox" data-size-out="${j}"${s.soldOut ? ' checked' : ''}> Agotado</label>
          </div>`).join('')}
        </div>
        <div class="product__flags">
          <label class="check"><input type="checkbox" data-flag="soldOut"${p.soldOut ? ' checked' : ''}> Todo agotado</label>
          <label class="check"><input type="checkbox" data-flag="hidden"${p.hidden ? ' checked' : ''}> Ocultar en la web</label>
        </div>
      </article>`).join('')}
    </div>
    <div class="savebar" data-savebar hidden><span data-savecount>Cambios sin guardar</span><span class="actions"><button class="btn btn--ghost" type="button" data-discard>Descartar</button><button class="btn" type="button" data-save>Guardar cambios</button></span></div>`;

  const dirty = () => JSON.stringify(state.productDraft) !== JSON.stringify(state.products);
  const sync = () => {
    $('[data-savebar]', m).hidden = !dirty();
    const n = state.productDraft.filter((p, i) => JSON.stringify(p) !== JSON.stringify(state.products[i])).length;
    $('[data-savecount]', m).textContent = `${n} producto${n === 1 ? '' : 's'} con cambios sin guardar`;
  };
  $('.products', m).addEventListener('input', e => {
    const card = e.target.closest('[data-i]');
    if (!card) return;
    const p = state.productDraft[+card.dataset.i];
    if (e.target.dataset.price !== undefined) {
      const v = Number(e.target.value.replace(',', '.'));
      p.sizes[+e.target.dataset.price].price = v;
      e.target.classList.toggle('changed', v !== state.products[+card.dataset.i].sizes[+e.target.dataset.price].price);
    }
    if (e.target.dataset.sizeOut !== undefined) p.sizes[+e.target.dataset.sizeOut].soldOut = e.target.checked;
    if (e.target.dataset.flag) { p[e.target.dataset.flag] = e.target.checked; card.classList.toggle('is-hidden', p.hidden); }
    sync();
  });
  $('[data-discard]', m).addEventListener('click', () => viewProducts());
  $('[data-save]', m).addEventListener('click', async e => {
    const bad = state.productDraft.flatMap(p => p.sizes.filter(s => !(s.price > 0)).map(s => `${p.title} ${s.label}`));
    if (bad.length) { toast(`Revisa el precio de ${bad[0]}.`, true); return; }
    e.target.disabled = true;
    try {
      const payload = Object.fromEntries(state.productDraft.map(p => [p.slug, {
        hidden: p.hidden, soldOut: p.soldOut,
        sizes: Object.fromEntries(p.sizes.map(s => [s.label, { price: s.price, soldOut: s.soldOut }])),
      }]));
      const j = await post({ action: 'products', products: payload });
      state.products = j.products;
      toast('Productos guardados. La web se actualiza en unos segundos.');
      viewProducts();
    } catch (err) { toast(err.message, true); e.target.disabled = false; }
  });
}

// ---------- Envíos y pagos ----------
async function loadSettings(force = false) {
  if (state.settings && !force) return state.settings;
  const j = await api('/api/admin/?view=settings');
  state.settings = j.settings; state.zones = j.zones; state.sysStatus = j.status;
  return state.settings;
}

async function viewSettings() {
  await loadSettings(true);
  const s = state.settings;
  const st = state.sysStatus;
  const m = main();
  m.innerHTML = `${head('Envíos y pagos', 'Lo que ve el cliente al comprar: coste de envío según el país y cómo pagar.')}
    <form class="stack" data-settings>
      <section class="card">
        <h2>Tienda</h2>
        <label class="check"><input type="checkbox" name="shopOpen"${s.shopOpen !== false ? ' checked' : ''}> Aceptar pedidos en la web</label>
        <label class="field" style="margin-top:.9rem">Mensaje cuando la tienda está cerrada <small>en inglés, se muestra en la web</small><input name="closedMessage" value="${esc(s.closedMessage)}" placeholder="The shop is closed until 7 January."></label>
      </section>
      <section class="card">
        <h2>Coste de envío por pedido</h2>
        <p class="card__hint">Se suma automáticamente según el país. Si dejas una zona vacía, el pedido entra con el envío «por confirmar» y lo fijas tú en el pedido.</p>
        <div class="zones">${Object.entries(state.zones).map(([z, label]) => `<label class="field">${label}<span class="money"><input name="ship_${z}" inputmode="decimal" value="${s.shipping[z] ?? ''}" placeholder="Por confirmar"></span></label>`).join('')}</div>
        <label class="field" style="margin-top:1rem;max-width:280px">Envío gratis a partir de <small>opcional</small><span class="money"><input name="freeShippingFrom" inputmode="decimal" value="${s.freeShippingFrom ?? ''}" placeholder="Sin envío gratis"></span></label>
      </section>
      <section class="card">
        <h2>Cómo pagar</h2>
        <p class="card__hint">Aparece en la página del pedido del cliente, en el e-mail de confirmación y en el mensaje «Pedir el pago». Por ejemplo: IBAN y titular, número de Bizum o enlace de PayPal.</p>
        <div class="grid-2">
          <label class="field">En inglés <small>la web está en inglés</small><textarea name="pay_en" rows="5" placeholder="Bank transfer to ES00 0000 0000 0000 0000 0000 (Helia Toledo)&#10;or Bizum to +34 600 000 000">${esc(s.paymentInstructions.en)}</textarea></label>
          <label class="field">En español<textarea name="pay_es" rows="5" placeholder="Transferencia a ES00 0000 0000 0000 0000 0000 (Helia Toledo)&#10;o Bizum al +34 600 000 000">${esc(s.paymentInstructions.es)}</textarea></label>
        </div>
      </section>
      <section class="card">
        <h2>Avisos</h2>
        <label class="field" style="max-width:420px">E-mail donde recibir los pedidos nuevos<input name="notifyEmail" type="email" value="${esc(s.notifyEmail)}"></label>
        <ul class="status-list" style="margin-top:1rem">
          <li>${st.email ? '<span class="ok">Activos</span>' : '<span class="warn">Desactivados</span>'}<span>E-mails automáticos (confirmación al cliente y aviso de pedido nuevo)${st.email ? `, enviados desde ${esc(st.emailFrom)}` : '. Para activarlos, añade RESEND_API_KEY y EMAIL_FROM en Vercel. Mientras tanto, los pedidos aparecen aquí y puedes escribir al cliente desde cada pedido.'}</span></li>
          <li>${st.storage === 'blob' ? '<span class="ok">Privado</span>' : '<span class="warn">Local</span>'}<span>${st.storage === 'blob' ? 'Pedidos guardados en el almacenamiento privado de Vercel.' : 'Modo de prueba: los pedidos se guardan en este ordenador (.data/).'}</span></li>
        </ul>
      </section>
      <div class="savebar"><span>Los cambios se aplican en la web en unos segundos.</span><button class="btn" type="submit">Guardar</button></div>
    </form>
    <section class="card" style="margin-top:1rem">
      <h2>Mantenimiento</h2>
      <p class="card__hint">Si la lista de pedidos no coincide con lo que esperas, reconstruye el índice a partir de los pedidos guardados.</p>
      <button class="btn btn--small" type="button" data-rebuild>Reconstruir índice de pedidos</button>
    </section>`;

  $('[data-settings]', m).addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements;
    const val = name => { const v = f[name].value.trim().replace(',', '.'); return v === '' ? null : v; };
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const j = await post({ action: 'settings', settings: {
        shopOpen: f.shopOpen.checked, closedMessage: f.closedMessage.value, notifyEmail: f.notifyEmail.value,
        shipping: Object.fromEntries(Object.keys(state.zones).map(z => [z, val(`ship_${z}`)])),
        freeShippingFrom: val('freeShippingFrom'),
        paymentInstructions: { en: f.pay_en.value, es: f.pay_es.value },
      } });
      state.settings = j.settings;
      toast('Ajustes guardados.');
    } catch (err) { toast(err.message, true); }
    btn.disabled = false;
  });
  $('[data-rebuild]', m).addEventListener('click', async e => {
    e.target.disabled = true;
    try { const j = await post({ action: 'rebuild-index' }); state.index = null; toast(`Índice reconstruido: ${j.count} pedidos.`); } catch (err) { toast(err.message, true); }
    e.target.disabled = false;
  });
}

// ---------- entrada ----------
function showLogin(msg) {
  $('[data-app]').hidden = true;
  $('[data-login]').hidden = false;
  if (msg) $('[data-login-msg]').textContent = msg;
  const input = $('[data-login-form] input[name=password]');
  input.disabled = state.session && !state.session.configured;
  $('[data-login-form] button').disabled = input.disabled;
  if (!input.disabled) input.focus();
}

$('[data-login-form]').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('[data-login-error]');
  const btn = e.target.querySelector('button');
  err.textContent = '';
  btn.disabled = true;
  try {
    await api('/api/login/', { method: 'POST', body: JSON.stringify({ password: e.target.elements.password.value }) });
    e.target.reset();
    await startApp();
  } catch (ex) {
    err.textContent = ex.message;
  }
  btn.disabled = false;
});

document.addEventListener('click', async e => {
  if (!e.target.closest('[data-act="logout"]')) return;
  await fetch('/api/login/', { method: 'DELETE' }).catch(() => {});
  state.index = state.products = state.settings = null;
  state.session = { ...state.session, admin: false };
  showLogin('Has salido del panel.');
});

async function startApp() {
  state.session = await fetch('/api/session/', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ admin: false, configured: true }));
  if (!state.session.admin) {
    showLogin(state.session.configured ? '' : 'El panel aún no tiene contraseña. Defínela en Vercel (Settings → Environment Variables) con el nombre ADMIN_PASSWORD y vuelve a publicar.');
    return;
  }
  $('[data-login]').hidden = true;
  $('[data-app]').hidden = false;
  loadProducts().catch(() => {}); // thumbnails for orders
  await render();
}
startApp();
