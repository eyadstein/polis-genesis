# Polis Genesis

A living world of autonomous people. Nobody scripts what they do. Each person is born from a genome, feels needs and moods, remembers, and chooses for themselves. The world runs in three ages.

## Modes

1. Polis: a modern town with jobs, money, love, schools, police, courts, prison, faith, and sports.
2. Brutal Genesis: a harsh world of scarcity, predators, and disasters where species evolve under pressure.
3. Epoch: civilization from scratch, where laws, money, religions, and countries emerge over centuries.

Countries never go to war by themselves. Group conflict exists only as an optional scenario switch that is off by default.

## What exists so far

* Genomes, needs, moods, unique names, and a food commons
* A conserved money supply: coins only move between people, the food market, and the realty office
* Four jobs matched to genes (farmer, builder, mechanic, shopkeeper), each with its own pay, raised by talent and experience, and paid only from what the employer holds
* Homes that differ by district, kind (shack, flat, house, villa), size, and condition, with rent that follows appeal, nearby services, neighbor wealth, and demand
* Builders who build where demand is strongest, mechanics who repair worn homes, shopkeepers whose number limits how many meals the shop can serve
* People who choose homes by taste and budget
* A food market whose price follows scarcity, and a town dividend that keeps coins circulating
* Couples that form between compatible adults, children who inherit a mix of both genomes with mutation, growing up, households that share a home, inheritance of money and of the home
* Memories that fade, feelings about other people, conversations that spread gossip, and speech from a free local model (Ollama) with a rule based voice as the default
* Crime from hunger, poverty and temper, police who solve cases, courts with judges and defence lawyers, fines with restitution, prison, criminal records, and a town treasury funded by a wealth tax
* A JSON export of the whole town and a Python tool that reports on it
* Inequality (Gini), housing, wage, and district reports

## Principles

* Deterministic: the same seed gives the same world on every machine.
* Unique people: every person has a unique genome and name. Children mix both parents and mutate.
* First person minds: a person only perceives what they can see, hear, feel, and remember.
* Free tools only: Rust, SQLite, local models, GitHub Actions.
* Honest wording: emotions here are modeled states that drive behavior. They are not consciousness.

## Run

    cargo run --release -p polis_cli -- 1 3000 200

Arguments are seed, ticks, and population.

To let a local language model speak for the town, install Ollama (free), pull a model, and run:

    $env:POLIS_OLLAMA_MODEL = "llama3.2"
    cargo run --release -p polis_cli --features ollama -- 1 3000 200

## Export and analyze

Add a file name as a fourth argument to write the whole town as JSON, then read it with the Python tool (standard library only):

    cargo run --release -p polis_cli -- 1 8000 200 town.json
    python tools/analyze.py town.json

## Test

    cargo test --all
    cargo clippy --all-targets -- -D warnings

## Roadmap

1. Core engine, genome, needs, mood, movement (done)
2. Economy, jobs, housing (done)
2.5. Skill based pay, districts, home kinds and sizes, neighbors (done)
3. Couples, children, life stages, inheritance (done)
4. Memory, gossip, and a language model conversation layer (done)
5. Law, police, courts, prison (done)
6. Schools, belief systems, culture, sports
7. Genesis survival layer and Epoch emergence
8. Observer interface, replay, analytics

See docs/DESIGN.md for architecture decisions.

## Viewer

A browser viewer written in TypeScript reads the town file. You need Node.js (free, from nodejs.org).

    cargo run --release -p polis_cli -- 1 8000 200 viewer/public/town.json
    cd viewer
    npm install
    npm run dev

Open the address it prints. The viewer shows a map of the town, a searchable list of people with their life stories and families, charts over time, and the recent conversations. Run its tests with `npm test`.
