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

## Families

Any two adults who are not close kin (parent and child, or siblings) and are within 6000 ticks of each other in age can pair. Singles who socialize within three cells of each other grow closer each tick in proportion to how compatible they are (alike in nature and warm). People who do not suit each other never grow close. A pair shares the bigger of their two homes.

A couple with room, savings, and time since the last birth sometimes has a child. The child's genome mixes both parents' genes with a small chance of mutation, so families resemble each other but nobody is a copy. Each person records parents and a generation number. Children cannot work. The adult in charge of the household feeds them, and they become adults at 4000 ticks. Grown singles leave when they can afford their own home.

The head of a household pays the rent for everyone in it. When someone dies, money goes to the partner, else to the children, else to the realty office, and the home passes to the partner or the eldest resident. Money stays conserved through births, deaths, and inheritance.

Known limits: people have no sex, gender, or orientation yet, so a couple stands for any bond and a birth also stands for adoption. Orphans inherit and carry on as small households. There is still no extra work for a growing town, so inequality and homelessness keep rising.

## Memory and conversation

Every person keeps up to 24 memories and up to 12 relationships. A memory has an event, a person it is about, a feeling from painful to joyful, and a strength that fades each tick. Life changing events (falling in love, losing a partner, a birth, losing a home) fade four times slower. Anxious people hold on to bad memories and warm people to good ones. A repeat of the same event about the same person refreshes the old memory instead of adding a new one. Strong memories color mood.

People who choose to socialize and stand next to each other talk. The speaker chooses an act from temperament and from how they feel about the listener: small talk, gossip, confiding, or quarrelling. Small talk builds friendship in proportion to compatibility. Gossip passes a memory about a third person to the listener, with a spin from the speaker's nature, and the listener's opinion of that third person moves in proportion to how much they trust the speaker. Friends pair up faster. The core only records what happened. It never calls a language model, so it stays fast and exactly repeatable.

## Words

The polis_mind crate turns what happened into speech. The default voice is rule based, free, and repeatable. With the ollama feature, a local model served by Ollama writes the lines instead, and the rule based voice answers whenever the server is missing, slow, or says anything that names the outside. The inner voice given to a model is first person: who you are, what you own, how you feel, what you remember. A filter checks every prompt and every reply, and tests check that no prompt in a grown town mentions anything from outside the world.

Known limits: the Ollama path is tested against a stand in server, not a real model. Speech is not fed back into memory, and people do not yet act on what they hear beyond feeling about each other.

## Law and order

Crime has causes. A hungry person who cannot afford food may steal, from a richer person standing next to them if there is one, otherwise from the shop. Bold and careless people are likelier, careful ones less so. A bitter quarrel between people who already dislike each other can turn into an assault, which is a counted event with a consequence and never a graphic scene. Police on the street lower the odds, up to one half.

Every crime is reported. Officers work open cases oldest first, and a case that stays unsolved for five attempts goes cold. A solved case goes on the docket. Lawyers take up the defence of cases one at a time, and judges hear them in order. Evidence raises the chance of conviction and a defence lowers it. A fine is three times the loss plus ten, never more than the person has, and goes first to the victim as restitution. People who cannot pay are jailed for longer, and repeat offenders for longer still. Prisoners cannot work, roam, or marry, and the town feeds them. A record counts against a person when employers hire.

The town treasury is funded by a wealth tax (one twentieth of savings above 150 coins each rent period) and by fines. It pays officers, judges, lawyers, and prison meals. Surplus above twice the reserve is shared out as a dividend. Money stays conserved.

Known limits: the police always charge the true offender, so wrongful convictions are not modeled. Acquittals therefore free guilty people, which is why only about a third of cases end in conviction. There is no murder, no organized crime, and no parole. Public jobs open and close with the caseload, so staffing is uneven.

## Languages

Rust holds everything that must be fast and exactly repeatable. Python reads the JSON export for analysis. A TypeScript viewer, a Go server for a shared online world, WGSL shaders for large crowds, and SQL storage are planned, each only where it is the best fit.

## Free stack

Rust, SQLite, local models through open runtimes, GitHub Actions. No paid service is required.