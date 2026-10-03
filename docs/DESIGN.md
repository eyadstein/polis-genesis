# Design notes

## Two layer minds

Thousands of people cannot all call a language model every tick. Every person has a fast mind (needs, mood, utility based choice) that runs always. People near the observer or in important moments are promoted to a deep mind backed by a language model. Their memory summary travels with them when they are demoted, so they stay consistent.

## The world is real to them

A mind never receives the words game, simulation, or player. It receives first person perception only: what is around, what the body feels, what is remembered. Language model prompts are written as a person's inner voice, and outputs are checked for any leak of outside knowledge.

## Determinism

All randomness comes from one seeded generator. Iteration order is fixed. A state hash is checked in tests so any change that breaks reproducibility is caught.

## Uniqueness

Genomes are 15 genes in the range 0 to 1. Names are generated from syllables and never repeat inside a world. Backstories will be generated from genome plus early life events.

## Economy

Money is whole coins and is conserved. A test checks that the total never changes, so any bug that prints or deletes money is caught.

Pay differs by job. Each job has its own base wage. A worker earns 70 to 110 percent of it by talent (how well their genes suit the job) plus up to 40 percent more with experience. An employer that holds more cash pays up to 30 percent more, and a struggling one pays up to 40 percent less. Farmers are paid per unit of food at the market's wholesale price, so their pay follows the market. Employers only pay what they hold, so no money appears from nowhere.

Jobs do real work. Farmers stock the market. Shopkeepers set how many meals the shop can serve each tick. Builders finish homes on projects placed where demand is strongest, with finer homes in wealthier districts. Mechanics repair the most worn home first.

## Housing

The map is cut into 16 districts. Every home has a district, a kind (shack, flat, house, villa), a room count within that kind's range, and a condition that wears down faster when lived in. Rent is room count times kind multiplier times condition, then scaled by the district's appeal and its demand pressure. Appeal comes from distance to the market, how wealthy the residents are, the average condition of homes, and how crowded the district is. Pressure rises when a district is nearly full and falls when it empties, within fixed bounds.

People choose a vacant home by taste and budget. Outgoing people like busy districts, anxious people like quiet ones, open minded people like space. They need savings for three rent periods. The housing market moves every 10 ticks and rents are reset every 100.

## Known limits

Job openings cover only about half the town. Over thousands of ticks this produces a permanent jobless group with almost no savings, who cannot afford any home, while many homes stand empty. In a 200 person run the Gini reaches about 0.86 and about 130 people are homeless by tick 8000. Rents fall as the empty homes pile up. More kinds of work, families, schools, and public services in later phases will change this balance. Taste for homes uses simple placeholder genes until families bring real space needs. Neighbors affect rent through their wealth, but people do not yet socialize with neighbors or move around their own district.

## Free stack

Rust, SQLite, local models through open runtimes, GitHub Actions. No paid service is required.