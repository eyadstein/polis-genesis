# Polis Genesis

> **An autonomous town simulation where artificial life meets a living
> 3D world.**

[![ENTER THE WORLD --- Launch Live
Demo](https://img.shields.io/badge/ENTER_THE_WORLD-Launch_Live_Demo-2ea44f?style=for-the-badge)](https://eyadstein.github.io/polis-genesis/)

[![CI](https://github.com/eyadstein/polis-genesis/actions/workflows/ci.yml/badge.svg)](https://github.com/eyadstein/polis-genesis/actions/workflows/ci.yml)
[![GitHub
Pages](https://github.com/eyadstein/polis-genesis/actions/workflows/pages.yml/badge.svg)](https://github.com/eyadstein/polis-genesis/actions/workflows/pages.yml)
[![MIT
License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PyPI](https://img.shields.io/pypi/v/polis-genesis.svg)](https://pypi.org/project/polis-genesis/)

**[🌐 Open the live simulation
→](https://eyadstein.github.io/polis-genesis/)**

------------------------------------------------------------------------

## Overview

**Polis Genesis** is a real-time, 3D town simulation built around
autonomous agents. Each resident has its own genome, needs, moods,
memories, relationships, and a neural-network-driven mind.

Residents make decisions, work, interact, form families, and participate
in an evolving virtual society. Rather than relying entirely on scripted
events, the simulation brings together individual behavior and
interconnected systems to explore how a virtual society develops.

Try the hosted viewer without installing anything:

**[Enter Polis Genesis](https://eyadstein.github.io/polis-genesis/)**

## Features

-   **Autonomous agents** --- neural-network-driven behavior that learns
    from experience.
-   **Needs and daily life** --- food, water, sleep, work, social
    interaction, and other needs shape decisions.
-   **Economy** --- jobs, salaries, housing, taxes, and a shared town
    treasury.
-   **Families and genealogy** --- relationships, children, genetic
    inheritance, and mutation.
-   **Law and order** --- crime, police, courts, fines, and prisons.
-   **Dynamic environment** --- day/night transitions, seasonal
    lighting, waterways, fountains, and ambient sound.
-   **Interactive 3D viewer** --- a browser-based world built with
    Three.js and Vite.
-   **Python CLI** --- console, server, and web commands for interacting
    with the simulation.
-   **Snapshots and analytics** --- JSON exports, statistical reports,
    and replay functionality.

## Getting Started

### Try it online

Open the live demo:

**https://eyadstein.github.io/polis-genesis/**

### Install the Python package

``` bash
pip install polis-genesis
```

### Run the simulation

Start the console interface:

``` bash
polis-genesis console
```

Start the local server:

``` bash
polis-genesis serve
```

Open the local viewer address printed by the server. Depending on the
configuration, it may be available at
`http://localhost:8787/world.html`.

Launch web mode:

``` bash
polis-genesis web
```

## Build from Source

### Prerequisites

-   Rust and Cargo
-   Node.js and npm
-   Python for Python tooling

### Run the simulation

From the repository root:

``` bash
cargo run --release -p polis_cli -- 1 3000 200
```

### Start the 3D viewer

``` bash
cd viewer
npm ci
npm run dev
```

Vite prints the local development URL in the terminal.

### Build the production viewer

From the `viewer` directory:

``` bash
npm run build
```

The generated static site is written to `viewer/dist`. GitHub Actions
builds and deploys the viewer to GitHub Pages.

## Technology Stack

  Component                Technology
  ------------------------ ----------------
  Simulation engine        Rust
  3D rendering             Three.js
  Front-end tooling        Vite
  Python interface         Python
  Continuous integration   GitHub Actions
  Demo hosting             GitHub Pages

## Roadmap

-   [x] Core engine, genomes, needs, moods, and movement
-   [x] Economy, jobs, and housing
-   [x] Relationships, children, and inheritance
-   [x] Memory and social interaction
-   [x] Law enforcement and justice systems
-   [ ] Schools, belief systems, culture, and sports
-   [ ] Expanded survival mechanics and emergent epochs
-   [ ] Enhanced observation, replay, and analytics

## Documentation

-   [Design overview](docs/DESIGN.md)
-   [Contributing guidelines](CONTRIBUTING.md)
-   [Changelog](CHANGELOG.md)
-   [License](LICENSE)

## Contributing

Contributions, bug reports, and ideas are welcome.

1.  Fork the repository.
2.  Create a branch for your changes.
3.  Implement your changes and add tests where appropriate.
4.  Run the relevant checks.
5.  Submit a pull request describing your changes.

Run the Rust checks:

``` bash
cargo test --workspace --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
```

For viewer changes:

``` bash
cd viewer
npm ci
npm test
npm run build
```

## License

Distributed under the [MIT License](LICENSE).

------------------------------------------------------------------------

**Explore the world. Observe the agents. Watch the town evolve.**

**[ENTER POLIS GENESIS →](https://eyadstein.github.io/polis-genesis/)**
