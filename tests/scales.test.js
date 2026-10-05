// Tests for the music theory in scales.js. Run from the repo root with: node --test
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// scales.js is a plain browser script, so run it in a sandbox and read back its globals.
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scales.js'), 'utf8'), context);
const { SCALE_TYPES, buildScale, spellScale, parseDegrees, describeNote } = vm.runInContext(
  '({ SCALE_TYPES, buildScale, spellScale, parseDegrees, describeNote })',
  context,
);

const major = SCALE_TYPES.find((type) => type.name === 'Major');
const naturalMinor = SCALE_TYPES.find((type) => type.name === 'Natural Minor');

// buildScale takes its random source as an argument, so ties can be forced either way.
const pickFirst = () => 0;
const pickLast = () => 0.999999;

const noteName = (note) =>
  note.letter + (note.accidental > 0 ? '#'.repeat(note.accidental) : 'b'.repeat(-note.accidental));
const spelled = (notes) => notes.map(noteName).join(' ');

/** Every spelling buildScale can produce for a pitch class, sorted for comparison. */
function spellingsFor(type, pitchClass) {
  const options = new Set([pickFirst, pickLast].map((random) => spelled(buildScale(type, pitchClass, random).notes)));
  return [...options].sort();
}

const tonic = (name) => ({ letter: name[0], accidental: name.slice(1) === '#' ? 1 : name.slice(1) === 'b' ? -1 : 0 });

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

test('every scale uses each letter once, avoids double accidentals and ends on its tonic', () => {
  for (const type of SCALE_TYPES) {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
      for (const random of [pickFirst, pickLast]) {
        const scale = buildScale(type, pitchClass, random);
        const label = `${type.name} on pitch class ${pitchClass}`;
        const body = scale.notes.slice(0, -1);
        assert.equal(new Set(body.map((note) => note.letter)).size, body.length, `${label}: repeated letter`);
        assert.ok(body.every((note) => Math.abs(note.accidental) <= 1), `${label}: double accidental`);
        assert.equal(noteName(scale.notes.at(-1)), noteName(scale.tonic), `${label}: octave`);
        assert.equal(noteName(scale.notes[0]), noteName(scale.tonic), `${label}: first note`);
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

test('every scale group has a filter button in index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const filters = new Set([...html.matchAll(/data-filter="([^"]+)"/g)].map((match) => match[1]));
  assert.ok(filters.has('all'), 'missing the "all" filter');
  for (const type of SCALE_TYPES) {
    assert.ok(filters.has(type.group), `no filter button for group "${type.group}" (${type.name})`);
  }
});
