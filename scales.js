/*
 * Scale data and the music theory needed to spell scales correctly.
 * No page code lives here, so the theory can be tested on its own (tests/scales.test.js).
 */
'use strict';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PITCHES = [0, 2, 4, 5, 7, 9, 11]; // semitones above C for each letter
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]; // semitones above the tonic for major-scale degrees 1–7

/**
 * Every scale the app can show. `degrees` describes the scale against the major
 * scale ("b3" is a flattened third, "#4" a raised fourth), which is all it takes
 * to spell it correctly in any key. `group` matches a filter button in index.html.
 *
 * Adding a scale is one line, for example:
 *   { name: 'Harmonic Minor', group: 'minor', degrees: '1 2 b3 4 5 b6 7' },
 *   { name: 'Major Pentatonic', group: 'major', degrees: '1 2 3 5 6' },
 *   { name: 'Blues', group: 'minor', degrees: '1 b3 4 b5 5 b7' },
 */
const SCALE_TYPES = [
  { name: 'Major', group: 'major', degrees: '1 2 3 4 5 6 7' },
  { name: 'Natural Minor', group: 'minor', degrees: '1 2 b3 4 5 b6 b7' },
];

const ACCIDENTAL_WORDS = { '-2': 'double flat', '-1': 'flat', 1: 'sharp', 2: 'double sharp' };

/** Wraps any interval into -6…+5 semitones, so it reads as the nearest accidental. */
function nearestOffset(semitones) {
  return ((((semitones + 6) % 12) + 12) % 12) - 6;
}

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
 * Returns the notes from the tonic up to and including its octave.
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
    };
  });
  return [...notes, { ...notes[0] }];
}

/** Every name for a pitch class (0 = C … 11 = B) that needs at most one sharp or flat. */
function namesForPitchClass(pitchClass) {
  return LETTERS.map((letter, index) => ({
    letter,
    accidental: nearestOffset(pitchClass - LETTER_PITCHES[index]),
  })).filter((note) => Math.abs(note.accidental) <= 1);
}

/**
 * Builds a scale of the given type on a pitch class (0 = C … 11 = B).
 * The tonic takes whichever name gives the scale the fewest sharps and flats,
 * which lands on the familiar keys: D♭ major rather than C♯ major, G♯ minor
 * rather than A♭ minor. When two names tie (F♯/G♭ major, D♯/E♭ minor), both
 * are proper keys, so `random` picks one.
 */
function buildScale(type, pitchClass, random = Math.random) {
  const candidates = namesForPitchClass(pitchClass).map((tonic) => {
    const notes = spellScale(tonic, type.degrees);
    const accidentals = notes.slice(0, -1).reduce((total, note) => total + Math.abs(note.accidental), 0);
    return { tonic, notes, accidentals };
  });
  const fewest = Math.min(...candidates.map((candidate) => candidate.accidentals));
  const simplest = candidates.filter((candidate) => candidate.accidentals === fewest);
  const { tonic, notes } = simplest[Math.floor(random() * simplest.length)];
  return { type, tonic, notes };
}

/** Note names as they should be read aloud: "D flat", "F sharp", "E". */
function describeNote(note) {
  return note.accidental ? `${note.letter} ${ACCIDENTAL_WORDS[note.accidental]}` : note.letter;
}
