const $ = (selector, scope = document) => scope.querySelector(selector);
const catalogView = $('#catalog-view');
const detailView = $('#detail-view');
const grid = $('#catalog-grid');
const backButton = $('#back-button');
const viewer = $('#image-viewer');
const viewerViewport = $('#viewer-viewport');
const viewerImageStack = $('#viewer-image-stack');
const viewerImage = $('#viewer-image');
const viewerZoomControl = $('#viewer-zoom');
const viewerBacklightBase = $('#viewer-backlight-base');
const viewerBacklightControls = $('#viewer-backlight-controls');
const viewerBacklightControl = $('#viewer-backlight');
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
let viewerScale = 1;
let viewerPan = { x: 0, y: 0 };
let viewerBaseSize = { width: 0, height: 0 };
let viewerGesture = null;

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
    ${item.backlightBase ? `<button class="backlight-open" type="button" data-image-index="${index}" aria-label="Ajustar la intensidad del fondo de ${escapeHTML(item.title)}">Ajustar fondo <span aria-hidden="true">↗</span></button>` : ''}
    ${isFeature ? `<p class="feature-description">${escapeHTML(item.description)}</p>` : ''}
  </article>`;
}

function fabricInformationMarkup(fabric) {
  if (!fabric.details) return '';
  const { description, feel, recommendedFor, considerations } = fabric.details;
  const sections = [
    ['Cómo se siente', feel],
    ['Recomendada para', recommendedFor],
    ['A tener en cuenta', considerations]
  ];
  return `<section class="fabric-information" aria-labelledby="fabric-information-title">
    <h2 class="feature-heading" id="fabric-information-title">La tela en detalle</h2>
    <p class="fabric-information-intro">${escapeHTML(description)}</p>
    <div class="fabric-information-grid">${sections.map(([title, text]) => `<div class="fabric-information-item">
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(text)}</p>
    </div>`).join('')}</div>
  </section>`;
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
    ${fabricInformationMarkup(fabric)}
    <footer class="detail-footer">
      <div><p class="material-notes">${fabric.notes.map(note => `<span>${escapeHTML(note)}</span>`).join('')}</p>
      <p class="image-note">Imágenes ilustrativas del tejido.${fabric.features.some(item => ['resistencia', 'elasticidad'].includes(item.id)) ? ' El estiramiento representa la tela bajo tensión.' : ''}</p></div>
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

function endViewerGesture() {
  const gesture = viewerGesture;
  viewerGesture = null;
  viewerViewport.classList.remove('is-dragging');
  if (gesture && viewerViewport.hasPointerCapture(gesture.pointerId)) {
    viewerViewport.releasePointerCapture(gesture.pointerId);
  }
}

function renderViewerTransform() {
  const maxX = Math.max(0, (viewerBaseSize.width * viewerScale - viewerViewport.clientWidth) / 2);
  const maxY = Math.max(0, (viewerBaseSize.height * viewerScale - viewerViewport.clientHeight) / 2);
  viewerPan.x = Math.max(-maxX, Math.min(maxX, viewerPan.x));
  viewerPan.y = Math.max(-maxY, Math.min(maxY, viewerPan.y));
  viewerImageStack.style.transform = `translate(-50%, -50%) translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${viewerScale})`;
  viewerViewport.classList.toggle('is-zoomed', viewerScale > 1);
}

function fitViewerImage() {
  const width = viewerViewport.clientWidth;
  const height = viewerViewport.clientHeight;
  if (!width || !height || !viewerImage.naturalWidth || !viewerImage.naturalHeight) return;
  const fit = Math.min(width / viewerImage.naturalWidth, height / viewerImage.naturalHeight);
  viewerBaseSize = { width: viewerImage.naturalWidth * fit, height: viewerImage.naturalHeight * fit };
  viewerImageStack.style.width = `${viewerBaseSize.width}px`;
  viewerImageStack.style.height = `${viewerBaseSize.height}px`;
  renderViewerTransform();
}

function setViewerZoom(percent, resetPosition = false) {
  endViewerGesture();
  const value = Math.max(100, Math.min(300, Math.round(Number(percent) / 10) * 10 || 100));
  const nextScale = value / 100;
  viewerPan = resetPosition || nextScale === 1
    ? { x: 0, y: 0 }
    : { x: viewerPan.x * nextScale / viewerScale, y: viewerPan.y * nextScale / viewerScale };
  viewerScale = nextScale;
  viewerZoomControl.value = String(value);
  viewerZoomControl.setAttribute('aria-valuetext', `${value} por ciento`);
  $('#viewer-zoom-value').value = `${value}%`;
  $('#viewer-zoom-reset').disabled = value === 100;
  renderViewerTransform();
}

function setViewerBacklight(percent) {
  const numeric = Number(percent);
  const value = Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 100;
  viewerBacklightControl.value = String(value);
  viewerBacklightControl.setAttribute('aria-valuetext', `${value} por ciento`);
  $('#viewer-backlight-value').value = `${value}%`;
  viewerImage.style.opacity = viewerBacklightControl.disabled ? '1' : String(value / 100);
}

function syncBacklightReady() {
  const expected = viewerItems[viewerIndex]?.backlightBase;
  if (!expected || viewerBacklightBase.getAttribute('src') !== expected) return;
  const ready = viewerBacklightBase.complete && viewerBacklightBase.naturalWidth > 0;
  viewerBacklightBase.hidden = !ready;
  viewerBacklightControl.disabled = !ready;
  viewerBacklightControls.setAttribute('aria-busy', String(!ready));
  if (ready) setViewerBacklight(viewerBacklightControl.value);
}

function updateViewer() {
  setViewerZoom(100, true);
  const item = viewerItems[viewerIndex];
  $('#viewer-fabric').textContent = `${activeFabric.category} ${activeFabric.name}`;
  $('#viewer-title').textContent = item.title;
  viewerImage.src = item.src;
  viewerImage.alt = item.alt;
  viewerBacklightControls.hidden = !item.backlightBase;
  viewerBacklightControl.disabled = true;
  viewerBacklightBase.hidden = true;
  $('#viewer-backlight-help').textContent = 'Simulación ilustrativa';
  setViewerBacklight(100);
  if (item.backlightBase) {
    viewerBacklightControls.setAttribute('aria-busy', 'true');
    viewerBacklightBase.src = item.backlightBase;
    syncBacklightReady();
  } else {
    viewerBacklightControls.removeAttribute('aria-busy');
    viewerBacklightBase.removeAttribute('src');
  }
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
  fitViewerImage();
  $('#viewer-close').focus();
}

function closeViewer() {
  if (viewer.open) viewer.close();
}
viewer.addEventListener('close', () => {
  setViewerZoom(100, true);
  document.body.style.overflow = savedBodyOverflow;
  viewerTrigger?.focus({ preventScroll: true });
});
$('#viewer-close').addEventListener('click', closeViewer);
function moveViewer(direction) {
  const nextIndex = Math.max(0, Math.min(viewerItems.length - 1, viewerIndex + direction));
  if (nextIndex === viewerIndex) return;
  viewerIndex = nextIndex;
  updateViewer();
}
$('#viewer-prev').addEventListener('click', () => moveViewer(-1));
$('#viewer-next').addEventListener('click', () => moveViewer(1));
viewerZoomControl.addEventListener('input', () => setViewerZoom(viewerZoomControl.value));
viewerBacklightControl.addEventListener('input', () => setViewerBacklight(viewerBacklightControl.value));
viewerBacklightBase.addEventListener('load', syncBacklightReady);
viewerBacklightBase.addEventListener('error', () => {
  if (!viewerItems[viewerIndex]?.backlightBase) return;
  viewerBacklightControl.disabled = true;
  viewerBacklightBase.hidden = true;
  viewerBacklightControls.setAttribute('aria-busy', 'false');
  setViewerBacklight(100);
  $('#viewer-backlight-help').textContent = 'No se pudo cargar la simulación.';
});
$('#viewer-zoom-reset').addEventListener('click', () => {
  setViewerZoom(100, true);
  viewerZoomControl.focus();
});
viewerImage.addEventListener('load', fitViewerImage);
if ('ResizeObserver' in window) new ResizeObserver(fitViewerImage).observe(viewerViewport);
else window.addEventListener('resize', fitViewerImage);

viewerViewport.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || (viewerScale === 1 && event.pointerType === 'mouse')) return;
  viewerGesture = { pointerId: event.pointerId, pointerType: event.pointerType, x: event.clientX, y: event.clientY, panX: viewerPan.x, panY: viewerPan.y, zoomed: viewerScale > 1 };
  viewerViewport.setPointerCapture(event.pointerId);
  if (viewerGesture.zoomed) {
    viewerViewport.classList.add('is-dragging');
    event.preventDefault();
  }
});
viewerViewport.addEventListener('pointermove', event => {
  if (!viewerGesture || event.pointerId !== viewerGesture.pointerId || !viewerGesture.zoomed) return;
  viewerPan = { x: viewerGesture.panX + event.clientX - viewerGesture.x, y: viewerGesture.panY + event.clientY - viewerGesture.y };
  renderViewerTransform();
  event.preventDefault();
});
viewerViewport.addEventListener('pointerup', event => {
  if (!viewerGesture || event.pointerId !== viewerGesture.pointerId) return;
  const gesture = viewerGesture;
  endViewerGesture();
  if (gesture.zoomed || viewerScale > 1 || gesture.pointerType !== 'touch') return;
  const dx = event.clientX - gesture.x;
  const dy = event.clientY - gesture.y;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) moveViewer(dx < 0 ? 1 : -1);
});
viewerViewport.addEventListener('pointercancel', endViewerGesture);
viewerViewport.addEventListener('lostpointercapture', endViewerGesture);
document.addEventListener('keydown', event => {
  if (viewer.open) {
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
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
