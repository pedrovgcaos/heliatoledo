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
