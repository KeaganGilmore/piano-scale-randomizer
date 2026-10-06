/*
 * The scales and chords on offer, how to spell them, where they sit on the keyboard
 * and the staff, and the order they're dealt in. No page code lives here, so it can all be tested on its
 * own (tests/scales.test.js).
 */
'use strict';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PITCHES = [0, 2, 4, 5, 7, 9, 11]; // semitones above C for each letter
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]; // semitones above the tonic for major-scale degrees 1–7

/**
 * Every scale the app can show. `degrees` describes the scale against the major
 * scale ("b3" is a flattened third, "#4" a raised fourth); that's enough to spell
 * it in any key. `group` matches a filter button's data-filter in index.html.
 *
 * The tonic is named after the key the scale is written in. Usually that's the
 * scale itself; harmonic and melodic minor are written in their natural minor
 * key, so they say so with `keySignature` (C♯ harmonic minor, not D♭).
 *
 * Adding a scale is one line, for example:
 *   { name: 'Harmonic Minor', group: 'minor', degrees: '1 2 b3 4 5 b6 7', keySignature: '1 2 b3 4 5 b6 b7' },
 *   { name: 'Dorian', group: 'minor', degrees: '1 2 b3 4 5 6 b7' },
 *   { name: 'Major Pentatonic', group: 'major', degrees: '1 2 3 5 6' },
 */
const SCALE_TYPES = [
  { name: 'Major', group: 'major', degrees: '1 2 3 4 5 6 7' },
  { name: 'Natural Minor', group: 'minor', degrees: '1 2 b3 4 5 b6 b7' },
];

/**
 * Every chord the app can show, in the same format as the scales. A chord takes its
 * root's name from its key (D♭ major, G♯ minor), so `keySignature` is its scale.
 *
 * More chords are one line each, for example:
 *   { name: 'Dominant 7th', group: 'major', degrees: '1 3 5 b7', keySignature: '1 2 3 4 5 6 7' },
 *   { name: 'Diminished Chord', group: 'minor', degrees: '1 b3 b5', keySignature: '1 2 b3 4 5 b6 b7' },
 */
const CHORD_TYPES = [
  { name: 'Major Chord', group: 'major', degrees: '1 3 5', keySignature: '1 2 3 4 5 6 7' },
  { name: 'Minor Chord', group: 'minor', degrees: '1 b3 5', keySignature: '1 2 b3 4 5 b6 b7' },
];

const ACCIDENTAL_WORDS = { '-2': 'double flat', '-1': 'flat', 1: 'sharp', 2: 'double sharp' };

function mod(n, m) {
  return ((n % m) + m) % m;
}

/** Wraps any interval into -6…+5 semitones, so it reads as the nearest accidental. */
function nearestOffset(semitones) {
  return mod(semitones + 6, 12) - 6;
}

/* ---------- Spelling ---------- */

/** Turns "1 2 b3" into [{ step: 1, alteration: 0 }, { step: 2, alteration: 0 }, { step: 3, alteration: -1 }]. */
function parseDegrees(degrees) {
  return degrees
    .trim()
    .split(/\s+/)
    .map((token) => {
      const match = /^(bb?|##?)?([1-7])$/.exec(token);
      if (!match) throw new Error(`Unrecognized scale degree "${token}"`);
      const accidentals = match[1] || '';
      return {
        step: Number(match[2]),
        alteration: accidentals.startsWith('#') ? accidentals.length : -accidentals.length,
      };
    });
}

/**
 * Spells a scale upwards from a tonic such as { letter: 'D', accidental: -1 } (D♭).
 * Each degree takes the letter its number implies, so letters are never skipped
 * or repeated, and the accidental makes up whatever difference is left.
 * Returns the notes from the tonic up to and including its octave; each note's
 * `pitch` counts semitones above C, so the notes always rise.
 */
function spellScale(tonic, degrees) {
  const tonicIndex = LETTERS.indexOf(tonic.letter);
  const tonicPitch = LETTER_PITCHES[tonicIndex] + tonic.accidental;
  const notes = parseDegrees(degrees).map(({ step, alteration }) => {
    const letterIndex = (tonicIndex + step - 1) % LETTERS.length;
    const pitch = tonicPitch + MAJOR_STEPS[step - 1] + alteration;
    return {
      letter: LETTERS[letterIndex],
      accidental: nearestOffset(pitch - LETTER_PITCHES[letterIndex]),
      pitch,
    };
  });
  return [...notes, { ...notes[0], pitch: notes[0].pitch + 12 }];
}

/** Every name for a pitch class (0 = C … 11 = B) that needs at most one sharp or flat. */
function namesForPitchClass(pitchClass) {
  return LETTERS.map((letter, index) => ({
    letter,
    accidental: nearestOffset(pitchClass - LETTER_PITCHES[index]),
  })).filter((note) => Math.abs(note.accidental) <= 1);
}

function countAccidentals(notes) {
  return notes.slice(0, -1).reduce((total, note) => total + Math.abs(note.accidental), 0);
}

/**
 * Builds a scale of the given type on a pitch class (0 = C … 11 = B).
 * The tonic takes whichever name gives the scale's key the fewest sharps and
 * flats, which lands on the familiar keys: D♭ major rather than C♯ major, G♯
 * minor rather than A♭ minor. When two names tie (F♯/G♭ major, D♯/E♭ minor),
 * both are proper keys, so `random` picks one.
 */
function buildScale(type, pitchClass, random = Math.random) {
  const notes = spellScale(chooseTonic(type, pitchClass, random), type.degrees);
  return { type, tonic: notes[0], notes };
}

/** Builds a chord the same way, with each note once (no repeated octave), root first. */
function buildChord(type, pitchClass, random = Math.random) {
  const notes = spellScale(chooseTonic(type, pitchClass, random), type.degrees).slice(0, -1);
  return { type, tonic: notes[0], notes };
}

function chooseTonic(type, pitchClass, random) {
  const key = type.keySignature || type.degrees;
  const candidates = namesForPitchClass(pitchClass).map((tonic) => ({
    tonic,
    accidentals: countAccidentals(spellScale(tonic, key)),
  }));
  const fewest = Math.min(...candidates.map((candidate) => candidate.accidentals));
  const simplest = candidates.filter((candidate) => candidate.accidentals === fewest);
  return simplest[Math.floor(random() * simplest.length)].tonic;
}

/** Note names as they should be read aloud: "D flat", "F sharp", "E". */
function describeNote(note) {
  return note.accidental ? `${note.letter} ${ACCIDENTAL_WORDS[note.accidental]}` : note.letter;
}

/* ---------- Keyboard ---------- */

function isWhiteKey(pitch) {
  return LETTER_PITCHES.includes(mod(pitch, 12));
}

/** White keys numbered from the C at pitch 0 (that C is 0, the D above it 1, the B below it -1). */
function whiteKeyIndex(pitch) {
  return 7 * Math.floor(pitch / 12) + LETTER_PITCHES.indexOf(mod(pitch, 12));
}

function whiteKeyPitch(index) {
  return 12 * Math.floor(index / 7) + LETTER_PITCHES[mod(index, 7)];
}

/**
 * The stretch of keyboard to draw for a scale: from one white key below the tonic
 * to one white key above its octave. Keys in the scale carry their note. Each black
 * key's `x` is the position of its center, in white-key widths from the left edge;
 * black keys at either end hang over the edge, like a cropped photo of a keyboard.
 */
function keyboardFor(notes) {
  const low = notes[0].pitch;
  const high = notes[notes.length - 1].pitch;
  const first = whiteKeyIndex(isWhiteKey(low) ? low : low - 1) - 1;
  const last = whiteKeyIndex(isWhiteKey(high) ? high : high + 1) + 1;
  const notesByPitch = new Map(notes.map((note) => [note.pitch, note]));
  const whiteKeys = [];
  const blackKeys = [];
  for (let pitch = whiteKeyPitch(first) - 1; pitch <= whiteKeyPitch(last) + 1; pitch++) {
    const key = { pitch, note: notesByPitch.get(pitch) || null };
    if (!isWhiteKey(pitch)) {
      blackKeys.push({ ...key, x: whiteKeyIndex(pitch - 1) + 1 - first });
    } else if (pitch >= whiteKeyPitch(first) && pitch <= whiteKeyPitch(last)) {
      whiteKeys.push(key);
    }
  }
  return { whiteKeys, blackKeys };
}

/* ---------- Staff ---------- */

/**
 * Where a note is written on the staff, in steps from middle C (C = 0, D = 1 … the
 * C above = 7). It goes by letter, so C♭ shares C's line and E♯ shares E's.
 */
function staffPosition(note) {
  const natural = note.pitch - note.accidental;
  return 7 * Math.floor(natural / 12) + LETTER_PITCHES.indexOf(mod(natural, 12));
}

/* ---------- Dealing ---------- */

/** Every type in a filter group ('all', 'major', 'minor'), as { type, pitchClass } for each of the 12 roots. */
function entriesIn(types, group) {
  const entries = [];
  for (const type of types) {
    if (group !== 'all' && type.group !== group) continue;
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) entries.push({ type, pitchClass });
  }
  return entries;
}

function scalesIn(group) {
  return entriesIn(SCALE_TYPES, group);
}

function chordsIn(group) {
  return entriesIn(CHORD_TYPES, group);
}

function isSameScale(a, b) {
  return a.type === b.type && a.pitchClass === b.pitchClass;
}

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Deals scales from `pool` in shuffled rounds, so every scale comes up once before
 * any comes up again. Returns a function that takes the scale on screen and deals
 * the next one, which is never that same scale, even when a new round starts.
 */
function createDealer(pool, random = Math.random) {
  let round = [];
  return function deal(previous) {
    if (round.length === 0) {
      round = shuffle(pool.slice(), random);
      const last = round.length - 1;
      if (previous && last > 0 && isSameScale(round[last], previous)) {
        [round[0], round[last]] = [round[last], round[0]];
      }
    }
    return round.pop();
  };
}
