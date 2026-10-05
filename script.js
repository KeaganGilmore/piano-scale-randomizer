/*
 * Page behavior: deals random scales and wires up the controls.
 * The scales themselves (spelling, keyboard layout, dealing order) live in scales.js.
 */
(function () {
  'use strict';

  const THEME_STORAGE_KEY = 'piano-scales-theme'; // also read by the inline script in index.html
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ACCIDENTAL_GLYPHS = { '-2': 'double-flat', '-1': 'flat', 1: 'sharp', 2: 'double-sharp' };
  const SWIPE_MIN_DISTANCE = 56; // px
  const SWIPE_MAX_DURATION = 600; // ms
  const ANNOUNCEMENT_LIFETIME = 3000; // ms

  const root = document.documentElement;
  const toolbar = document.querySelector('.toolbar');
  const scaleArea = document.getElementById('scale');
  const scaleName = scaleArea.querySelector('.scale-name');
  const tonicEl = document.getElementById('tonic');
  const qualityEl = document.getElementById('quality');
  const spokenNameEl = document.getElementById('scale-spoken');
  const notesEl = document.getElementById('notes');
  const keyboardEl = document.getElementById('keyboard');
  const announcer = document.getElementById('announcer');
  const nextButton = document.getElementById('next');
  const themeButton = document.getElementById('theme-toggle');
  const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
  const themeColorMetas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
  const defaultThemeColors = themeColorMetas.map((meta) => meta.content);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const viewport = window.visualViewport;

  let filter = 'all';
  let deal = createDealer(scalesIn(filter));
  let current = null; // { type, pitchClass } of the scale on screen
  let announcementTimer = 0;

  /* ---------- Rendering ---------- */

  function accidentalGlyph(accidental) {
    const name = ACCIDENTAL_GLYPHS[accidental];
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', `accidental accidental--${name}`);
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#${name}`);
    svg.appendChild(use);
    return svg;
  }

  /** A note as drawn on screen: its letter followed by an engraved accidental. */
  function drawnNote(note) {
    const fragment = document.createDocumentFragment();
    fragment.append(note.letter);
    if (note.accidental) fragment.append(accidentalGlyph(note.accidental));
    return fragment;
  }

  /** A list item that shows the drawn note but reads it out in words ("D flat"). */
  function noteItem(note) {
    const item = document.createElement('li');
    const drawn = document.createElement('span');
    drawn.setAttribute('aria-hidden', 'true');
    drawn.append(drawnNote(note));
    const spoken = document.createElement('span');
    spoken.className = 'visually-hidden';
    spoken.textContent = describeNote(note);
    item.append(drawn, spoken);
    return item;
  }

  function keyElement(color, key) {
    const element = document.createElement('div');
    element.className = key.note ? `key key--${color} key--in-scale` : `key key--${color}`;
    if (key.note) {
      const label = document.createElement('span');
      label.className = 'key-label';
      label.append(drawnNote(key.note));
      element.append(label);
    }
    return element;
  }

  /** Draws the stretch of keyboard around the scale, with the scale's keys lit and named. */
  function renderKeyboard(notes) {
    const { whiteKeys, blackKeys } = keyboardFor(notes);
    keyboardEl.style.setProperty('--white-keys', whiteKeys.length);
    keyboardEl.replaceChildren(
      ...whiteKeys.map((key) => keyElement('white', key)),
      ...blackKeys.map((key) => {
        const element = keyElement('black', key);
        element.style.left = `${(key.x / whiteKeys.length) * 100}%`;
        return element;
      }),
    );
  }

  function announce(message) {
    announcer.textContent = message;
    // Clear it once it has been read out, so reading through the page later doesn't hear the scale twice.
    clearTimeout(announcementTimer);
    announcementTimer = setTimeout(() => {
      announcer.textContent = '';
    }, ANNOUNCEMENT_LIFETIME);
  }

  function render(scale) {
    const name = `${describeNote(scale.tonic)} ${scale.type.name.toLowerCase()}`;
    tonicEl.replaceChildren(drawnNote(scale.tonic));
    qualityEl.textContent = scale.type.name;
    spokenNameEl.textContent = name;
    notesEl.replaceChildren(...scale.notes.map(noteItem));
    renderKeyboard(scale.notes);
    announce(`${name}: ${scale.notes.map(describeNote).join(', ')}`);
  }

  /** The new scale slides in from the right, the direction "next" points. */
  function playEntrance() {
    if (reducedMotion.matches || typeof scaleName.animate !== 'function') return;
    const frames = [
      { opacity: 0, transform: 'translateX(1.25rem)' },
      { opacity: 1, transform: 'none' },
    ];
    const timing = { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };
    scaleName.animate(frames, timing);
    notesEl.animate(frames, { ...timing, delay: 40, fill: 'backwards' });
    keyboardEl.animate(frames, { ...timing, delay: 80, fill: 'backwards' });
  }

  function showNextScale() {
    current = deal(current);
    render(buildScale(current.type, current.pitchClass));
    playEntrance();
  }

  function setFilter(value) {
    if (value !== filter) {
      filter = value;
      deal = createDealer(scalesIn(value)); // a fresh round from the new selection
      for (const button of filterButtons) {
        button.setAttribute('aria-pressed', String(button.dataset.filter === value));
      }
    }
    showNextScale();
  }

  /* ---------- Theme ---------- */

  function activeTheme() {
    return root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
  }

  function syncThemeUi() {
    themeButton.setAttribute('aria-pressed', String(activeTheme() === 'dark'));
    // Match the browser's toolbar to a manually chosen theme; otherwise the media-queried defaults apply.
    const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
    themeColorMetas.forEach((meta, index) => {
      meta.content = root.dataset.theme ? paper : defaultThemeColors[index];
    });
  }

  function toggleTheme() {
    const next = activeTheme() === 'dark' ? 'light' : 'dark';
    // Choosing the system's own theme clears the override, so the page follows the system again.
    if (next === (systemDark.matches ? 'dark' : 'light')) delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (root.dataset.theme) localStorage.setItem(THEME_STORAGE_KEY, root.dataset.theme);
      else localStorage.removeItem(THEME_STORAGE_KEY);
    } catch (error) {
      // Storage can be blocked; the choice still applies until the page is closed.
    }
    syncThemeUi();
  }

  /* ---------- Input ---------- */

  function onKeydown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const isSpace = event.key === ' ';
    if (!isSpace && event.key !== 'ArrowRight') return;
    const target = event.target instanceof Element ? event.target : document.body;
    if (target.closest('input, select, textarea, [contenteditable]')) return;
    if (isSpace && target.closest('button')) return; // a focused button already treats Space as a press
    event.preventDefault();
    if (!event.repeat) showNextScale();
  }

  /** Pinch-zoomed in, horizontal drags belong to the browser for panning, not to the swipe. */
  function isZoomed() {
    return Boolean(viewport) && viewport.scale > 1.01;
  }

  let swipeStart = null;

  function onPointerDown(event) {
    swipeStart =
      event.pointerType !== 'mouse' && event.isPrimary && !isZoomed()
        ? { x: event.clientX, y: event.clientY, time: event.timeStamp }
        : null;
  }

  function onPointerUp(event) {
    if (!swipeStart || !event.isPrimary) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    const elapsed = event.timeStamp - swipeStart.time;
    swipeStart = null;
    if (dx <= -SWIPE_MIN_DISTANCE && Math.abs(dx) > 2 * Math.abs(dy) && elapsed <= SWIPE_MAX_DURATION) {
      showNextScale();
    }
  }

  nextButton.addEventListener('click', showNextScale);
  for (const button of filterButtons) {
    button.addEventListener('click', () => setFilter(button.dataset.filter));
  }
  themeButton.addEventListener('click', toggleTheme);
  // A mouse click shouldn't leave focus on the filter or theme buttons: Space and → would then
  // draw a focus ring there (or toggle the theme) instead of just dealing the next scale.
  toolbar.addEventListener('mousedown', (event) => {
    if (event.target.closest('button')) event.preventDefault();
  });
  systemDark.addEventListener('change', syncThemeUi);
  document.addEventListener('keydown', onKeydown);
  scaleArea.addEventListener('pointerdown', onPointerDown);
  scaleArea.addEventListener('pointerup', onPointerUp);
  scaleArea.addEventListener('pointercancel', () => {
    swipeStart = null;
  });
  if (viewport) {
    viewport.addEventListener('resize', () => scaleArea.classList.toggle('is-zoomed', isZoomed()));
  }
  // iOS Safari only applies :active styles (the key press) when a touch listener exists.
  document.addEventListener('touchstart', () => {}, { passive: true });

  syncThemeUi();
  showNextScale();
})();
