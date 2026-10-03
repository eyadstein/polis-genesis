//! A person. Every field is that person's own state; the choice of what to
//! do next is made from that state and what they can perceive.

use crate::genome::{Gene, Genome};
use crate::mood::Mood;
use crate::needs::{urgency, Need, Needs};
use crate::rng::Rng;

pub type AgentId = u32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Eat,
    Rest,
    Socialize,
    Work,
    Wander,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Death {
    Starvation,
    OldAge,
}

/// What a person can sense right now, in the first person.
#[derive(Clone, Copy, Debug, Default)]
pub struct Percept {
    pub people_nearby: u32,
    pub food_underfoot: bool,
}

#[derive(Clone, Debug)]
pub struct Agent {
    pub id: AgentId,
    pub name: String,
    pub genome: Genome,
    pub needs: Needs,
    pub mood: Mood,
    pub pos: (i32, i32),
    pub age: u32,
    pub action: Action,
    pub starving_for: u32,
    pub death: Option<Death>,
}

impl Agent {
    pub fn new(id: AgentId, name: String, genome: Genome, pos: (i32, i32)) -> Self {
        Self {
            id,
            name,
            genome,
            needs: Needs::new(),
            mood: Mood::new(),
            pos,
            age: 0,
            action: Action::Wander,
            starving_for: 0,
            death: None,
        }
    }

    pub fn is_alive(&self) -> bool {
        self.death.is_none()
    }

    /// Ticks this person can live, set by their genes.
    pub fn lifespan(&self) -> u32 {
        (20_000.0 + 20_000.0 * self.genome.get(Gene::Longevity)) as u32
    }

    /// Pick the action that feels most worthwhile right now.
    pub fn choose_action(&self, percept: &Percept, rng: &mut Rng) -> Action {
        let g = &self.genome;
        let food_pull = if percept.food_underfoot { 1.0 } else { 0.6 };
        let company_pull = if percept.people_nearby > 0 { 1.0 } else { 0.5 };
        let options = [
            (
                Action::Eat,
                urgency(self.needs.get(Need::Hunger)) * food_pull,
            ),
            (Action::Rest, urgency(self.needs.get(Need::Energy))),
            (
                Action::Socialize,
                urgency(self.needs.get(Need::Social))
                    * (0.5 + 0.5 * g.get(Gene::Extraversion))
                    * company_pull,
            ),
            (
                Action::Work,
                urgency(self.needs.get(Need::Purpose))
                    * (0.5 + 0.5 * g.get(Gene::Conscientiousness)),
            ),
            (Action::Wander, 0.1 + 0.2 * g.get(Gene::Openness)),
        ];
        let mut best = (Action::Wander, f32::MIN);
        for (action, score) in options {
            let noisy = score + rng.gaussian() * 0.03;
            if noisy > best.1 {
                best = (action, noisy);
            }
        }
        best.0
    }
}
