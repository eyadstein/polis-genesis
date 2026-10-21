# Polis Genesis

[![CI](https://github.com/eyadstein/polis-genesis/actions/workflows/ci.yml/badge.svg)](https://github.com/eyadstein/polis-genesis/actions/workflows/ci.yml)
[![Pages](https://github.com/eyadstein/polis-genesis/actions/workflows/deploy.yml/badge.svg)](https://github.com/eyadstein/polis-genesis/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PyPI](https://img.shields.io/pypi/v/polis-genesis.svg)](https://pypi.org/project/polis-genesis/)

---

## A living autonomous town simulation

Polis Genesis is a **real‑time 3‑D simulation** of a thriving town where every resident is an autonomous agent with its own genome, neural‑network‑driven mind, needs, moods, families, and economic activities. No script dictates their daily life – they **learn**, **interact**, and **evolve**.

<p align="center">
  <img src="https://raw.githubusercontent.com/eyadstein/polis-genesis/main/docs/screenshot.png" alt="Polis Genesis screenshot" width="720"/>
</p>

---

## ✨ Key Features

- **Neural‑network mind** with hidden layer, learning online from experiences.
- **Needs system** (food, water, sleep, work, social, drink) driving daily decisions.
- **Economy**: jobs, salaries, housing market, taxes, and a town treasury.
- **Families & genealogy** – children inherit genomes with mutation.
- **Law & order**: crime, police, courts, fines, and prisons.
- **Dynamic environment**: day/night cycle, seasonal lighting, river, lake, fountains, and ambient soundscape.
- **3‑D viewer** built with Vite + Three.js, fully responsive, with HUD controls.
- **Python wrapper** exposing `polis‑genesis` CLI (`serve`, `web`, `console`).
- **Export & analytics**: JSON snapshots, statistical reports, and replay mode.

---

## 🚀 Getting Started

### Install the Python package
```bash
pip install polis-genesis
```

### Run the simulation
- **Console mode** (ASCII telemetry)
  ```bash
polis-genesis console
```
- **Local server** (full 3‑D visualiser)
  ```bash
polis-genesis serve
# then open http://localhost:8787/world.html (or http://localhost:5173/world.html)
```
- **Web mode** (GitHub Pages deployment)
  ```bash
polis-genesis web
```

### Build from source (Rust & Node)
```bash
# Backend (Rust)
cargo run --release -p polis_cli -- 1 3000 200

# Front‑end (viewer)
cd viewer
npm ci
npm run dev   # development server on http://localhost:5173
npm run build # static site for GitHub Pages
```

---

## 📚 Documentation & Guides
- **Design overview** – `docs/DESIGN.md`
- **API reference** – generated from the Python package.
- **Contributing** – see [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Roadmap** – see the **Roadmap** section below.

---

## 🛣️ Roadmap (current version: 0.2.0)
1. Core engine, genome, needs, mood, movement (done)
2. Economy, jobs, housing (done)
3. Couples, children, inheritance (done)
4. Memory, gossip, language‑model conversation layer (done)
5. Law, police, courts, prison (done)
6. Schools, belief systems, culture, sports (planned)
7. Genesis survival layer and Epoch emergence (planned)
8. Observer interface, replay, analytics (planned)

---

## 🤝 Contributing
We welcome contributions! Fork the repo, create a feature branch, and open a PR. For a quick start:
- Pick a **good first issue**.
- Follow the [contributing guidelines](CONTRIBUTING.md).
- Run the full test suite before submitting:
  ```bash
cargo test --all && cargo clippy --all-targets -- -D warnings
cd viewer && npm test && npm run build
```

---

## 📄 License
[MIT License](LICENSE)

---

## 📌 Keywords
`simulation` `multi-agent` `artificial-life` `society` `neural-network` `generative-agents` `threejs` `rust` `python` `polis-genesis` `town` `economy` `autonomous`
