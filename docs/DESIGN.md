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

Money is whole coins and is conserved. A test checks that the total never changes, so any bug that prints or deletes money is caught. The market pays farmers only what it can afford and only while its shelves have room. The realty office pays builders only during a housing shortage. Cash above a reserve in either fund is shared out equally as a town dividend. Unemployment and homelessness are emergent results, not scripted events.

Known limits: job openings cover only about half the town (farmer 30 percent, builder 8 percent, clerk 10 percent). Over thousands of ticks this produces permanent unemployment, falling housing, and rising inequality (Gini near 0.78 and about half the town homeless in a 200 person run). The clerk job has no function beyond a wage. Later phases add more kinds of work, families, and schools, which will change this balance.

## Free stack

Rust, SQLite, local models through open runtimes, GitHub Actions. No paid service is required.