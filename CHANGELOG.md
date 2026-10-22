# Changelog

## Unreleased

* Separate buildings, trees, roadways, parked cars, and district fountains into clear footprints; place fountains in reserved park lots and interrupt streets at any plaza crossing. Add a beach promenade, two road-aligned bridges, and a bridge-connected castle beyond the city with a low-poly mountain range and animated waves.
* Give homes distinct roof colors and profiles plus visible front doors; keep courthouse buildings civic in scale, add bridge-end town gates and varied tree canopies, and lighten pedestrian geometry. Reduce the viewer's pixel-ratio and shadow-map budgets to lower GPU work.
* Validate world dimensions and reject empty populations before allocating simulation state; add fallible `World::try_new` for callers that need actionable configuration errors.
* Record the exact seed, initial population, map dimensions, and market food stock in town export format 3. The viewer continues to read format 2 and charts recorded food availability when present.
* Validate replay frame rows and conversation records before playback, and always record a final frame for short runs.
* Propagate native simulation failures through the Python command exit status and exercise the package tests on its declared Python 3.9 minimum.

## 0.2.1

* Python package polis genesis for PyPI distribution
* Interactive terminal console mode with ASCII city map and live telemetry
* GitHub Pages deployment workflow for the 3D visualizer
* About modal in the viewer explaining simulation mechanics and controls

## 0.2.0

* Water system: river and lake outside the streets, fountains in the middle of every district
* Thirst need, drinking action, and pathfinding to nearby water sources
* Clear notifications when adding people and auto reconnection in offline replay mode
* Procedural town ambient soundscape and water acoustics synthesized with Web Audio

## 0.1.0

* Rust workspace with people, needs, moods, memory, gossip, family, economy, housing, crime and courts
* Live town server (`polis_cli serve`) and a 3D viewer with districts, day and night, news, conversations and speed control
* Small learning minds that decide how to answer a greeting and what to say
* Real world proportions in the viewer: about 4 metres per unit, adults 0.45 units, houses 0.6 to 1.5 units per floor, flats with 4 floors, trees about 2 units, lamps 1.4 units
* Community files: contributing guide, issue and pull request templates, release workflow
