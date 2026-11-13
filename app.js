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

/* ---------- услуги: матрица «что входит» ---------- */
function renderServices() {
  $('#servicesGrid').innerHTML = PRICE.map((c, i) => {
    const prices = c.items.map(it => it[1]).filter(Boolean);
    const min = prices.length ? `от ${rub(Math.min(...prices))}` : 'по замеру';
    const incl = c.items.slice(0, 4).map(it => `<li>${esc(it[0])}</li>`).join('');
    const more = c.items.length > 4 ? `<li class="more">и ещё ${c.items.length - 4}</li>` : '';
    return `<article class="mx" data-cat="${c.id}">
      <div class="mx__name"><span class="mx__num">${String(i + 1).padStart(2, '0')}</span><span class="mx__icon">${icon(c.icon)}</span><div><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div></div>
      <ul class="mx__incl">${incl}${more}</ul>
      <div class="mx__price"><b>${min}</b><span>${c.items.length} ${plural(c.items.length, ['позиция', 'позиции', 'позиций'])} в прайсе</span></div>
      <button class="mx__btn" data-open="${c.id}">Цены ${icon('arrow')}</button>
    </article>`;
  }).join('');
  $('#servicesGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-open]') || e.target.closest('.mx');
    if (b) openCat(b.dataset.open || b.dataset.cat);
  });
  const hc = $('#heroCount'); if (hc) hc.textContent = PRICE.reduce((s, c) => s + c.items.length, 0);
}

/* ---------- калькулятор (квиз) ---------- */
let calcSummary = '';
function initCalc() {
  const CALC = window.CALC;
  const st = { obj: null, area: 0, works: new Set(), step: 0 };
  const body = $('#calcBody'), steps = $$('#calcSteps li');
  const obj = () => CALC.objects.find(o => o.id === st.obj);

  function compute() {
    const o = obj(), g = o.geo(st.area), map = new Map(), groups = [];
    o.works.filter(w => st.works.has(w)).forEach(wid => {
      const w = CALC.works[wid]; let sum = 0, ask = false;
      w.items.forEach(([cat, name, fn]) => {
        const it = findItem(cat, name); if (!it) return;
        const q = Math.max(1, Math.round(fn(g)));
        map.set(key(cat, name), (map.get(key(cat, name)) || 0) + q);
        if (it[1]) sum += it[1] * q; else ask = true;
      });
      groups.push({ wid, title: w.title, sum, ask, cat: w.items[0][0] });
    });
    return { groups, map, total: groups.reduce((s, x) => s + x.sum, 0) };
  }
  const workSum = wid => {
    const g = obj().geo(st.area);
    let sum = 0, ask = false;
    CALC.works[wid].items.forEach(([cat, name, fn]) => {
      const it = findItem(cat, name); if (!it) return;
      if (it[1]) sum += it[1] * Math.max(1, Math.round(fn(g))); else ask = true;
    });
    return ask && !sum ? 'по замеру' : '≈ ' + rub(sum);
  };
  const go = n => {
    st.step = n;
    steps.forEach((li, i) => { li.classList.toggle('is-active', i === n); li.classList.toggle('is-done', i < n); });
    render();
  };

  function render() {
    if (st.step === 0) {
      body.innerHTML = `<h3 class="calc__q">Что ремонтируем?</h3><div class="calc__objs">` +
        CALC.objects.map(o => `<button class="calc__obj${st.obj === o.id ? ' is-on' : ''}" data-obj="${o.id}"><svg><use href="#i-${o.icon}"/></svg><b>${esc(o.title)}</b><small>объём работ от ${o.min} м²</small></button>`).join('') + `</div>`;
    } else if (st.step === 1) {
      const o = obj(), max = o.id === 'bath' ? 15 : o.id === 'house' ? 250 : 150;
      body.innerHTML = `<h3 class="calc__q">Площадь пола, м²</h3>
        <div class="calc__area"><input type="number" id="cArea" min="${o.min}" max="500" value="${st.area}" inputmode="numeric" aria-label="Площадь, м²"><span>м²</span></div>
        <input type="range" id="cRange" min="1" max="${max}" value="${st.area}" aria-label="Площадь">
        <div class="calc__chips">${o.presets.map(p => `<button data-preset="${p}" class="${p === st.area ? 'is-on' : ''}">${p} м²</button>`).join('')}</div>
        <p class="calc__hint" id="cHint">Минимальный объём работ для объекта «${esc(o.title)}» — ${o.min} м²</p>
        <div class="calc__nav"><button class="btn btn--line btn--sm" data-back>Назад</button><button class="btn btn--accent btn--sm" data-next>Далее ${icon('arrow')}</button></div>`;
    } else if (st.step === 2) {
      const o = obj();
      body.innerHTML = `<h3 class="calc__q">Какие работы нужны? <small>${esc(o.title)}, ${st.area} м²</small></h3><div class="calc__works">` +
        o.works.map(w => `<label class="calc__work${st.works.has(w) ? ' is-on' : ''}"><input type="checkbox" value="${w}" ${st.works.has(w) ? 'checked' : ''}><span>${esc(CALC.works[w].title)}</span><em>${workSum(w)}</em></label>`).join('') +
        `</div><div class="calc__nav"><button class="btn btn--line btn--sm" data-back>Назад</button><button class="btn btn--accent btn--sm" data-next ${st.works.size ? '' : 'disabled'}>Посчитать ${icon('arrow')}</button></div>`;
    } else {
      const o = obj(), r = compute();
      calcSummary = `${o.title}, ${st.area} м²: ${r.groups.map(g => g.title.toLowerCase()).join(', ')}`;
      body.innerHTML = `<div class="calc__res">
        <div class="calc__total"><span>${esc(o.title)}, ${st.area} м² · стоимость работ</span><b>≈ ${rub(Math.round(r.total / 1000) * 1000)}</b>
        <small>Без материалов. ${r.groups.some(g => g.ask) ? 'Электрика считается на замере. ' : ''}Точная сумма — после бесплатного замера.</small></div>
        <ul class="calc__lines">${r.groups.map(g => `<li><span>${esc(g.title)}</span><b>${g.ask && !g.sum ? 'по замеру' : rub(g.sum)}</b><button data-goto="${g.cat}">прайс ${icon('arrow')}</button></li>`).join('')}</ul>
        <div class="calc__actions">
          <button class="btn btn--accent" data-zamer>Записаться на замер с этим расчётом ${icon('arrow')}</button>
          <button class="btn btn--line btn--sm" data-tocart>Подробная смета</button>
          <button class="btn btn--line btn--sm" data-back>Изменить работы</button>
        </div></div>`;
    }
  }

  // расчёт попадает в общую смету (перезаписывает количество, без задвоения)
  const applyToCart = () => { compute().map.forEach((q, k) => cart.set(k, q)); save(); syncAll(); };

  body.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.obj) {
      const o = CALC.objects.find(x => x.id === t.dataset.obj);
      if (st.obj !== o.id) { st.obj = o.id; st.area = o.def; st.works = new Set(o.on); }
      return go(1);
    }
    if (t.dataset.preset) { st.area = Number(t.dataset.preset); return render(); }
    if ('back' in t.dataset) return go(st.step - 1);
    if ('next' in t.dataset) {
      if (st.step === 1 && st.area < 1) { $('#cHint').classList.add('is-err'); return; }
      return go(st.step + 1);
    }
    if (t.dataset.goto) return openCat(t.dataset.goto);
    if ('tocart' in t.dataset) { applyToCart(); return window.__openCart(); }
    if ('zamer' in t.dataset) {
      applyToCart();
      $('#reqForm select[name=object]').value = obj().title;
      $('#zamer').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => $('#reqForm input[name=name]').focus({ preventScroll: true }), 700);
    }
  });
  body.addEventListener('input', e => {
    if (e.target.id !== 'cArea' && e.target.id !== 'cRange') return;
    st.area = Math.max(0, Math.round(Number(e.target.value) || 0));
    (e.target.id === 'cArea' ? $('#cRange') : $('#cArea')).value = st.area;
    $$('.calc__chips button', body).forEach(b => b.classList.toggle('is-on', Number(b.dataset.preset) === st.area));
    $('#cHint').classList.toggle('is-err', st.area < 1);
  });
  body.addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    e.target.checked ? st.works.add(e.target.value) : st.works.delete(e.target.value);
    render();
  });
  steps.forEach((li, i) => li.addEventListener('click', () => { if (i < st.step) go(i); }));
  // вход из мини-расчёта на первом экране
  window.__calcPreset = (objId, area, toStep) => {
    const o = CALC.objects.find(x => x.id === objId);
    st.obj = o.id; st.area = area; st.works = new Set(o.on);
    go(toStep);
  };
  window.__calcApply = applyToCart;
  window.__calcQuick = (objId, area) => {
    const o = CALC.objects.find(x => x.id === objId), g = o.geo(area);
    let sum = 0;
    o.on.forEach(wid => CALC.works[wid].items.forEach(([cat, name, fn]) => {
      const it = findItem(cat, name); if (it && it[1]) sum += it[1] * Math.max(1, Math.round(fn(g)));
    }));
    return { sum, works: o.on.map(w => CALC.works[w].title) };
  };
  go(0);
}

/* ---------- мини-расчёт на первом экране (крючок) ---------- */
function initMini() {
  const box = $('#mini'); if (!box) return;
  const CALC = window.CALC;
  const ranges = { bath: [2, 12], flat: [20, 120], room: [8, 40] };
  let obj = 'bath', area = 4;
  const sync = () => {
    const [mn, mx] = ranges[obj];
    const r = $('#miniRange'); r.min = mn; r.max = mx; r.value = area;
    $('#miniArea').textContent = area;
    const q = window.__calcQuick(obj, area);
    $('#miniSum').textContent = rub(Math.round(q.sum / 1000) * 1000);
    $('#miniWorks').textContent = q.works.join(' · ');
    $$('#miniTabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.obj === obj));
  };
  $('#miniTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-obj]'); if (!b) return;
    obj = b.dataset.obj; area = CALC.objects.find(o => o.id === obj).def; sync();
  });
  $('#miniRange').addEventListener('input', e => { area = Number(e.target.value); sync(); });
  $('#miniMore').addEventListener('click', () => { window.__calcPreset(obj, area, 2); $('#calc').scrollIntoView({ behavior: 'smooth' }); });
  $('#miniZamer').addEventListener('click', () => {
    window.__calcPreset(obj, area, 3); window.__calcApply();
    $('#reqForm select[name=object]').value = CALC.objects.find(o => o.id === obj).title;
    $('#zamer').scrollIntoView({ behavior: 'smooth' });
  });
  sync();
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
    </div>`).join('') : `<p class="cart__empty">Смета пока пустая.<br>Посчитайте ремонт в калькуляторе или добавьте работы из прайса.</p>`;

  const n = lines.length;
  $('#reqTotal').textContent = rub(total());
  $('#reqItems').textContent = n ? `${n} ${plural(n, ['позиция', 'позиции', 'позиций'])} в смете · без материалов, точная сумма после замера` : 'Пока пусто — посчитайте в калькуляторе или добавьте работы из прайса';
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
  $('#cartClear').addEventListener('click', () => { cart.clear(); save(); syncAll(); });
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
    let text = `Здравствуйте, Евгений! Хочу записаться на бесплатный замер.\nОбъект: ${f.object.value}${f.area.value.trim() ? ', ' + f.area.value.trim() : ''}\nИмя: ${f.name.value}\nТелефон: ${f.phone.value}`;
    if (calcSummary) text += `\nРасчёт на сайте: ${calcSummary}`;
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
  const els = $$('.head, .mx, .pain__item, .compare, .steps li, .facts div, .work, .faq__list, .request > *');
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
renderTabs();
renderPrice();
initPriceEvents();
initCart();
renderCart();
initCalc();
initMini();
initRequest();
initHeader();
initWorks();
initReveal();
initDemoBadge();
})();
