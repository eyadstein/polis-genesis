//! Basic needs. A value of 1.0 means fully satisfied, 0.0 means desperate.

use crate::genome::{Gene, Genome};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Need {
    Hunger,
    Energy,
    Social,
    Purpose,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Needs {
    pub hunger: f32,
    pub energy: f32,
    pub social: f32,
    pub purpose: f32,
}

impl Needs {
    pub fn new() -> Self {
        Self {
            hunger: 0.9,
            energy: 0.9,
            social: 0.8,
            purpose: 0.8,
        }
    }

    pub fn get(&self, need: Need) -> f32 {
        match need {
            Need::Hunger => self.hunger,
            Need::Energy => self.energy,
            Need::Social => self.social,
            Need::Purpose => self.purpose,
        }
    }

    pub fn add(&mut self, need: Need, amount: f32) {
        let slot = match need {
            Need::Hunger => &mut self.hunger,
            Need::Energy => &mut self.energy,
            Need::Social => &mut self.social,
            Need::Purpose => &mut self.purpose,
        };
        *slot = (*slot + amount).clamp(0.0, 1.0);
    }

    /// Needs fade at rates shaped by the genome: a fast metabolism gets
    /// hungry sooner, an outgoing person needs company sooner.
    pub fn decay(&mut self, genome: &Genome) {
        let metabolism = genome.get(Gene::Metabolism);
        let extraversion = genome.get(Gene::Extraversion);
        let conscientiousness = genome.get(Gene::Conscientiousness);
        self.add(Need::Hunger, -0.004 * (0.6 + 0.8 * metabolism));
        self.add(Need::Energy, -0.003);
        self.add(Need::Social, -0.002 * (0.4 + 1.2 * extraversion));
        self.add(Need::Purpose, -0.0015 * (0.4 + 1.2 * conscientiousness));
    }

    pub fn average(&self) -> f32 {
        (self.hunger + self.energy + self.social + self.purpose) / 4.0
    }

    pub fn lowest(&self) -> f32 {
        self.hunger
            .min(self.energy)
            .min(self.social)
            .min(self.purpose)
    }
}

impl Default for Needs {
    fn default() -> Self {
        Self::new()
    }
}

/// How pressing a need feels. Grows sharply as the need empties.
pub fn urgency(level: f32) -> f32 {
    let gap = 1.0 - level.clamp(0.0, 1.0);
    gap * gap
}
