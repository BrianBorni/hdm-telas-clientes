const $ = (selector, scope = document) => scope.querySelector(selector);
const catalogView = $('#catalog-view');
const detailView = $('#detail-view');
const grid = $('#catalog-grid');
const backButton = $('#back-button');
const viewer = $('#image-viewer');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>';
const zoom = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg>';
const back = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>';
let fabrics = [];
let activeFabric = null;
let catalogScroll = 0;
let lastCard = null;
let transitionBusy = false;
let galleryController = null;
let viewerItems = [];
let viewerIndex = 0;
let viewerTrigger = null;
let savedBodyOverflow = '';

function syncTheme() {
  const theme = document.documentElement.dataset.theme;
  document.querySelectorAll('[data-theme-choice]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
  });
}

document.querySelectorAll('[data-theme-choice]').forEach(button => {
  button.addEventListener('click', () => {
    const theme = button.dataset.themeChoice;
    document.documentElement.dataset.theme = theme;
    $('meta[name="theme-color"]').content = theme === 'dark' ? '#131415' : '#ffffff';
    try { localStorage.setItem('hdm-client-theme', theme); } catch { /* Preferencia de esta sesión. */ }
    syncTheme();
  });
});
syncTheme();

$('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  $('#main').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
});

function imageMarkup(src, alt, { eager = false, sizes = '(max-width: 700px) calc(100vw - 44px), 33vw', className = '' } = {}) {
  const extension = /\.webp$/i;
  const responsive = extension.test(src)
    ? ` srcset="${escapeHTML(src.replace(extension, '-640.webp'))} 640w, ${escapeHTML(src.replace(extension, '-960.webp'))} 960w, ${escapeHTML(src)} 1536w" sizes="${sizes}"`
    : '';
  return `<img class="${className}" src="${escapeHTML(src)}"${responsive} alt="${escapeHTML(alt)}" width="1536" height="1024" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''} />`;
}

function priceMarkup(fabric) {
  return `<div class="prices">
    <div class="price"><span class="price-label">Camiseta</span><span class="price-amount">$${money.format(fabric.prices.shirt)}</span></div>
    <div class="price"><span class="price-label">Conjunto</span><span class="price-amount">$${money.format(fabric.prices.set)}</span></div>
  </div>`;
}

function renderCatalog() {
  grid.classList.toggle('single', fabrics.length === 1);
  grid.innerHTML = fabrics.map((fabric, index) => `
    <article class="reveal">
      <a class="fabric-card" href="#${encodeURIComponent(fabric.id)}" data-fabric="${escapeHTML(fabric.id)}" aria-label="Ver ${escapeHTML(fabric.category)} ${escapeHTML(fabric.name)}, camiseta $${money.format(fabric.prices.shirt)}, conjunto $${money.format(fabric.prices.set)}">
        <div class="image-wrap">
          ${imageMarkup(fabric.cover, `Trama de ${fabric.category} ${fabric.name}`, { eager: index < 3, sizes: fabrics.length === 1 ? '(max-width: 700px) calc(100vw - 44px), 490px' : '(max-width: 700px) 46vw, 33vw', className: 'cover' })}
          <span class="open-circle">${arrow}</span>
        </div>
        <h2 class="card-name">${escapeHTML(fabric.category)} ${escapeHTML(fabric.name)}</h2>
        ${priceMarkup(fabric)}
      </a>
    </article>`).join('');
  if (!fabrics.length) grid.innerHTML = '<p class="loading-message">Pronto vas a poder ver nuestras telas.</p>';
  grid.querySelectorAll('[data-fabric]').forEach(card => {
    card.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (transitionBusy) return;
      const fabric = fabrics.find(item => item.id === card.dataset.fabric);
      if (!fabric) return;
      lastCard = card;
      catalogScroll = window.scrollY;
      history.pushState({ fromCatalog: true }, '', `#${encodeURIComponent(fabric.id)}`);
      openFabric(fabric, card);
    });
  });
}

function photoMarkup(item, index, isFeature = false) {
  return `<article class="${isFeature ? 'feature-card' : 'gallery-item'} reveal">
    <button class="photo-button" type="button" data-image-index="${index}" aria-label="Ampliar ${escapeHTML(item.title)}">
      ${imageMarkup(item.src, item.alt, { eager: !isFeature })}
      <span class="zoom-cue">${zoom}</span>
    </button>
    <h${isFeature ? '3' : '2'} class="photo-title">${escapeHTML(item.title)}</h${isFeature ? '3' : '2'}>
    ${isFeature ? `<p class="feature-description">${escapeHTML(item.description)}</p>` : ''}
  </article>`;
}

function renderDetail(fabric) {
  galleryController?.abort();
  galleryController = new AbortController();
  activeFabric = fabric;
  viewerItems = [...fabric.gallery, ...fabric.features];
  detailView.innerHTML = `
    <div class="detail-top">
      <div><p class="eyebrow">${escapeHTML(fabric.category)}</p><h1 id="fabric-title" tabindex="-1">${escapeHTML(fabric.name)}</h1></div>
      <div class="detail-prices">${priceMarkup(fabric)}<p class="unit-note">Por unidad · ARS</p></div>
    </div>
    <div class="material-gallery" id="material-gallery" aria-label="Vistas de ${escapeHTML(fabric.name)}">
      ${fabric.gallery.map((item, index) => photoMarkup(item, index)).join('')}
    </div>
    <div class="gallery-thumbnails" role="group" aria-label="Elegir vista de la tela">
      ${fabric.gallery.map((item, index) => `<button class="gallery-thumbnail" type="button" data-slide="${index}" aria-pressed="${index === 0}" aria-label="Mostrar ${escapeHTML(item.title)}">
        <img src="${escapeHTML(item.src.replace(/\.webp$/i, '-640.webp'))}" alt="" width="640" height="427" /><span>${escapeHTML(item.title)}</span>
      </button>`).join('')}
    </div>
    <section class="feature-section" aria-labelledby="features-title">
      <h2 class="feature-heading" id="features-title">Características</h2>
      <div class="feature-grid">${fabric.features.map((item, index) => photoMarkup(item, fabric.gallery.length + index, true)).join('')}</div>
    </section>
    <footer class="detail-footer">
      <div><p class="material-notes">${fabric.notes.map(note => `<span>${escapeHTML(note)}</span>`).join('')}</p>
      <p class="image-note">Imágenes ilustrativas del tejido. El estiramiento representa la tela bajo tensión.</p></div>
      <button class="other-fabrics" type="button" id="other-fabrics">${back}<span>Ver otras telas</span></button>
    </footer>`;
  detailView.querySelectorAll('[data-image-index]').forEach(button => {
    button.addEventListener('click', () => openViewer(Number(button.dataset.imageIndex), button));
  });
  $('#other-fabrics').addEventListener('click', goBack);
  setupMobileGallery();
}

function setupMobileGallery() {
  const gallery = $('#material-gallery');
  const thumbnails = [...detailView.querySelectorAll('[data-slide]')];
  const slides = [...gallery.children];
  let scrollTick = 0;
  const setActive = index => thumbnails.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  thumbnails.forEach((button, index) => button.addEventListener('click', () => {
    gallery.scrollTo({ left: slides[index].offsetLeft - slides[0].offsetLeft, behavior: motionPreference.matches ? 'instant' : 'smooth' });
    setActive(index);
  }));
  gallery.addEventListener('scroll', () => {
    if (scrollTick) return;
    scrollTick = requestAnimationFrame(() => {
      scrollTick = 0;
      const step = slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : gallery.clientWidth;
      setActive(Math.max(0, Math.min(slides.length - 1, Math.round(gallery.scrollLeft / (step || 1)))));
    });
  }, { passive: true, signal: galleryController.signal });
}

function showDetail(fabric) {
  catalogView.hidden = true;
  detailView.hidden = false;
  backButton.hidden = false;
  document.body.dataset.view = 'detail';
  document.title = `${fabric.name} · Telas HDM`;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function openFabric(fabric, card = null) {
  if (transitionBusy) return;
  const source = card?.querySelector('.cover');
  const sourceRect = source?.getBoundingClientRect();
  let clone;
  transitionBusy = true;
  try {
    if (source && !motionPreference.matches && typeof source.animate === 'function') {
      clone = source.cloneNode();
      clone.removeAttribute('srcset');
      clone.removeAttribute('sizes');
      clone.src = source.currentSrc || source.src;
      clone.alt = '';
      clone.className = 'transition-cover';
      clone.setAttribute('aria-hidden', 'true');
      Object.assign(clone.style, { left: `${sourceRect.left}px`, top: `${sourceRect.top}px`, width: `${sourceRect.width}px`, height: `${sourceRect.height}px`, borderRadius: '16px' });
      document.body.append(clone);
      document.body.classList.add('is-transitioning');
      await clone.animate([
        { left: `${sourceRect.left}px`, top: `${sourceRect.top}px`, width: `${sourceRect.width}px`, height: `${sourceRect.height}px`, borderRadius: '16px' },
        { left: '0px', top: '0px', width: `${window.innerWidth}px`, height: `${window.innerHeight}px`, borderRadius: '0px' }
      ], { duration: 420, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'forwards' }).finished;
    }
    renderDetail(fabric);
    showDetail(fabric);
    if (clone) await clone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' }).finished;
  } finally {
    clone?.remove();
    document.body.classList.remove('is-transitioning');
    transitionBusy = false;
    $('#fabric-title')?.focus({ preventScroll: true });
    if (decodeHash() !== fabric.id) route();
  }
}

function showCatalog() {
  if (viewer.open) closeViewer();
  galleryController?.abort();
  activeFabric = null;
  detailView.hidden = true;
  catalogView.hidden = false;
  backButton.hidden = true;
  document.body.dataset.view = 'catalog';
  document.title = 'Nuestras opciones de telas · HDM';
  window.scrollTo({ top: catalogScroll, behavior: 'instant' });
  lastCard?.focus({ preventScroll: true });
}

function decodeHash() {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
}

function route() {
  if (transitionBusy) return;
  const id = decodeHash();
  const fabric = fabrics.find(item => item.id === id);
  if (fabric) {
    if (activeFabric?.id === id) return;
    renderDetail(fabric);
    showDetail(fabric);
    $('#fabric-title').focus({ preventScroll: true });
  } else {
    if (id) history.replaceState(null, '', location.pathname + location.search);
    showCatalog();
  }
}

function goBack() {
  if (transitionBusy) return;
  if (history.state?.fromCatalog) history.back();
  else {
    history.replaceState(null, '', location.pathname + location.search);
    showCatalog();
  }
}
backButton.addEventListener('click', goBack);
$('.brand').addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (activeFabric) goBack();
  else window.scrollTo({ top: 0, behavior: motionPreference.matches ? 'instant' : 'smooth' });
});
window.addEventListener('popstate', route);
window.addEventListener('hashchange', route);

function updateViewer() {
  const item = viewerItems[viewerIndex];
  $('#viewer-fabric').textContent = `${activeFabric.category} ${activeFabric.name}`;
  $('#viewer-title').textContent = item.title;
  const image = $('#viewer-image');
  image.src = item.src;
  image.alt = item.alt;
  $('#viewer-count').textContent = `${viewerIndex + 1} / ${viewerItems.length}`;
  $('#viewer-prev').disabled = viewerIndex === 0;
  $('#viewer-next').disabled = viewerIndex === viewerItems.length - 1;
  if (viewerItems[viewerIndex + 1]) {
    const next = new Image();
    next.src = viewerItems[viewerIndex + 1].src;
  }
}

function openViewer(index, trigger) {
  viewerIndex = index;
  viewerTrigger = trigger;
  updateViewer();
  savedBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  viewer.showModal();
  $('#viewer-close').focus();
}

function closeViewer() {
  if (viewer.open) viewer.close();
}
viewer.addEventListener('close', () => {
  document.body.style.overflow = savedBodyOverflow;
  viewerTrigger?.focus({ preventScroll: true });
});
$('#viewer-close').addEventListener('click', closeViewer);
function moveViewer(direction) {
  viewerIndex = Math.max(0, Math.min(viewerItems.length - 1, viewerIndex + direction));
  updateViewer();
}
$('#viewer-prev').addEventListener('click', () => moveViewer(-1));
$('#viewer-next').addEventListener('click', () => moveViewer(1));
let touchStart = null;
$('.viewer-stage').addEventListener('touchstart', event => {
  if (event.touches.length === 1) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });
$('.viewer-stage').addEventListener('touchend', event => {
  if (!touchStart || !event.changedTouches.length) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) moveViewer(dx < 0 ? 1 : -1);
  touchStart = null;
}, { passive: true });
document.addEventListener('keydown', event => {
  if (viewer.open) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); moveViewer(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); moveViewer(1); }
    return;
  }
  if (event.key === 'Escape' && activeFabric) goBack();
});

async function loadCatalog() {
  try {
    const response = await fetch('catalog.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    fabrics = data.fabrics.filter(fabric => fabric.published !== false);
    renderCatalog();
    route();
  } catch (error) {
    console.error('No se pudo cargar el catálogo.', error);
    grid.innerHTML = '<div class="error-message"><p>No pudimos cargar las telas.</p><button type="button" id="retry-catalog">Volver a intentar</button></div>';
    $('#retry-catalog').addEventListener('click', loadCatalog);
  }
}
loadCatalog();
