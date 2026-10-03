//! The world: a grid with food, and the people living on it.

use crate::agent::{Action, Agent, Death, Percept};
use crate::genome::Genome;
use crate::names::NameBook;
use crate::needs::Need;
use crate::rng::Rng;
use std::collections::BTreeMap;

#[derive(Clone, Debug)]
pub struct WorldConfig {
    pub seed: u64,
    pub width: i32,
    pub height: i32,
    pub population: u32,
}

impl Default for WorldConfig {
    fn default() -> Self {
        Self {
            seed: 1,
            width: 64,
            height: 64,
            population: 200,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Stats {
    pub tick: u64,
    pub alive: usize,
    pub starved: usize,
    pub died_old: usize,
    pub mean_valence: f32,
    pub mean_hunger: f32,
}

pub struct World {
    pub tick: u64,
    pub width: i32,
    pub height: i32,
    pub agents: Vec<Agent>,
    food: Vec<f32>,
    rng: Rng,
}

const FOOD_REGROWTH: f32 = 0.002;
const SEARCH_RADIUS: i32 = 6;
const STARVATION_LIMIT: u32 = 30;

impl World {
    pub fn new(config: WorldConfig) -> Self {
        let mut rng = Rng::new(config.seed);
        let cells = (config.width * config.height) as usize;
        let food = (0..cells).map(|_| rng.next_f32()).collect();
        let mut names = NameBook::new();
        let mut agents = Vec::with_capacity(config.population as usize);
        for id in 0..config.population {
            let genome = Genome::random(&mut rng);
            let name = names.fresh(&mut rng);
            let pos = (
                rng.below(config.width as u32) as i32,
                rng.below(config.height as u32) as i32,
            );
            agents.push(Agent::new(id, name, genome, pos));
        }
        Self {
            tick: 0,
            width: config.width,
            height: config.height,
            agents,
            food,
            rng,
        }
    }

    fn cell(&self, pos: (i32, i32)) -> usize {
        (pos.1 * self.width + pos.0) as usize
    }

    fn wrap(&self, pos: (i32, i32)) -> (i32, i32) {
        (pos.0.rem_euclid(self.width), pos.1.rem_euclid(self.height))
    }

    fn random_step(&mut self, pos: (i32, i32)) -> (i32, i32) {
        let dx = self.rng.below(3) as i32 - 1;
        let dy = self.rng.below(3) as i32 - 1;
        self.wrap((pos.0 + dx, pos.1 + dy))
    }

    /// Step one cell toward the richest nearby food, or wander if none.
    fn step_toward_food(&mut self, pos: (i32, i32)) -> (i32, i32) {
        let mut best: Option<((i32, i32), f32)> = None;
        for dy in -SEARCH_RADIUS..=SEARCH_RADIUS {
            for dx in -SEARCH_RADIUS..=SEARCH_RADIUS {
                let target = self.wrap((pos.0 + dx, pos.1 + dy));
                let amount = self.food[self.cell(target)];
                let distance = (dx.abs() + dy.abs()) as f32 + 1.0;
                let score = amount / distance;
                if amount > 0.1 && best.is_none_or_worse(score) {
                    best = Some(((dx, dy), score));
                }
            }
        }
        match best {
            Some(((dx, dy), _)) => self.wrap((pos.0 + dx.signum(), pos.1 + dy.signum())),
            None => self.random_step(pos),
        }
    }

    fn crowd_map(&self) -> BTreeMap<(i32, i32), u32> {
        let mut crowd = BTreeMap::new();
        for agent in self.agents.iter().filter(|a| a.is_alive()) {
            *crowd.entry(agent.pos).or_insert(0) += 1;
        }
        crowd
    }

    /// Advance the world by one tick.
    pub fn step(&mut self) {
        for amount in self.food.iter_mut() {
            *amount = (*amount + FOOD_REGROWTH).min(1.0);
        }
        let crowd = self.crowd_map();
        let mut agents = std::mem::take(&mut self.agents);
        for agent in agents.iter_mut().filter(|a| a.is_alive()) {
            self.live_one_tick(agent, &crowd);
        }
        self.agents = agents;
        self.tick += 1;
    }

    pub fn run(&mut self, ticks: u64) {
        for _ in 0..ticks {
            self.step();
        }
    }

    fn live_one_tick(&mut self, agent: &mut Agent, crowd: &BTreeMap<(i32, i32), u32>) {
        agent.needs.decay(&agent.genome);
        agent.mood.update(&agent.needs, &agent.genome);

        let percept = Percept {
            people_nearby: crowd
                .get(&agent.pos)
                .copied()
                .unwrap_or(1)
                .saturating_sub(1),
            food_underfoot: self.food[self.cell(agent.pos)] > 0.1,
        };
        agent.action = agent.choose_action(&percept, &mut self.rng);

        match agent.action {
            Action::Eat => {
                let index = self.cell(agent.pos);
                if self.food[index] > 0.1 {
                    let bite = self.food[index].min(0.3);
                    self.food[index] -= bite;
                    agent.needs.add(Need::Hunger, bite * 1.5);
                } else {
                    agent.pos = self.step_toward_food(agent.pos);
                }
            }
            Action::Rest => agent.needs.add(Need::Energy, 0.05),
            Action::Socialize => {
                if percept.people_nearby > 0 {
                    agent.needs.add(Need::Social, 0.04);
                } else {
                    agent.pos = self.random_step(agent.pos);
                }
            }
            Action::Work => {
                agent.needs.add(Need::Purpose, 0.03);
                agent.needs.add(Need::Energy, -0.01);
            }
            Action::Wander => agent.pos = self.random_step(agent.pos),
        }

        agent.age += 1;
        if agent.needs.hunger <= 0.02 {
            agent.starving_for += 1;
        } else {
            agent.starving_for = 0;
        }
        if agent.starving_for > STARVATION_LIMIT {
            agent.death = Some(Death::Starvation);
        } else if agent.age > agent.lifespan() {
            agent.death = Some(Death::OldAge);
        }
    }

    pub fn stats(&self) -> Stats {
        let alive: Vec<&Agent> = self.agents.iter().filter(|a| a.is_alive()).collect();
        let count = alive.len().max(1) as f32;
        Stats {
            tick: self.tick,
            alive: alive.len(),
            starved: self
                .agents
                .iter()
                .filter(|a| a.death == Some(Death::Starvation))
                .count(),
            died_old: self
                .agents
                .iter()
                .filter(|a| a.death == Some(Death::OldAge))
                .count(),
            mean_valence: alive.iter().map(|a| a.mood.valence).sum::<f32>() / count,
            mean_hunger: alive.iter().map(|a| a.needs.hunger).sum::<f32>() / count,
        }
    }

    /// A fingerprint of the whole world, used to prove determinism.
    pub fn state_hash(&self) -> u64 {
        let mut hash: u64 = 0xCBF2_9CE4_8422_2325;
        let mut mix = |value: u64| {
            hash ^= value;
            hash = hash.wrapping_mul(0x0000_0100_0000_01B3);
        };
        mix(self.tick);
        for agent in &self.agents {
            mix(u64::from(agent.id));
            mix(agent.pos.0 as u64);
            mix(agent.pos.1 as u64);
            mix(u64::from(agent.age));
            mix(agent.needs.hunger.to_bits() as u64);
            mix(agent.mood.valence.to_bits() as u64);
        }
        hash
    }
}

trait BestSoFar {
    fn is_none_or_worse(&self, score: f32) -> bool;
}

impl BestSoFar for Option<((i32, i32), f32)> {
    fn is_none_or_worse(&self, score: f32) -> bool {
        match self {
            None => true,
            Some((_, best)) => score > *best,
        }
    }
}

#[cfg(test)]
mod tests;
