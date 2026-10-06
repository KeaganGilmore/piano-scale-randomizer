// Tests for the logic in scales.js. Run from the repo root with: node --test
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// scales.js is a plain browser script, so run it in a sandbox and read back its globals.
const context = vm.createContext({ Math });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scales.js'), 'utf8'), context);
const { SCALE_TYPES, buildScale, spellScale, parseDegrees, describeNote, keyboardFor, staffPosition, scalesIn, createDealer } =
  vm.runInContext(
    '({ SCALE_TYPES, buildScale, spellScale, parseDegrees, describeNote, keyboardFor, staffPosition, scalesIn, createDealer })',
    context,
  );

const major = SCALE_TYPES.find((type) => type.name === 'Major');
const naturalMinor = SCALE_TYPES.find((type) => type.name === 'Natural Minor');

// Scale types the brief expects to be added later, to prove the catalogue format copes with them.
const harmonicMinor = { name: 'Harmonic Minor', group: 'minor', degrees: '1 2 b3 4 5 b6 7', keySignature: '1 2 b3 4 5 b6 b7' };
const melodicMinor = { name: 'Melodic Minor', group: 'minor', degrees: '1 2 b3 4 5 6 7', keySignature: '1 2 b3 4 5 b6 b7' };
const dorian = { name: 'Dorian', group: 'minor', degrees: '1 2 b3 4 5 6 b7' };

// buildScale takes its random source as an argument, so ties can be forced either way.
const pickFirst = () => 0;
const pickLast = () => 0.999999;

/** A repeatable stand-in for Math.random. */
function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const noteName = (note) =>
  note.letter + (note.accidental > 0 ? '#'.repeat(note.accidental) : 'b'.repeat(-note.accidental));
const spelled = (notes) => notes.map(noteName).join(' ');
const pitches = (notes) => notes.map((note) => note.pitch).join(' ');
const scaleId = (scale) => `${scale.type.name}:${scale.pitchClass}`;

/** Every spelling buildScale can produce for a pitch class, sorted for comparison. */
function spellingsFor(type, pitchClass) {
  const options = new Set([pickFirst, pickLast].map((random) => spelled(buildScale(type, pitchClass, random).notes)));
  return [...options].sort();
}

const tonic = (name) => ({ letter: name[0], accidental: name.slice(1) === '#' ? 1 : name.slice(1) === 'b' ? -1 : 0 });

/** The keyboard as text: white keys by letter, black keys by position, scale notes in brackets. */
function sketchKeyboard(notes) {
  const WHITE_LETTERS = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
  const { whiteKeys, blackKeys } = keyboardFor(notes);
  const inScale = (key) => (key.note ? `[${noteName(key.note)}]` : '');
  return {
    white: whiteKeys.map((key) => WHITE_LETTERS[((key.pitch % 12) + 12) % 12] + inScale(key)).join(' '),
    black: blackKeys.map((key) => key.x + inScale(key)).join(' '),
  };
}

// Indexed by pitch class: 0 = C, 1 = C♯/D♭, … 11 = B.
const MAJOR_SCALES = [
  ['C D E F G A B C'],
  ['Db Eb F Gb Ab Bb C Db'],
  ['D E F# G A B C# D'],
  ['Eb F G Ab Bb C D Eb'],
  ['E F# G# A B C# D# E'],
  ['F G A Bb C D E F'],
  ['F# G# A# B C# D# E# F#', 'Gb Ab Bb Cb Db Eb F Gb'],
  ['G A B C D E F# G'],
  ['Ab Bb C Db Eb F G Ab'],
  ['A B C# D E F# G# A'],
  ['Bb C D Eb F G A Bb'],
  ['B C# D# E F# G# A# B'],
];

const NATURAL_MINOR_SCALES = [
  ['C D Eb F G Ab Bb C'],
  ['C# D# E F# G# A B C#'],
  ['D E F G A Bb C D'],
  ['D# E# F# G# A# B C# D#', 'Eb F Gb Ab Bb Cb Db Eb'],
  ['E F# G A B C D E'],
  ['F G Ab Bb C Db Eb F'],
  ['F# G# A B C# D E F#'],
  ['G A Bb C D Eb F G'],
  ['G# A# B C# D# E F# G#'],
  ['A B C D E F G A'],
  ['Bb C Db Eb F Gb Ab Bb'],
  ['B C# D E F# G A B'],
];

/* ---------- Spelling ---------- */

test('major scales are spelled in the conventional key for all 12 roots', () => {
  MAJOR_SCALES.forEach((expected, pitchClass) => {
    assert.deepEqual(spellingsFor(major, pitchClass), [...expected].sort(), `pitch class ${pitchClass}`);
  });
});

test('natural minor scales are spelled in the conventional key for all 12 roots', () => {
  NATURAL_MINOR_SCALES.forEach((expected, pitchClass) => {
    assert.deepEqual(spellingsFor(naturalMinor, pitchClass), [...expected].sort(), `pitch class ${pitchClass}`);
  });
});

test('major and natural minor never need a double sharp or flat', () => {
  for (const type of [major, naturalMinor]) {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
      for (const random of [pickFirst, pickLast]) {
        const notes = buildScale(type, pitchClass, random).notes;
        assert.ok(notes.every((note) => Math.abs(note.accidental) <= 1), `${type.name} on ${pitchClass}`);
      }
    }
  }
});

test('every scale starts and ends on its tonic, and seven-note scales use each letter once', () => {
  for (const type of SCALE_TYPES) {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
      for (const random of [pickFirst, pickLast]) {
        const scale = buildScale(type, pitchClass, random);
        const label = `${type.name} on pitch class ${pitchClass}`;
        const body = scale.notes.slice(0, -1);
        assert.equal(noteName(scale.notes[0]), noteName(scale.tonic), `${label}: first note`);
        assert.equal(noteName(scale.notes.at(-1)), noteName(scale.tonic), `${label}: octave`);
        assert.equal(scale.notes.at(-1).pitch, scale.tonic.pitch + 12, `${label}: octave pitch`);
        assert.ok(body.every((note) => Math.abs(note.accidental) <= 2), `${label}: beyond a double accidental`);
        if (body.length === 7) {
          assert.equal(new Set(body.map((note) => note.letter)).size, 7, `${label}: repeated letter`);
        }
      }
    }
  }
});

test('degree formulas spell other scale types correctly, including double accidentals', () => {
  assert.equal(spelled(spellScale(tonic('A'), '1 2 b3 4 5 b6 7')), 'A B C D E F G# A');
  assert.equal(spelled(spellScale(tonic('G#'), '1 2 b3 4 5 b6 7')), 'G# A# B C# D# E F## G#');
  assert.equal(spelled(spellScale(tonic('C'), '1 b3 4 b5 5 b7')), 'C Eb F Gb G Bb C');
  assert.equal(spelled(spellScale(tonic('Gb'), '1 2 3 5 6')), 'Gb Ab Bb Db Eb Gb');
  assert.equal(spelled(spellScale(tonic('Db'), '1 2 b3 4 5 b6 bb7')), 'Db Eb Fb Gb Ab Bbb Cbb Db');
});

test('scales written in another key take their tonic from that key signature', () => {
  assert.deepEqual(spellingsFor(harmonicMinor, 1), ['C# D# E F# G# A B# C#']);
  assert.deepEqual(spellingsFor(harmonicMinor, 8), ['G# A# B C# D# E F## G#']);
  assert.deepEqual(spellingsFor(melodicMinor, 1), ['C# D# E F# G# A# B# C#']);
  assert.deepEqual(spellingsFor(melodicMinor, 8), ['G# A# B C# D# E# F## G#']);
  // Modes need no key signature: their own notes already give the simplest key.
  assert.deepEqual(spellingsFor(dorian, 3), ['Eb F Gb Ab Bb C Db Eb']);
});

test('each note carries its pitch in semitones above C, rising to the octave', () => {
  assert.equal(pitches(spellScale(tonic('Db'), major.degrees)), '1 3 5 6 8 10 12 13');
  assert.equal(pitches(spellScale(tonic('Cb'), major.degrees)), '-1 1 3 4 6 8 10 11');
  assert.equal(pitches(spellScale(tonic('A'), naturalMinor.degrees)), '9 11 12 14 16 17 19 21');
});

test('malformed degrees are rejected so typos in new scales fail loudly', () => {
  for (const degrees of ['1 2 x3', '1 2 3 8', '0 2 3', '1 b#3', '1 bbb3', '']) {
    assert.throws(() => parseDegrees(degrees), /scale degree/, JSON.stringify(degrees));
  }
});

test('notes are described in words for screen readers', () => {
  assert.equal(describeNote(tonic('E')), 'E');
  assert.equal(describeNote(tonic('Db')), 'D flat');
  assert.equal(describeNote(tonic('F#')), 'F sharp');
  assert.equal(describeNote({ letter: 'F', accidental: 2 }), 'F double sharp');
  assert.equal(describeNote({ letter: 'B', accidental: -2 }), 'B double flat');
});

/* ---------- Keyboard ---------- */

test('the keyboard shows the scale with one white key to spare on each side', () => {
  assert.deepEqual(sketchKeyboard(spellScale(tonic('C'), major.degrees)), {
    white: 'B C[C] D[D] E[E] F[F] G[G] A[A] B[B] C[C] D',
    black: '0 2 3 5 6 7 9 10',
  });
  assert.deepEqual(sketchKeyboard(spellScale(tonic('Db'), major.degrees)), {
    white: 'B C D E F[F] G A B C[C] D E',
    black: '0 2[Db] 3[Eb] 5[Gb] 6[Ab] 7[Bb] 9[Db] 10',
  });
  // E sharp is played on the white key F.
  assert.deepEqual(sketchKeyboard(spellScale(tonic('F#'), major.degrees)), {
    white: 'E F G A B[B] C D E F[E#] G A',
    black: '0 2[F#] 3[G#] 4[A#] 6[C#] 7[D#] 9[F#] 10 11',
  });
});

test('every scale lights exactly its own eight keys', () => {
  for (const type of SCALE_TYPES) {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
      for (const random of [pickFirst, pickLast]) {
        const scale = buildScale(type, pitchClass, random);
        const { whiteKeys, blackKeys } = keyboardFor(scale.notes);
        const lit = [...whiteKeys, ...blackKeys].filter((key) => key.note).map((key) => key.pitch);
        assert.equal(lit.sort((a, b) => a - b).join(' '), pitches(scale.notes), `${type.name} on ${pitchClass}`);
      }
    }
  }
});

/* ---------- Staff ---------- */

test('notes sit on the staff by letter, counted in steps from middle C', () => {
  const positions = (notes) => notes.map(staffPosition).join(' ');
  assert.equal(positions(spellScale(tonic('C'), major.degrees)), '0 1 2 3 4 5 6 7');
  assert.equal(positions(spellScale(tonic('Db'), major.degrees)), '1 2 3 4 5 6 7 8');
  // C flat is written on C's line even though it sounds a semitone lower.
  assert.equal(positions(spellScale(tonic('Cb'), major.degrees)), '0 1 2 3 4 5 6 7');
  // E sharp sits on E's line, not F's.
  assert.equal(positions(spellScale(tonic('F#'), major.degrees)), '3 4 5 6 7 8 9 10');
});

/* ---------- Dealing ---------- */

test('filters hold the 12 roots of each scale type in their group', () => {
  assert.equal(scalesIn('all').length, SCALE_TYPES.length * 12);
  for (const group of ['major', 'minor']) {
    const scales = scalesIn(group);
    assert.equal(scales.length, 12, group);
    assert.ok(scales.every((scale) => scale.type.group === group), group);
  }
});

test('scales are dealt in rounds: each one once before any repeats', () => {
  const pool = scalesIn('all');
  const deal = createDealer(pool, seededRandom(1));
  let previous = null;
  for (let round = 0; round < 50; round++) {
    const dealt = new Set();
    for (let i = 0; i < pool.length; i++) {
      previous = deal(previous);
      dealt.add(scaleId(previous));
    }
    assert.equal(dealt.size, pool.length, `round ${round}`);
  }
});

test('the scale on screen is never dealt straight back, across rounds and filter changes', () => {
  const random = seededRandom(7);
  const groups = ['all', 'major', 'minor'];
  let deal = createDealer(scalesIn('all'), random);
  let previous = null;
  for (let i = 0; i < 5000; i++) {
    if (i % 37 === 0) deal = createDealer(scalesIn(groups[i % 3]), random);
    const next = deal(previous);
    if (previous) assert.notEqual(scaleId(next), scaleId(previous), `draw ${i}`);
    previous = next;
  }
});

/* ---------- Page wiring ---------- */

test('filter buttons in index.html and scale groups match up both ways', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const filters = [...html.matchAll(/data-filter="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(filters.includes('all'), 'missing the "all" filter');
  for (const type of SCALE_TYPES) {
    assert.ok(filters.includes(type.group), `no filter button for group "${type.group}" (${type.name})`);
  }
  for (const filter of filters) {
    assert.ok(scalesIn(filter).length > 0, `the "${filter}" button has no scales to deal`);
  }
});
