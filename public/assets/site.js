// Helia Toledo — small progressive enhancements. The portfolio works without this file;
// the shop (cart, checkout, order page) needs it.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- The wall: swap the repeating pattern on the home page ----
  const data = document.getElementById('repeats');
  if (data) {
    const repeats = JSON.parse(data.textContent);
    const paper = document.querySelector('.wall__paper');
    const label = document.querySelector('.swatch__label');
    const count = document.querySelector('.swatch__count');
    const link = document.querySelector('.swatch__project');
    const next = document.querySelector('.swatch__next');
    let i = 0;
    // warm the next tile so the swap is instant
    const warm = n => { const im = new Image(); im.src = repeats[n % repeats.length].preload; return im.decode?.().catch(() => {}); };
    warm(1);
    next.addEventListener('click', async () => {
      i = (i + 1) % repeats.length;
      const r = repeats[i];
      await warm(i);
      const apply = () => {
        paper.style.setProperty('--tile', r.tile);
        paper.style.setProperty('--tile-size', r.size + 'px');
        paper.setAttribute('aria-label', `${r.title}, a repeating pattern by Helia Toledo`);
        label.innerHTML = r.label;
        count.textContent = `${i + 1} of ${repeats.length}`;
        link.href = r.href;
        link.textContent = r.cta;
      };
      if (document.startViewTransition && !reduce) document.startViewTransition(apply);
      else apply();
      warm(i + 1);
    });
  }

  // ---- Image viewer (dialog) ----
  const viewer = document.querySelector('.viewer');
  const triggers = [...document.querySelectorAll('[data-view]')];
  if (viewer && triggers.length) {
    const vImg = viewer.querySelector('img');
    const vCap = viewer.querySelector('figcaption');
    let current = -1;
    const show = n => {
      current = (n + triggers.length) % triggers.length;
      const t = triggers[current];
      vImg.removeAttribute('srcset');
      vImg.src = t.dataset.viewSrc;
      vImg.srcset = t.dataset.view;
      vImg.sizes = '94vw';
      vImg.alt = t.dataset.caption;
      vCap.textContent = t.dataset.caption;
    };
    triggers.forEach((t, n) => t.addEventListener('click', () => { show(n); viewer.showModal(); }));
    // click on the empty area around the image closes the viewer
    viewer.addEventListener('click', e => { if (e.target === viewer || e.target.tagName === 'FIGURE') viewer.close(); });
    viewer.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { show(current + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { show(current - 1); e.preventDefault(); }
    });
    viewer.addEventListener('close', () => triggers[current]?.focus());
  }

  // ---- Shop helpers ----
  const CART_KEY = 'ht-cart-v1';
  const MAX_QTY = 10;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => (n == null ? '—' : '€' + (Number.isInteger(n) ? n : Number(n).toFixed(2)));
  const readCart = () => { try { const v = JSON.parse(localStorage.getItem(CART_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
  const updateCount = (items = readCart()) => {
    const n = items.reduce((a, i) => a + i.qty, 0);
    document.querySelectorAll('[data-cart-count]').forEach(el => { el.hidden = !n; el.textContent = n ? ` (${n})` : ''; });
    document.querySelector('.masthead__cart')?.setAttribute('aria-label', n ? `Cart, ${n} item${n > 1 ? 's' : ''}` : 'Cart, empty');
  };
  const writeCart = items => { try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* private mode */ } updateCount(items); };
  updateCount();
  addEventListener('pageshow', () => updateCount());

  // live prices / availability set in the panel (falls back to the prices printed in the page)
  let liveCatalog;
  const getLive = () => (liveCatalog ??= fetch('/api/catalog/').then(r => (r.ok ? r.json() : null)).catch(() => null));
  const needsLive = document.querySelector('form.buy, [data-cart], .shop__link');
  if (needsLive) getLive();

  // shop grid: sold out / hidden tapestries
  if (document.querySelector('.shop__link')) {
    getLive().then(live => {
      if (!live) return;
      document.querySelectorAll('.shop__item').forEach(li => {
        const slug = li.querySelector('.shop__link').getAttribute('href').split('/')[2];
        const p = live.products[slug];
        if (!p) return;
        if (p.hidden) { li.hidden = true; return; }
        const prices = Object.values(p.sizes).filter(s => !s.soldOut).map(s => s.price);
        const allOut = p.soldOut || !prices.length;
        const lo = Math.min(...prices); const hi = Math.max(...prices);
        li.querySelector('.shop__price').textContent = allOut ? 'Sold out' : lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`;
      });
    });
  }

  // ---- Product page: size → price, add to cart ----
  const buy = document.querySelector('form.buy');
  if (buy) {
    const price = buy.querySelector('.buy__price');
    const added = buy.querySelector('.buy__added');
    const button = buy.querySelector('.buy__add');
    const showPrice = () => { const r = buy.querySelector('input[name=size]:checked'); price.textContent = r ? fmt(+r.dataset.price) : 'Sold out'; };
    getLive().then(live => {
      const p = live?.products[buy.dataset.slug];
      if (!p) return;
      buy.querySelectorAll('input[name=size]').forEach(r => {
        const s = p.sizes[r.value];
        if (!s) return;
        r.dataset.price = s.price;
        r.closest('label').querySelector('.buy__size-price').textContent = s.soldOut || p.soldOut ? 'Sold out' : fmt(s.price);
        r.disabled = Boolean(s.soldOut || p.soldOut);
      });
      if (buy.querySelector('input[name=size]:checked:disabled')) {
        const first = buy.querySelector('input[name=size]:not(:disabled)');
        if (first) first.checked = true; else buy.querySelector('input[name=size]:checked').checked = false;
      }
      const unavailable = p.hidden || p.soldOut || !buy.querySelector('input[name=size]:not(:disabled)') || live.shopOpen === false;
      button.disabled = unavailable;
      button.textContent = live.shopOpen === false ? 'Shop closed' : unavailable ? 'Sold out' : 'Add to cart';
      if (live.shopOpen === false && live.closedMessage) {
        added.hidden = false; added.textContent = live.closedMessage;
      }
      showPrice();
    });
    buy.addEventListener('change', e => { if (e.target.name === 'size') { showPrice(); added.hidden = true; } });
    buy.addEventListener('submit', e => {
      e.preventDefault();
      const size = buy.querySelector('input[name=size]:checked')?.value;
      if (!size || button.disabled) return;
      const qty = Math.min(MAX_QTY, Math.max(1, parseInt(buy.elements.qty.value, 10) || 1));
      const items = readCart();
      const line = items.find(i => i.slug === buy.dataset.slug && i.size === size);
      if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
      else items.push({ slug: buy.dataset.slug, size, qty });
      writeCart(items);
      added.hidden = false;
      added.innerHTML = 'Added to your cart. <a href="/cart/">View cart and check out</a>';
      button.textContent = 'Added';
      setTimeout(() => { button.textContent = 'Add to cart'; }, 1600);
    });
  }

  // ---- Cart + checkout ----
  const cartEl = document.querySelector('[data-cart]');
  if (cartEl) {
    const cat = JSON.parse(document.getElementById('catalogue').textContent);
    const email = cartEl.dataset.email;
    let live = null;
    const priceOf = i => live?.products[i.slug]?.sizes[i.size]?.price ?? cat[i.slug].sizes[i.size];
    const unavailable = i => {
      const p = live?.products[i.slug];
      return Boolean(p && (p.hidden || p.soldOut || p.sizes[i.size]?.soldOut));
    };
    const valid = () => readCart().filter(i => cat[i.slug] && cat[i.slug].sizes[i.size] != null);
    const zoneOf = code => live?.countries.find(c => c[0] === code)?.[2];
    const shippingCost = (code, subtotal) => {
      if (!live || !code) return undefined; // unknown yet
      if (live.freeShippingFrom && subtotal >= live.freeShippingFrom) return 0;
      const v = live.shipping?.[zoneOf(code)];
      return Number.isFinite(v) ? v : null; // null = to be confirmed
    };

    cartEl.innerHTML = `
      <div data-lines></div>
      <form class="checkout" data-checkout novalidate hidden>
        <h2 class="section__title">Shipping details</h2>
        <div class="checkout__grid">
          <label class="field field--wide"><span>Full name</span><input name="name" autocomplete="name" required maxlength="120"></label>
          <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required maxlength="160"></label>
          <label class="field"><span>Phone <em>optional</em></span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
          <label class="field field--wide"><span>Address</span><input name="address" autocomplete="street-address" required maxlength="240"></label>
          <label class="field"><span>Postal code</span><input name="postal" autocomplete="postal-code" required maxlength="20"></label>
          <label class="field"><span>City</span><input name="city" autocomplete="address-level2" required maxlength="100"></label>
          <label class="field"><span>Province or region <em>optional</em></span><input name="region" autocomplete="address-level1" maxlength="100"></label>
          <label class="field"><span>Country</span><select name="country" autocomplete="country" required><option value="">Choose…</option></select></label>
          <label class="field field--wide" data-other hidden><span>Which country?</span><input name="countryOther" maxlength="80"></label>
          <label class="field field--wide"><span>Notes for Helia <em>optional</em></span><textarea name="notes" rows="3" maxlength="1000"></textarea></label>
          <label class="hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>
        </div>
        <div class="checkout__foot">
          <dl class="cart__total" data-totals></dl>
          <p class="cart__note" data-note></p>
          <button class="cart__checkout" type="submit">Place order</button>
          <p class="cart__error" role="alert" hidden></p>
        </div>
      </form>`;
    const linesEl = cartEl.querySelector('[data-lines]');
    const form = cartEl.querySelector('[data-checkout]');
    const countrySel = form.elements.country;
    const errEl = form.querySelector('.cart__error');

    const renderTotals = () => {
      const items = valid();
      const subtotal = items.reduce((a, i) => a + priceOf(i) * i.qty, 0);
      const ship = shippingCost(countrySel.value, subtotal);
      const shipTxt = ship === undefined ? 'Choose your country' : ship === null ? 'To be confirmed' : ship === 0 ? 'Free' : fmt(ship);
      form.querySelector('[data-totals]').innerHTML = `
        <div><dt>Subtotal</dt><dd>${fmt(subtotal)}</dd></div>
        <div><dt>Shipping</dt><dd>${shipTxt}</dd></div>
        <div class="cart__grand"><dt>Total</dt><dd>${fmt(subtotal + (ship || 0))}${ship === null ? ' + shipping' : ''}</dd></div>`;
      form.querySelector('[data-note]').textContent = ship === null
        ? 'No payment now. Helia will confirm the shipping cost for your country and send you the payment details.'
        : 'No payment now. After you place the order, Helia will send you the payment details by email.';
    };

    const renderLines = () => {
      const items = valid();
      form.hidden = !items.length;
      if (!items.length) { linesEl.innerHTML = '<p class="cart__empty">Your cart is empty. <a href="/shop/">Browse the tapestries</a></p>'; return; }
      linesEl.innerHTML = `<ul class="cart__lines" role="list">${items.map((i, n) => {
        const p = cat[i.slug]; const unit = priceOf(i); const out = unavailable(i);
        return `<li class="cart__line${out ? ' is-out' : ''}">
          <a class="cart__thumb" href="/shop/${i.slug}/" tabindex="-1" aria-hidden="true"><img src="${p.thumb}" alt="" width="96" height="120" loading="lazy"></a>
          <div class="cart__what"><a class="cart__name" href="/shop/${i.slug}/">${esc(p.title)}</a><span>Tapestry, ${esc(i.size)}</span><span>${out ? '<strong class="cart__out">No longer available — please remove it</strong>' : `${fmt(unit)} each`}</span></div>
          <div class="cart__qty" role="group" aria-label="Quantity of ${esc(p.title)}, ${esc(i.size)}">
            <button type="button" data-n="${n}" data-d="-1" aria-label="One fewer"${i.qty <= 1 ? ' disabled' : ''}>−</button><output aria-live="polite">${i.qty}</output><button type="button" data-n="${n}" data-d="1" aria-label="One more"${i.qty >= MAX_QTY ? ' disabled' : ''}>+</button>
          </div>
          <p class="cart__sum">${fmt(unit * i.qty)}</p>
          <button class="cart__remove" type="button" data-remove="${n}">Remove</button>
        </li>`;
      }).join('')}</ul>`;
      renderTotals();
    };

    linesEl.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t) return;
      const items = valid();
      if (t.dataset.d) {
        const line = items[+t.dataset.n];
        line.qty = Math.min(MAX_QTY, Math.max(1, line.qty + +t.dataset.d));
        writeCart(items); renderLines();
        linesEl.querySelector(`[data-n="${t.dataset.n}"][data-d="${t.dataset.d}"]:not(:disabled)`)?.focus();
      } else if (t.dataset.remove) {
        items.splice(+t.dataset.remove, 1);
        writeCart(items); renderLines();
        (linesEl.querySelector('.cart__remove') || linesEl.querySelector('a'))?.focus();
      }
    });

    countrySel.addEventListener('change', () => {
      form.querySelector('[data-other]').hidden = countrySel.value !== 'XX';
      renderTotals();
    });

    const FIELD_NAMES = { name: 'your name', email: 'a valid email', address: 'the address', city: 'the city', postal: 'the postal code', country: 'the country' };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const items = valid();
      errEl.hidden = true;
      form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
      if (items.some(unavailable)) { errEl.hidden = false; errEl.textContent = 'Remove the tapestries that are no longer available, then place the order.'; return; }
      const f = form.elements;
      const btn = form.querySelector('.cart__checkout');
      btn.disabled = true; btn.textContent = 'Placing order…';
      try {
        const r = await fetch('/api/orders/', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items, notes: f.notes.value, website: f.website.value,
            lang: (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en',
            customer: { name: f.name.value, email: f.email.value, phone: f.phone.value },
            shipping: { address: f.address.value, city: f.city.value, postal: f.postal.value, region: f.region.value, country: f.country.value, countryOther: f.countryOther.value },
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.status === 201 && j.id) {
          writeCart([]);
          location.href = `/shop/order/?id=${encodeURIComponent(j.id)}&t=${encodeURIComponent(j.token)}&new=1`;
          return;
        }
        if (j.error === 'missing_fields') {
          j.fields.forEach(n => f[n]?.setAttribute('aria-invalid', 'true'));
          f[j.fields[0]]?.focus();
          throw new Error(`Please add ${j.fields.map(n => FIELD_NAMES[n] || n).join(', ')}.`);
        }
        if (j.error === 'sold_out') throw new Error(`Sorry, ${j.detail} has just sold out. Please remove it and try again.`);
        if (j.error === 'shop_closed') throw new Error('The shop is closed at the moment. Please try again later.');
        throw new Error('');
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Place order';
        errEl.hidden = false;
        errEl.innerHTML = err.message ? esc(err.message) : `The order couldn’t be sent. Try again, or write to <a href="mailto:${email}">${email}</a>.`;
      }
    });

    renderLines();
    getLive().then(l => {
      live = l;
      if (live) {
        countrySel.insertAdjacentHTML('beforeend', live.countries.map(([code, name]) => `<option value="${code}">${esc(name)}</option>`).join(''));
        if (live.shopOpen === false) {
          form.querySelector('.cart__checkout').disabled = true;
          errEl.hidden = false; errEl.textContent = live.closedMessage || 'The shop is closed at the moment.';
        }
      } else {
        form.querySelector('.cart__checkout').disabled = true;
        errEl.hidden = false;
        errEl.innerHTML = `Ordering is unavailable right now. Please write to <a href="mailto:${email}">${email}</a>.`;
      }
      renderLines();
    });
    addEventListener('storage', e => { if (e.key === CART_KEY) { renderLines(); updateCount(); } });
  }

  // ---- Order page ----
  const orderEl = document.querySelector('[data-order]');
  if (orderEl) {
    const q = new URLSearchParams(location.search);
    const email = orderEl.dataset.email;
    const STEPS = [['nuevo', 'Order received'], ['pagado', 'Paid'], ['enviado', 'Shipped'], ['entregado', 'Delivered']];
    const date = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    fetch(`/api/orders/?id=${encodeURIComponent(q.get('id') || '')}&t=${encodeURIComponent(q.get('t') || '')}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(o => {
        const fresh = q.has('new');
        if (fresh) history.replaceState(null, '', `?id=${encodeURIComponent(o.id)}&t=${encodeURIComponent(q.get('t'))}`);
        document.querySelector('[data-order-title]').textContent = fresh ? 'Thank you' : `Order ${o.id}`;
        const reached = o.status === 'cancelado' ? -1 : STEPS.findIndex(s => s[0] === o.status);
        const t = o.tracking || {};
        orderEl.innerHTML = `
          <p class="order__lead">${fresh
            ? `Your order <strong>${esc(o.id)}</strong> has been received${o.paymentInstructions ? '.' : '. Helia will write to you shortly with the payment details.'} Keep this page’s address to follow your order.`
            : `Placed on ${date(o.createdAt)} by ${esc(o.name)}.`}</p>
          ${o.status === 'cancelado' ? '<p class="order__cancelled">This order was cancelled.</p>' : `
          <ol class="order__steps">${STEPS.map(([, label], n) => `<li class="${n <= reached ? 'is-done' : ''}${n === reached ? ' is-now' : ''}">${label}</li>`).join('')}</ol>`}
          ${o.paymentInstructions ? `<section class="order__pay"><h2 class="section__title">How to pay</h2><p>${esc(o.paymentInstructions).replace(/\n/g, '<br>')}</p>${o.paymentInstructionsEs ? `<p lang="es" class="order__es">${esc(o.paymentInstructionsEs).replace(/\n/g, '<br>')}</p>` : ''}<p>Please include your order number, <strong>${esc(o.id)}</strong>, with the payment.</p></section>` : ''}
          ${o.tracking && (t.number || t.url) ? `<section class="order__pay"><h2 class="section__title">Tracking</h2><p>${esc([t.carrier, t.number].filter(Boolean).join(' '))}${t.url ? ` <a href="${esc(t.url)}" rel="noopener">Track the parcel</a>` : ''}</p></section>` : ''}
          <ul class="cart__lines order__lines" role="list">${o.items.map(i => `<li class="order__line"><span>${esc(i.title)} tapestry, ${esc(i.size)} × ${i.qty}</span><span>${fmt(i.unit * i.qty)}</span></li>`).join('')}</ul>
          <dl class="cart__total order__totals">
            <div><dt>Subtotal</dt><dd>${fmt(o.subtotal)}</dd></div>
            <div><dt>Shipping to ${esc(o.shipping.city)}, ${esc(o.shipping.countryName)}</dt><dd>${o.shippingCost == null ? 'To be confirmed' : o.shippingCost === 0 ? 'Free' : fmt(o.shippingCost)}</dd></div>
            <div class="cart__grand"><dt>Total</dt><dd>${fmt(o.total)}${o.shippingCost == null ? ' + shipping' : ''}</dd></div>
          </dl>
          <p class="order__help">Questions about your order? Write to <a href="mailto:${email}?subject=${encodeURIComponent(`Order ${o.id}`)}">${email}</a>.</p>`;
      })
      .catch(() => {
        orderEl.innerHTML = `<p class="cart__empty">We couldn’t find this order. Check the link in your email, or write to <a href="mailto:${email}">${email}</a>.</p>`;
      });
  }

  // ---- Cross-page morph: grid thumbnail ⇄ project hero ----
  const nameThumb = (pathname, vt) => {
    const a = document.querySelector(`a[data-vt][href="${pathname}"]`);
    const im = a?.querySelector('img');
    if (!im) return;
    im.style.viewTransitionName = 'hero';
    vt.finished.finally(() => { im.style.viewTransitionName = ''; });
  };
  addEventListener('pageswap', e => {
    if (!e.viewTransition || !e.activation?.entry?.url) return;
    nameThumb(new URL(e.activation.entry.url).pathname, e.viewTransition);
  });
  addEventListener('pagereveal', e => {
    if (!e.viewTransition || !window.navigation?.activation?.from?.url) return;
    nameThumb(new URL(navigation.activation.from.url).pathname, e.viewTransition);
  });
})();
