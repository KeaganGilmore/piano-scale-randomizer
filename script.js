/*
 * Page behavior: deals random scales and wires up the controls.
 * The scales themselves (spelling, keyboard and staff positions, dealing order) live in scales.js.
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
  const staffEl = document.getElementById('staff');
  const diagramsEl = scaleArea.querySelector('.diagrams');
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

  /*
   * The keyboard is drawn as one SVG, in units where a white key is 24 wide. Proportions
   * follow a real piano: black keys are about 0.58 of a white key wide and two-thirds as
   * long, and they sit off-center within their groups of two and three, as on a real
   * keyboard. Keys in the scale keep their real color and get a red marker with the note.
   */
  const KEY = {
    width: 24,
    gap: 1, // between white keys
    rail: 6, // the lacquer rail and felt strip at the back
    length: 52, // white key, rail to front edge
    front: 5, // the white key's front face
    blackWidth: 14,
    blackLength: 33,
    blackSlope: 5, // the black key's sloping front
  };
  // How far each black key sits off the line between its white keys, in white-key widths.
  const BLACK_KEY_OFFSET = { 1: -0.1, 3: 0.1, 6: -0.14, 8: 0, 10: 0.14 };
  // Rough advance widths (in em) of capital letters, for centering note names in the markers.
  const LETTER_WIDTH = { A: 0.66, B: 0.64, C: 0.66, D: 0.7, E: 0.58, F: 0.55, G: 0.71 };
  const MARKER_ACCIDENTALS = {
    '-2': { glyph: 'double-flat', width: 0.54, height: 0.84, drop: 0.02 },
    '-1': { glyph: 'flat', width: 0.32, height: 0.84, drop: 0.02 },
    1: { glyph: 'sharp', width: 0.34, height: 0.86, drop: 0.11 },
    2: { glyph: 'double-sharp', width: 0.4, height: 0.4, drop: -0.13 },
  };

  function gradient(id, stops) {
    const element = svgElement('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    for (const [offset, className] of stops) {
      element.appendChild(svgElement('stop', { offset, class: className }));
    }
    return element;
  }

  /** A red marker with the note's name, centered on (cx, cy). */
  function keyMarker(note, cx, cy, radius, fontSize) {
    const group = svgElement('g', { class: 'kb-marker' });
    group.appendChild(svgElement('circle', { class: 'kb-dot', cx, cy, r: radius }));
    const accidental = MARKER_ACCIDENTALS[note.accidental];
    const letterWidth = LETTER_WIDTH[note.letter] * fontSize;
    const total = letterWidth + (accidental ? (0.04 + accidental.width) * fontSize : 0);
    const left = cx - total / 2;
    const baseline = cy + 0.35 * fontSize;
    const label = svgElement('g', { class: 'kb-label' });
    const text = svgElement('text', { x: left, y: baseline, 'font-size': fontSize });
    text.textContent = note.letter;
    label.appendChild(text);
    if (accidental) {
      label.appendChild(svgElement('use', {
        href: `#${accidental.glyph}`,
        'data-accidental': accidental.glyph,
        x: left + letterWidth + 0.04 * fontSize,
        y: baseline + (accidental.drop - accidental.height) * fontSize,
        width: accidental.width * fontSize,
        height: accidental.height * fontSize,
      }));
    }
    group.appendChild(label);
    return group;
  }

  /** Draws the stretch of keyboard around the scale, marking the scale's keys with their notes. */
  function renderKeyboard(notes) {
    const { whiteKeys, blackKeys } = keyboardFor(notes);
    const width = whiteKeys.length * KEY.width;
    const height = KEY.rail + KEY.length + KEY.front;
    const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'xMidYMid meet', focusable: 'false' });

    const defs = svgElement('defs', {});
    defs.append(
      gradient('kb-ivory', [[0, 'kb-ivory-hi'], [0.7, 'kb-ivory-hi'], [1, 'kb-ivory-lo']]),
      gradient('kb-ivory-front', [[0, 'kb-front-hi'], [1, 'kb-front-lo']]),
      gradient('kb-ebony', [[0, 'kb-ebony-lo'], [0.85, 'kb-ebony-hi'], [1, 'kb-ebony-lo']]),
      gradient('kb-ebony-slope', [[0, 'kb-slope-hi'], [1, 'kb-slope-lo']]),
      gradient('kb-rail-shade', [[0, 'kb-shade-hi'], [1, 'kb-shade-lo']]),
    );
    const blur = svgElement('filter', { id: 'kb-soft', x: '-50%', y: '-20%', width: '200%', height: '150%' });
    blur.appendChild(svgElement('feGaussianBlur', { stdDeviation: 1.4 }));
    defs.appendChild(blur);
    svg.appendChild(defs);

    // The gaps between keys show through behind them.
    svg.appendChild(svgElement('rect', { class: 'kb-gap', x: 0, y: 0, width, height, rx: 3 }));

    whiteKeys.forEach((key, index) => {
      const x = index * KEY.width + KEY.gap / 2;
      const keyWidth = KEY.width - KEY.gap;
      svg.appendChild(svgElement('rect', { x, y: KEY.rail + KEY.length - 2, width: keyWidth, height: KEY.front + 2, rx: 2, fill: 'url(#kb-ivory-front)' }));
      svg.appendChild(svgElement('rect', { x, y: KEY.rail, width: keyWidth, height: KEY.length, rx: 1, fill: 'url(#kb-ivory)' }));
    });

    // Shade under the rail, then the shadows the black keys cast forward onto the white keys.
    svg.appendChild(svgElement('rect', { x: 0, y: KEY.rail, width, height: 8, fill: 'url(#kb-rail-shade)' }));
    const shadows = svgElement('g', { class: 'kb-shadow', filter: 'url(#kb-soft)' });
    const blackX = (key) => (key.x + BLACK_KEY_OFFSET[((key.pitch % 12) + 12) % 12]) * KEY.width - KEY.blackWidth / 2;
    for (const key of blackKeys) {
      shadows.appendChild(svgElement('rect', { x: blackX(key) + 1.2, y: KEY.rail, width: KEY.blackWidth, height: KEY.blackLength + 2.5, rx: 2 }));
    }
    svg.appendChild(shadows);

    for (const key of blackKeys) {
      const x = blackX(key);
      const bottom = KEY.rail + KEY.blackLength;
      svg.appendChild(svgElement('rect', { x, y: KEY.rail - 2, width: KEY.blackWidth, height: KEY.blackLength + 2, rx: 1.6, fill: 'url(#kb-ebony)' }));
      svg.appendChild(svgElement('rect', { x: x + 0.9, y: bottom - KEY.blackSlope, width: KEY.blackWidth - 1.8, height: KEY.blackSlope - 0.8, rx: 1.1, fill: 'url(#kb-ebony-slope)' }));
      svg.appendChild(svgElement('rect', { class: 'kb-glint', x: x + 1.2, y: bottom - KEY.blackSlope, width: KEY.blackWidth - 2.4, height: 0.5 }));
    }

    // The rail along the back, with the red felt where it meets the keys.
    svg.appendChild(svgElement('rect', { class: 'kb-rail', x: 0, y: 0, width, height: KEY.rail }));
    svg.appendChild(svgElement('rect', { class: 'kb-felt', x: 0, y: KEY.rail - 1.6, width, height: 1.6 }));

    whiteKeys.forEach((key, index) => {
      if (key.note) svg.appendChild(keyMarker(key.note, (index + 0.5) * KEY.width, KEY.rail + KEY.length - 10.5, 8, 8.6));
    });
    for (const key of blackKeys) {
      if (key.note) svg.appendChild(keyMarker(key.note, blackX(key) + KEY.blackWidth / 2, KEY.rail + KEY.blackLength - KEY.blackSlope - 7, 6.3, 7.4));
    }

    keyboardEl.style.setProperty('--white-keys', whiteKeys.length);
    keyboardEl.replaceChildren(svg);
  }

  function svgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  /**
   * Writes the scale on a treble staff in whole notes. Units are staff spaces: the five
   * lines sit at y = 0…4, and each step up the staff (line to space) is half a space.
   */
  function renderStaff(notes) {
    const GLYPH_SCALE = 'scale(0.004 -0.004)'; // Bravura font units (250 per space, y up) to staff spaces
    const ACCIDENTALS = {
      '-2': { glyph: 'double-flat', width: 1.54, height: 2.4, center: 0.735 },
      '-1': { glyph: 'flat', width: 0.91, height: 2.4, center: 0.735 },
      1: { glyph: 'sharp', width: 1.12, height: 2.8, center: 0.5 },
      2: { glyph: 'double-sharp', width: 1, height: 1, center: 0.5 },
    };
    const NOTE_WIDTH = 1.69;
    const FIRST_NOTE = 4.4;
    const SLOT = 3.7;
    const top = -2.2;
    const width = FIRST_NOTE + notes.length * SLOT + 1;
    const height = 8.4;
    const lineY = (position) => 5 - position / 2; // middle C (0) sits one ledger line below the staff

    const parts = [];
    for (let line = 0; line < 5; line++) {
      parts.push(svgElement('line', { class: 'staff-line', x1: 0, x2: width - 0.6, y1: line, y2: line }));
    }
    parts.push(svgElement('use', { href: '#treble-clef', transform: `translate(0.4 3) ${GLYPH_SCALE}` }));

    notes.forEach((note, index) => {
      const position = staffPosition(note);
      const y = lineY(position);
      const x = FIRST_NOTE + index * SLOT + 1.5;
      // Ledger lines for notes above or below the staff.
      for (let ledger = 0; ledger >= position; ledger -= 2) {
        parts.push(svgElement('line', { class: 'staff-line', x1: x - 0.4, x2: x + NOTE_WIDTH + 0.4, y1: lineY(ledger), y2: lineY(ledger) }));
      }
      for (let ledger = 12; ledger <= position; ledger += 2) {
        parts.push(svgElement('line', { class: 'staff-line', x1: x - 0.4, x2: x + NOTE_WIDTH + 0.4, y1: lineY(ledger), y2: lineY(ledger) }));
      }
      const accidental = ACCIDENTALS[note.accidental];
      if (accidental) {
        parts.push(svgElement('use', {
          href: `#${accidental.glyph}`,
          x: x - accidental.width - 0.25,
          y: y - accidental.height * accidental.center,
          width: accidental.width,
          height: accidental.height,
        }));
      }
      parts.push(svgElement('use', { href: '#whole-note', transform: `translate(${x} ${y}) ${GLYPH_SCALE}` }));
    });

    // Final barline: thin then thick.
    parts.push(svgElement('rect', { x: width - 1.3, y: 0, width: 0.16, height: 4 }));
    parts.push(svgElement('rect', { x: width - 1, y: 0, width: 0.5, height: 4 }));

    staffEl.setAttribute('viewBox', `0 ${top} ${width} ${height}`);
    staffEl.style.aspectRatio = `${width} / ${height}`;
    staffEl.replaceChildren(...parts);
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
    renderStaff(scale.notes);
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
    diagramsEl.animate(frames, { ...timing, delay: 80, fill: 'backwards' });
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
