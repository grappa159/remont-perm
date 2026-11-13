(() => {
const C = window.CONFIG, PRICE = window.PRICE, PACKS = window.PACKS;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
const icon = id => `<svg><use href="#i-${id}"/></svg>`;
const catById = id => PRICE.find(c => c.id === id);
const findItem = (cat, name) => (catById(cat)?.items || []).find(i => i[0] === name);
const key = (cat, name) => cat + '|' + name;

/* ---------- смета (state) ---------- */
let cart = new Map();
try { cart = new Map(JSON.parse(localStorage.getItem('remont-cart') || '[]')); } catch (e) { /* приватный режим */ }
const save = () => { try { localStorage.setItem('remont-cart', JSON.stringify([...cart])); } catch (e) {} };

function setQty(cat, name, q) {
  const k = key(cat, name);
  q = Math.max(0, Math.round(Number(q) || 0));
  if (q === 0) cart.delete(k); else cart.set(k, q);
  save(); syncAll();
}
function addQty(cat, name, q) { setQty(cat, name, (cart.get(key(cat, name)) || 0) + q); }

function cartLines() {
  return [...cart].map(([k, q]) => {
    const [cat, name] = k.split('|');
    const it = findItem(cat, name);
    if (!it) return null;
    return { cat, name, q, price: it[1], unit: it[2], from: !!it[3], sum: it[1] ? it[1] * q : 0 };
  }).filter(Boolean);
}
const total = () => cartLines().reduce((s, l) => s + l.sum, 0);

/* ---------- услуги ---------- */
function renderServices() {
  const cards = PRICE.map(c => {
    const prices = c.items.map(i => i[1]).filter(Boolean);
    const min = prices.length ? `от ${rub(Math.min(...prices))}` : 'по замеру';
    return `<button class="svc" data-cat="${c.id}">
      <span class="svc__icon">${icon(c.icon)}</span>
      <h3>${esc(c.title)}</h3><p>${esc(c.text)}</p>
      <span class="svc__foot"><em>${min}</em><span>${c.items.length} поз. ${icon('arrow')}</span></span>
    </button>`;
  }).join('');
  $('#servicesGrid').innerHTML = cards + `<a class="svc svc--cta" href="#packs">
    <span class="svc__icon" style="background:rgba(255,255,255,.2);color:#fff">${icon('check')}</span>
    <h3>Всё сразу — под ключ</h3><p>Квартира, дом, комната или санузел: соберём смету одним нажатием.</p>
    <span class="svc__foot"><span>Выбрать объект</span>${icon('arrow')}</span></a>`;
  $('#servicesGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (b) openCat(b.dataset.cat);
  });
  $('#heroCount').textContent = PRICE.reduce((s, c) => s + c.items.length, 0);
}

/* ---------- пакеты ---------- */
function renderPacks() {
  $('#packsGrid').innerHTML = PACKS.map(p => `
    <article class="pack" data-pack="${p.id}">
      <div><h3>${esc(p.title)}</h3><span class="pack__min">Минимальный объём ${esc(p.min)}</span></div>
      <ul class="pack__cats">${p.cats.map(id => `<li><button data-cat="${id}">${esc(catById(id).short)}</button></li>`).join('')}</ul>
      <button class="btn btn--line btn--sm" data-add-pack="${p.id}">${icon('plus')} Добавить в смету</button>
    </article>`).join('');
  $('#packsGrid').addEventListener('click', e => {
    const chip = e.target.closest('[data-cat]');
    if (chip) return openCat(chip.dataset.cat);
    const b = e.target.closest('[data-add-pack]');
    if (!b) return;
    const p = PACKS.find(x => x.id === b.dataset.addPack);
    p.add.forEach(([cat, name, q]) => { if (findItem(cat, name)) addQty(cat, name, q); });
    b.closest('.pack').classList.add('is-added');
    toast(`«${p.title}» добавлен в смету`, true);
  });
}

/* ---------- прайс ---------- */
let currentCat = 'all';
function renderTabs() {
  const all = PRICE.reduce((s, c) => s + c.items.length, 0);
  $('#tabs').innerHTML = `<button class="tab" role="tab" data-tab="all" aria-selected="true">Все <small>${all}</small></button>` +
    PRICE.map(c => `<button class="tab" role="tab" data-tab="${c.id}" aria-selected="false">${icon(c.icon)}${esc(c.short)} <small>${c.items.length}</small></button>`).join('');
  $('#tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    currentCat = t.dataset.tab; $('#search').value = ''; renderPrice();
  });
  $('#search').addEventListener('input', () => renderPrice());
}

function priceCell(it) {
  if (!it[1]) return `<span class="row__price ask">по замеру</span>`;
  return `<span class="row__price">${it[3] ? '<small>от </small>' : ''}${rub(it[1])}<small> / ${esc(it[2])}</small></span>`;
}
function ctrlCell(cat, it) {
  const q = cart.get(key(cat, it[0]));
  if (q) return `<span class="row__ctrl qty" data-cat="${cat}" data-name="${esc(it[0])}"><button data-d="-1" aria-label="Меньше">−</button><input type="number" min="0" value="${q}" aria-label="Количество, ${esc(it[2])}"><button data-d="1" aria-label="Больше">+</button></span>`;
  return `<button class="row__ctrl add" data-cat="${cat}" data-name="${esc(it[0])}">${icon('plus')}В смету</button>`;
}

function renderPrice() {
  const q = $('#search').value.trim().toLowerCase().replace(/ё/g, 'е');
  // поиск по основе слова: «смеситель» найдёт «смесителя», «плитка» — «плитки»
  const stems = q.split(/\s+/).filter(Boolean).map(w => w.length > 4 ? w.slice(0, Math.max(4, w.length - 2)) : w);
  const match = s => {
    const words = s.toLowerCase().replace(/ё/g, 'е').split(/[\s,()«»"/–-]+/);
    return stems.every(st => words.some(w => w.startsWith(st) || w.replace(/^ø/, '').startsWith(st)));
  };
  $$('#tabs .tab').forEach(t => t.setAttribute('aria-selected', !q && t.dataset.tab === currentCat));
  const cats = q || currentCat === 'all' ? PRICE : [catById(currentCat)];
  const rows = [];
  // сначала ищем по названиям работ; если пусто — по названию раздела
  const byTitle = q && !cats.some(c => c.items.some(it => match(it[0])));
  cats.forEach(c => c.items.forEach(it => {
    if (q && !match(byTitle ? c.title : it[0])) return;
    const inCart = cart.has(key(c.id, it[0]));
    rows.push(`<div class="row${inCart ? ' in-cart' : ''}">
      <span class="row__name">${esc(it[0])}${(q || currentCat === 'all') ? `<span class="row__cat">${esc(c.title)}</span>` : ''}</span>
      ${priceCell(it)}${ctrlCell(c.id, it)}</div>`);
  }));
  $('#priceList').innerHTML = rows.join('') || `<p class="empty">Ничего не нашлось. Попробуйте другое слово или напишите задачу в заявке — мастер подскажет.</p>`;
}

function initPriceEvents() {
  const list = $('#priceList');
  list.addEventListener('click', e => {
    const add = e.target.closest('.add');
    if (add) {
      const it = findItem(add.dataset.cat, add.dataset.name);
      addQty(add.dataset.cat, add.dataset.name, 1);
      toast(`Добавлено: ${it[0]}`, true);
      return;
    }
    const b = e.target.closest('.qty button');
    if (b) {
      const w = b.closest('.qty');
      addQty(w.dataset.cat, w.dataset.name, Number(b.dataset.d));
    }
  });
  list.addEventListener('change', e => {
    const w = e.target.closest('.qty');
    if (w) setQty(w.dataset.cat, w.dataset.name, e.target.value);
  });
}

function openCat(id) {
  currentCat = id; $('#search').value = ''; renderPrice();
  $('#price').scrollIntoView({ behavior: 'smooth' });
  const tab = $(`#tabs [data-tab="${id}"]`);
  tab?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  const box = $('#priceList'); box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
}

/* ---------- смета: панель ---------- */
function renderCart() {
  const lines = cartLines();
  $('#cartCount').textContent = lines.length;
  $('#cartTotal').textContent = rub(total());
  $('#cartList').innerHTML = lines.length ? lines.map(l => `
    <div class="ci">
      <span class="ci__name">${esc(l.name)}<small>${esc(catById(l.cat).title)} · ${l.price ? `${l.from ? 'от ' : ''}${rub(l.price)} / ${esc(l.unit)}` : 'по замеру'}</small></span>
      <span class="ci__sum">${l.price ? rub(l.sum) : '—'}</span>
      <span class="ci__ctrl">
        <span class="qty" data-cat="${l.cat}" data-name="${esc(l.name)}"><button data-d="-1">−</button><input type="number" min="0" value="${l.q}" aria-label="Количество"><button data-d="1">+</button></span>
        <span>${esc(l.unit)}</span>
        <button class="ci__del" data-del>Убрать</button>
      </span>
    </div>`).join('') : `<p class="cart__empty">Смета пока пустая.<br>Добавьте работы из прайса или выберите пакет «под ключ».</p>`;

  const n = lines.length;
  $('#reqTotal').textContent = rub(total());
  $('#reqItems').textContent = n ? `${n} ${plural(n, ['позиция', 'позиции', 'позиций'])} в смете · без материалов, точная сумма после замера` : 'Смета пока пустая — добавьте работы из прайса или пакета';
}
const plural = (n, f) => f[(n % 100 > 4 && n % 100 < 20) ? 2 : [2, 0, 1, 1, 1, 2][Math.min(n % 10, 5)]];

function initCart() {
  const cartEl = $('#cart'), shade = $('#cartShade');
  const open = () => { cartEl.hidden = false; shade.hidden = false; requestAnimationFrame(() => cartEl.classList.add('is-open')); };
  const close = () => { cartEl.classList.remove('is-open'); shade.hidden = true; setTimeout(() => { if (!cartEl.classList.contains('is-open')) cartEl.hidden = true; }, 350); };
  window.__openCart = open;
  $('#cartBtn').addEventListener('click', open);
  $('#cartClose').addEventListener('click', close);
  shade.addEventListener('click', close);
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $('#cartToReq').addEventListener('click', close);
  $('#cartClear').addEventListener('click', () => { cart.clear(); save(); syncAll(); $$('.pack').forEach(p => p.classList.remove('is-added')); });
  $('#cartList').addEventListener('click', e => {
    const w = e.target.closest('.ci')?.querySelector('.qty');
    if (!w) return;
    if (e.target.closest('[data-del]')) return setQty(w.dataset.cat, w.dataset.name, 0);
    const b = e.target.closest('.qty button');
    if (b) addQty(w.dataset.cat, w.dataset.name, Number(b.dataset.d));
  });
  $('#cartList').addEventListener('change', e => {
    const w = e.target.closest('.qty');
    if (w) setQty(w.dataset.cat, w.dataset.name, e.target.value);
  });
}

function syncAll() {
  renderPrice(); renderCart();
  const b = $('#cartBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
}

/* ---------- заявка ---------- */
function channelNote() {
  if (C.whatsapp) return 'Заявка со сметой откроется в WhatsApp мастера.';
  if (C.telegram) return 'Заявка скопируется, откроется Telegram мастера — вставьте сообщение.';
  return 'Заявка скопируется и откроется чат на Авито — просто вставьте сообщение.';
}
function initRequest() {
  $('#formNote').textContent = channelNote();
  $('#reqForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements, lines = cartLines();
    let text = `Здравствуйте, Евгений! Заявка на ремонт.\nОбъект: ${f.object.value}\nИмя: ${f.name.value}\nТелефон: ${f.phone.value}`;
    if (f.comment.value.trim()) text += `\nЗадача: ${f.comment.value.trim()}`;
    if (lines.length) {
      text += `\n\nСмета с сайта:\n` + lines.map(l => `• ${l.name} — ${l.q} ${l.unit}${l.price ? ` × ${l.from ? 'от ' : ''}${rub(l.price)} = ${rub(l.sum)}` : ' (по замеру)'}`).join('\n');
      text += `\nИтого за работы: ${rub(total())}`;
    }
    if (C.whatsapp) { window.open(`https://wa.me/${C.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); return; }
    try { await navigator.clipboard.writeText(text); toast('Заявка скопирована — вставьте её в чат'); }
    catch (err) { prompt('Скопируйте текст заявки:', text); }
    window.open(C.telegram ? `https://t.me/${C.telegram}` : C.avitoUrl, '_blank', 'noopener');
  });
}

/* ---------- прочее ---------- */
let toastTimer;
function toast(msg, withCart) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (withCart ? '<b role="button" tabindex="0">Смета →</b>' : '');
  t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  const b = $('b', t); if (b) b.onclick = () => { t.classList.remove('show'); window.__openCart(); };
}

function initHeader() {
  const header = $('#header');
  const onScroll = () => header.classList.toggle('is-solid', scrollY > 10);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const burger = $('#burger'), nav = $('#nav');
  burger.addEventListener('click', () => {
    const o = burger.getAttribute('aria-expanded') !== 'true';
    burger.setAttribute('aria-expanded', o); nav.classList.toggle('is-open', o);
  });
  nav.addEventListener('click', e => { if (e.target.tagName === 'A') { burger.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); } });
}

function initWorks() {
  $$('[data-goto]').forEach(b => b.addEventListener('click', () => openCat(b.dataset.goto)));
  const a = $('#avitoLink'); a.href = C.avitoUrl;
}

function initReveal() {
  if (!('IntersectionObserver' in window)) return;
  const els = $$('.head, .svc, .pack, .steps li, .facts div, .work, .request > *');
  els.forEach(el => el.classList.add('reveal'));
  const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -6% 0px' });
  els.forEach(el => io.observe(el));
}

function initDemoBadge() {
  const badge = $('#demoBadge');
  if (!C.showDemoBadge) { badge.remove(); return; }
  const a = $('#devLink'); a.textContent = C.devName;
  if (C.devLink) a.href = C.devLink;
  $('#demoClose').addEventListener('click', () => { badge.hidden = true; });
}

renderServices();
renderPacks();
renderTabs();
renderPrice();
initPriceEvents();
initCart();
renderCart();
initRequest();
initHeader();
initWorks();
initReveal();
initDemoBadge();
})();
