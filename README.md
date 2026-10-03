# Polis Genesis

A living world of autonomous people. Nobody scripts what they do. Each person is born from a genome, feels needs and moods, remembers, and chooses for themselves. The world runs in three ages.

## Modes

1. Polis: a modern town with jobs, money, love, schools, police, courts, prison, faith, and sports.
2. Brutal Genesis: a harsh world of scarcity, predators, and disasters where species evolve under pressure.
3. Epoch: civilization from scratch, where laws, money, religions, and countries emerge over centuries.

Countries never go to war by themselves. Group conflict exists only as an optional scenario switch that is off by default.

## Principles

* Deterministic: the same seed gives the same world on every machine.
* Unique people: every person has a unique genome and name. Children mix both parents and mutate.
* First person minds: a person only perceives what they can see, hear, feel, and remember.
* Free tools only: Rust, SQLite, local models, GitHub Actions.
* Honest wording: emotions here are modeled states that drive behavior. They are not consciousness.

## Run

    cargo run --release -p polis_cli -- 1 3000 200

Arguments are seed, ticks, and population.

## Test

    cargo test --all
    cargo clippy --all-targets -- -D warnings

## Roadmap

1. Core engine, genome, needs, mood, movement (done)
2. Economy, jobs, housing
3. Relationships, family, life cycle, inheritance
4. Memory, gossip, language model conversation layer
5. Law, police, courts, prison
6. Schools, belief systems, culture, sports
7. Genesis survival layer and Epoch emergence
8. Observer interface, replay, analytics

See docs/DESIGN.md for architecture decisions.