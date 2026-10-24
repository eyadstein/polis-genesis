# Changelog

## Unreleased

* Wire a small neural network into every resident's daily choices. It has 13 inputs, one hidden layer of 8 tanh units and 6 outputs (eat, drink, rest, socialize, work, wander), is trained online by backpropagation from how the resident feels after each choice, differs for each person, is blended into children and is saved with the town (older saves load with an untrained network). The old rules still provide every base score and decide alone in emergencies (very low hunger, thirst or energy). `World::learned_choices` turns the networks off for comparison, and a test checks that towns with and without networks stay equally healthy.
* Add a `GET /api/health` route to the live server that answers `{"status":"ok"}` without touching the town.

## 0.4.0

* Add validated, versioned JSON saves and loading for the complete Rust simulation state, including invariant checks and deterministic continuation after restoring.
* Record simulation seed, initial population, map dimensions, and market food-stock history in export format 3 while retaining viewer compatibility with format 2.
* Validate replay frames and conversation records, preserve final frames for short runs, and propagate native simulation failures through the Python CLI exit status.
* Reject invalid world dimensions and empty populations before allocation, with fallible `World::try_new` for actionable configuration errors.
* Improve the 3D town with distinct building designs, clearer street and plaza layouts, a waterfront promenade, bridges, a connected castle, mountains, varied trees, and animated waves.
* Reduce Rust resident crowd-lookup costs and temporary allocations in viewer scene updates; lower viewer pixel-ratio and shadow-map budgets.
* Clarify the implemented resident decision path and persistence boundaries, remove unsupported claims about LLM-driven minds, and improve architecture, performance, contribution, and release documentation.
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
