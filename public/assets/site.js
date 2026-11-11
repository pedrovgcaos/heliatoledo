// Helia Toledo — small progressive enhancements. Everything works without this file.
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

  // ---- Cart (kept in this browser's localStorage) ----
  const CART_KEY = 'ht-cart-v1';
  const MAX_QTY = 10;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => '€' + (Number.isInteger(n) ? n : n.toFixed(2));
  const readCart = () => { try { const v = JSON.parse(localStorage.getItem(CART_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
  const updateCount = (items = readCart()) => {
    const n = items.reduce((a, i) => a + i.qty, 0);
    document.querySelectorAll('[data-cart-count]').forEach(el => { el.hidden = !n; el.textContent = n ? ` (${n})` : ''; });
    document.querySelector('.masthead__cart')?.setAttribute('aria-label', n ? `Cart, ${n} item${n > 1 ? 's' : ''}` : 'Cart, empty');
  };
  const writeCart = items => { try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* private mode: cart lasts this page only */ } updateCount(items); };
  updateCount();
  addEventListener('pageshow', () => updateCount());

  // product page: size → price, add to cart
  const buy = document.querySelector('form.buy');
  if (buy) {
    const price = buy.querySelector('.buy__price');
    const added = buy.querySelector('.buy__added');
    const button = buy.querySelector('.buy__add');
    buy.addEventListener('change', e => {
      if (e.target.name === 'size') { price.textContent = fmt(+e.target.dataset.price); added.hidden = true; }
    });
    buy.addEventListener('submit', e => {
      e.preventDefault();
      const size = buy.elements.size.value;
      const qty = Math.min(MAX_QTY, Math.max(1, parseInt(buy.elements.qty.value, 10) || 1));
      const items = readCart();
      const line = items.find(i => i.slug === buy.dataset.slug && i.size === size);
      if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
      else items.push({ slug: buy.dataset.slug, size, qty });
      writeCart(items);
      added.hidden = false;
      button.textContent = 'Added';
      setTimeout(() => { button.textContent = 'Add to cart'; }, 1600);
    });
  }

  // cart page
  const cartEl = document.querySelector('[data-cart]');
  if (cartEl) {
    const cat = JSON.parse(document.getElementById('catalogue').textContent);
    const email = cartEl.dataset.email;
    let mode = 'email'; // switches to 'card' when the payment endpoint is configured
    const valid = () => readCart().filter(i => cat[i.slug] && cat[i.slug].sizes[i.size] != null);
    const render = () => {
      const items = valid();
      if (!items.length) { cartEl.innerHTML = '<p class="cart__empty">Your cart is empty. <a href="/shop/">Browse the tapestries</a></p>'; return; }
      const total = items.reduce((a, i) => a + cat[i.slug].sizes[i.size] * i.qty, 0);
      cartEl.innerHTML = `<ul class="cart__lines" role="list">${items.map((i, n) => {
        const p = cat[i.slug]; const unit = p.sizes[i.size];
        return `<li class="cart__line">
          <a class="cart__thumb" href="/shop/${i.slug}/" tabindex="-1" aria-hidden="true"><img src="${p.thumb}" alt="" width="96" height="120" loading="lazy"></a>
          <div class="cart__what"><a class="cart__name" href="/shop/${i.slug}/">${esc(p.title)}</a><span>Tapestry, ${esc(i.size)}</span><span>${fmt(unit)} each</span></div>
          <div class="cart__qty" role="group" aria-label="Quantity of ${esc(p.title)}, ${esc(i.size)}">
            <button type="button" data-n="${n}" data-d="-1" aria-label="One fewer"${i.qty <= 1 ? ' disabled' : ''}>−</button><output aria-live="polite">${i.qty}</output><button type="button" data-n="${n}" data-d="1" aria-label="One more"${i.qty >= MAX_QTY ? ' disabled' : ''}>+</button>
          </div>
          <p class="cart__sum">${fmt(unit * i.qty)}</p>
          <button class="cart__remove" type="button" data-remove="${n}">Remove</button>
        </li>`;
      }).join('')}</ul>
      <div class="cart__foot">
        <dl class="cart__total"><div><dt>Subtotal</dt><dd>${fmt(total)}</dd></div></dl>
        <p class="cart__note">${mode === 'card'
          ? 'Next, you’ll enter your shipping address and pay by card on Stripe’s secure page.'
          : 'This opens an email to Helia with your order. She’ll reply with shipping costs and a payment link.'}</p>
        <button class="cart__checkout" type="button">${mode === 'card' ? 'Go to payment' : 'Send order by email'}</button>
        <p class="cart__error" role="alert" hidden></p>
      </div>`;
    };
    const mailOrder = items => {
      const lines = items.map(i => `- ${cat[i.slug].title} tapestry, ${i.size} × ${i.qty}: ${fmt(cat[i.slug].sizes[i.size] * i.qty)}`);
      const total = items.reduce((a, i) => a + cat[i.slug].sizes[i.size] * i.qty, 0);
      const body = `Hello Helia,\n\nI'd like to order:\n${lines.join('\n')}\nSubtotal: ${fmt(total)}\n\nName:\nShipping address:\nPhone:\n`;
      location.href = `mailto:${email}?subject=${encodeURIComponent('Tapestry order')}&body=${encodeURIComponent(body)}`;
    };
    cartEl.addEventListener('click', async e => {
      const t = e.target.closest('button');
      if (!t) return;
      const items = valid();
      if (t.dataset.d) {
        const line = items[+t.dataset.n];
        line.qty = Math.min(MAX_QTY, Math.max(1, line.qty + +t.dataset.d));
        writeCart(items); render();
        cartEl.querySelectorAll(`[data-n="${t.dataset.n}"][data-d="${t.dataset.d}"]`)[0]?.focus();
      } else if (t.dataset.remove) {
        items.splice(+t.dataset.remove, 1);
        writeCart(items); render();
        (cartEl.querySelector('.cart__remove') || cartEl.querySelector('a'))?.focus();
      } else if (t.classList.contains('cart__checkout')) {
        if (mode === 'email') return mailOrder(items);
        const err = cartEl.querySelector('.cart__error');
        t.disabled = true; t.textContent = 'Opening payment…'; err.hidden = true;
        try {
          const r = await fetch('/api/checkout/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
          const j = await r.json();
          if (!r.ok || !j.url) throw new Error(j.error || 'checkout');
          location.href = j.url;
        } catch {
          t.disabled = false; t.textContent = 'Go to payment';
          err.hidden = false;
          err.innerHTML = `The payment page didn’t open. Try again, or <a href="mailto:${email}">send your order by email</a>.`;
        }
      }
    });
    render();
    fetch('/api/checkout/').then(r => (r.ok ? r.json() : {})).then(j => { if (j.enabled) { mode = 'card'; render(); } }).catch(() => {});
    addEventListener('pageshow', render);
    addEventListener('storage', e => { if (e.key === CART_KEY) { render(); updateCount(); } });
  }

  // order confirmation: empty the cart after a completed payment
  if (document.querySelector('[data-thanks]') && new URLSearchParams(location.search).has('session_id')) writeCart([]);

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
