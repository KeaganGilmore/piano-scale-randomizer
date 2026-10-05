# Piano Scale Randomizer

A random piano scale to practice, readable from the music stand. Open it on your phone, play the scale on screen, tap for the next one.

**Live:** https://keagangilmore.github.io/piano-scale-randomizer/ (once GitHub Pages is enabled, see below)

## Using it

- **Next scale:** tap the button, swipe left across the scale, or press <kbd>Space</kbd> or <kbd>→</kbd>.
- **Filter:** All, Major or Minor, at the top left. Tapping the active filter also deals the next scale.
- Scales come in shuffled rounds: every scale in the filter appears once before any repeats, and the same scale never appears twice in a row.
- Light and dark mode follow your device. The button at the top right overrides that, and the choice is remembered on that device.
- On a phone, **Add to Home Screen** opens it full screen, like an app.

Every scale is spelled in its usual key, with each letter used once: D♭ major rather than C♯ major, G♯ minor rather than A♭ minor. F♯/G♭ major and D♯/E♭ minor are equally common keys, so either spelling can come up.

## Run it locally

Open `index.html` in a browser. There's no build step and nothing to install.

## Deploy to GitHub Pages

In the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, and save. The site is published at the URL above a minute or so later.

## Add a scale type

Add one line to `SCALE_TYPES` in [`scales.js`](scales.js):

```js
{ name: 'Harmonic Minor', group: 'minor', degrees: '1 2 b3 4 5 b6 7' },
```

`degrees` lists the scale against the major scale (`b3` is a flattened third, `#4` a raised fourth), which is enough to spell it correctly in every key. `group` must match a filter button's `data-filter` in `index.html`. To give a new group its own filter, add a button there.

## Tests

```sh
node --test
```

Needs Node 18 or newer and nothing else. The tests check the spelling of all 24 scales and that every scale group has a filter button.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, including the engraved sharp and flat glyphs |
| `styles.css` | Layout and light/dark themes |
| `scales.js` | The list of scales and the music theory that spells them |
| `script.js` | Dealing scales, the controls, keyboard and swipe input, theme switching |
| `manifest.webmanifest`, `icons/` | Browser tab and home screen icons |
| `tests/` | Unit tests for `scales.js` |

## License

[CC BY-NC-ND 4.0](LICENSE). If you find it useful, see [DONATIONS.md](DONATIONS.md).
