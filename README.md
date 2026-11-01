# Torquesmith — Engine Lab

A browser engine builder / dyno / drag-strip / 3D test-track game. Pure static site:
no build step, no server code, no dependencies to install.

## Files
```
index.html            page
css/style.css         styles
js/physics.js         engine, boost, fuel, brakes, drag-strip physics
js/presets.js         preset engines + default build
js/audio.js           firing-pulse engine sound synth (main-thread controller)
engine-worklet.js     the same synth for the audio thread (must sit next to index.html)
js/career.js          career mode data + rules
js/charts.js          dyno charts
js/viz.js             engine animation, gauges, 2D drag strip
js/drive3d.js         3D test track
js/app.js             UI + game logic
lib/three.min.js      Three.js r128 (MIT, see lib/three.LICENSE)
```

## Deploy on Vercel
**Option A — no tools:** go to vercel.com → Add New → Project → drag this folder in
(or push it to a GitHub repo and import it). Framework preset: **Other**. Build command: *none*.
Output directory: **.** (the folder root). Deploy.

**Option B — CLI:**
```
npm i -g vercel
cd site
vercel --prod
```
Accept the defaults (no build command, output directory `.`).

## Run locally
Browsers block audio worklets from `file://`, so serve the folder:
```
cd site
python3 -m http.server 8000
```
then open http://localhost:8000

## Notes
- Saves (garage builds, challenges, career) live in the visitor's browser `localStorage`.
- Fonts load from Google Fonts; everything else is self-hosted.
