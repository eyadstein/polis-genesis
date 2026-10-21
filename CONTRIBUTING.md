# Contributing to Polis Genesis

Thank you for helping. Small, focused changes are the easiest to review.

## Set up

1. Fork and clone the repo.
2. Install Rust (stable) and Node 22.
3. In `viewer`, run `npm install`.
4. Start everything with `./run.ps1` on Windows, or run `cargo run --release -p polis_cli -- serve 1 200 8787` and `npm run dev` in `viewer`.

## Before you open a pull request

Run all of these. CI runs them too.

    cargo fmt --all -- --check
    cargo clippy --all-targets --all-features -- -D warnings
    cargo test --all --all-features
    cd viewer && npm run typecheck && npm test

## Rules of the world

* Deterministic: the same seed must give the same world. Use the world's own random generator, never the clock.
* Nobody scripts behavior. A habit (for example greeting back) must be learned from what happens, not coded as an if.
* Coins are conserved. Money only moves between people, the market and the realty office.
* Every change needs a test. A new need or action needs a check that the town stays healthy.

## Where things live

* `crates/polis_core`: people, needs, brains, economy, housing, justice
* `crates/polis_mind`: speech
* `crates/polis_cli`: runner, live server, export
* `viewer`: the 3D page and the charts

## Issues

Look for the labels **good first issue** and **help wanted**. Comment on an issue before you start so nobody does the same work twice. Use the templates for bugs and ideas.
