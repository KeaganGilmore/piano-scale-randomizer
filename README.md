# Piano Scale Randomizer

A random piano scale to practice, readable from the music stand. Open it on your phone, play the scale on screen, tap for the next one.

**Live:** https://keagangilmore.github.io/piano-scale-randomizer/ (once GitHub Pages is enabled, see below)

## Using it

- **Next scale:** tap the button, swipe left across the scale, or press <kbd>Space</kbd> or <kbd>→</kbd>.
- **Filter:** All, Major or Minor, at the top left. Tapping the active filter also deals the next scale.
- **Keyboard diagram:** the scale's keys are lit on a picture of the piano and labelled with their notes, so beginners can see exactly which keys to play.
- **Sheet music:** the scale is also written on a treble staff, beside the keyboard on wide screens and below it on phones. Very short phone screens leave it out to keep everything on one screen.
- Scales come in shuffled rounds: every scale in the filter appears once before any repeats, and the same scale never appears twice in a row.
- Light and dark mode follow your device. The button at the top right overrides that, and the choice is remembered on that device.
- On a phone, **Add to Home Screen** opens it like an app, without the browser's address bar.

Every scale is spelled in its usual key, with each letter used once: D♭ major rather than C♯ major, G♯ minor rather than A♭ minor. F♯/G♭ major and D♯/E♭ minor are equally common keys, so either spelling can come up.

## Run it locally

Open `index.html` in a browser. There's no build step and nothing to install.

## Deploy to GitHub Pages

In the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, and save. The site is published at the URL above a minute or so later.

## Add a scale type

Add one line to `SCALE_TYPES` in [`scales.js`](scales.js):

```js
{ name: 'Dorian', group: 'minor', degrees: '1 2 b3 4 5 6 b7' },
```

- `degrees` lists the scale against the major scale (`b3` is a flattened third, `#4` a raised fourth). The app spells every key from it and lights the right keys on the keyboard.
- `group` must match a filter button's `data-filter` in `index.html`. To give a new group its own filter, add a button there.
- `keySignature` is optional. Use it when a scale is written in another scale's key, so the tonic gets the conventional name. Harmonic and melodic minor are written in their natural minor key, which gives C♯ harmonic minor rather than D♭:

  ```js
  { name: 'Harmonic Minor', group: 'minor', degrees: '1 2 b3 4 5 b6 7', keySignature: '1 2 b3 4 5 b6 b7' },
  ```

## Tests

```sh
node --test
```

Needs Node 18 or newer and nothing else. The tests cover the spelling of all 24 scales (and harmonic minor, melodic minor and Dorian as examples of new types), the keyboard layout, staff positions, the shuffled rounds, and that the filter buttons and scale groups match.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, including the engraved sharp and flat glyphs and the treble clef and whole note from the [Bravura](https://github.com/steinbergmedia/bravura) music font (SIL Open Font License) |
| `styles.css` | Layout, the keyboard and staff, and light/dark themes |
| `scales.js` | The list of scales, how they're spelled, where they sit on the keyboard, and the order they're dealt in |
| `script.js` | Drawing the scale, keyboard and staff, the controls, keyboard and swipe input, theme switching |
| `manifest.webmanifest`, `icons/` | Browser tab and home screen icons |
| `tests/` | Unit tests for `scales.js` |

## License

[CC BY-NC-ND 4.0](LICENSE). If you find it useful, see [DONATIONS.md](DONATIONS.md).
