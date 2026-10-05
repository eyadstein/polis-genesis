//! What a person remembers and how they feel about the people they know.
//!
//! Memories fade, big life events fade slowest, and temperament shapes what
//! sticks: anxious people hold on to bad memories, warm people to good ones.

use crate::agent::AgentId;
use crate::genome::{Gene, Genome};

pub const MEMORY_LIMIT: usize = 24;
pub const RELATION_LIMIT: usize = 12;
pub const FRIEND_AFFINITY: f32 = 0.3;

const FORGET_BELOW: f32 = 0.05;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    Chatted,
    Argued,
    Confided,
    Gossiped,
    Paired,
    Bereaved,
    Birth,
    Evicted,
    Wronged,
    Jailed,
}

impl Event {
    /// Life changing events fade four times slower.
    fn fade_scale(self) -> f32 {
        match self {
            Event::Paired
            | Event::Bereaved
            | Event::Birth
            | Event::Evicted
            | Event::Wronged
            | Event::Jailed => 0.25,
            _ => 1.0,
        }
    }

    /// Whether this event is worth passing on as gossip about someone.
    fn is_gossip_worthy(self) -> bool {
        !matches!(self, Event::Bereaved | Event::Evicted | Event::Jailed)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Memory {
    pub tick: u64,
    pub event: Event,
    pub about: Option<AgentId>,
    /// -1 is painful, 1 is joyful.
    pub valence: f32,
    /// 1 is vivid, near 0 is about to be forgotten.
    pub strength: f32,
}

impl Memory {
    pub fn new(
        tick: u64,
        event: Event,
        about: Option<AgentId>,
        valence: f32,
        strength: f32,
    ) -> Self {
        Self {
            tick,
            event,
            about,
            valence: valence.clamp(-1.0, 1.0),
            strength: strength.clamp(0.0, 1.0),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Relation {
    pub other: AgentId,
    /// -1 is hostile, 1 is devoted.
    pub affinity: f32,
    pub last_met: u64,
}

#[derive(Clone, Debug, Default)]
pub struct Mind {
    pub memories: Vec<Memory>,
    pub relations: Vec<Relation>,
}

impl Mind {
    /// Store a memory. A repeat of the same event about the same person
    /// refreshes the old memory instead of adding a new one.
    pub fn remember(&mut self, new: Memory) {
        if let Some(old) = self
            .memories
            .iter_mut()
            .find(|m| m.event == new.event && m.about == new.about)
        {
            old.valence = 0.5 * (old.valence + new.valence);
            old.strength = (old.strength.max(new.strength) + 0.1).min(1.0);
            old.tick = new.tick;
            return;
        }
        self.memories.push(new);
        if self.memories.len() > MEMORY_LIMIT {
            let weakest = self
                .memories
                .iter()
                .enumerate()
                .min_by(|a, b| a.1.strength.total_cmp(&b.1.strength))
                .map(|(index, _)| index)
                .unwrap_or(0);
            self.memories.remove(weakest);
        }
    }

    /// One tick of forgetting.
    pub fn fade(&mut self, genome: &Genome) {
        for memory in &mut self.memories {
            let sticky = if memory.valence < 0.0 {
                genome.get(Gene::Neuroticism)
            } else {
                genome.get(Gene::Empathy)
            };
            let rate = 0.001 * (1.2 - 0.8 * sticky) * memory.event.fade_scale();
            memory.strength *= 1.0 - rate;
        }
        self.memories.retain(|m| m.strength >= FORGET_BELOW);
    }

    pub fn affinity_for(&self, other: AgentId) -> f32 {
        self.relations
            .iter()
            .find(|r| r.other == other)
            .map_or(0.0, |r| r.affinity)
    }

    pub fn adjust_affinity(&mut self, other: AgentId, delta: f32, tick: u64) {
        if let Some(relation) = self.relations.iter_mut().find(|r| r.other == other) {
            relation.affinity = (relation.affinity + delta).clamp(-1.0, 1.0);
            relation.last_met = tick;
            return;
        }
        self.relations.push(Relation {
            other,
            affinity: delta.clamp(-1.0, 1.0),
            last_met: tick,
        });
        if self.relations.len() > RELATION_LIMIT {
            let faintest = self
                .relations
                .iter()
                .enumerate()
                .min_by(|a, b| {
                    a.1.affinity
                        .abs()
                        .total_cmp(&b.1.affinity.abs())
                        .then(a.1.last_met.cmp(&b.1.last_met))
                })
                .map(|(index, _)| index)
                .unwrap_or(0);
            self.relations.remove(faintest);
        }
    }

    pub fn friends(&self) -> usize {
        self.relations
            .iter()
            .filter(|r| r.affinity > FRIEND_AFFINITY)
            .count()
    }

    /// How memories color the present mood, from -1 to 1.
    pub fn afterglow(&self) -> f32 {
        let total: f32 = self.memories.iter().map(|m| m.valence * m.strength).sum();
        (total / 4.0).clamp(-1.0, 1.0)
    }

    /// The most vivid memory about someone other than me and the person I am
    /// talking to, which is what people gossip about.
    pub fn vivid_about_others(&self, me: AgentId, listener: AgentId) -> Option<Memory> {
        self.memories
            .iter()
            .filter(|m| m.event.is_gossip_worthy())
            .filter(|m| m.about.is_some_and(|x| x != me && x != listener))
            .max_by(|a, b| a.strength.total_cmp(&b.strength))
            .cloned()
    }

    /// The strongest feeling toward a person, drawn from memories about them.
    pub fn feeling_about(&self, other: AgentId) -> Option<f32> {
        self.memories
            .iter()
            .filter(|m| m.about == Some(other))
            .max_by(|a, b| a.strength.total_cmp(&b.strength))
            .map(|m| m.valence)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genome::GENE_COUNT;

    fn genome_with(gene: Gene, value: f32) -> Genome {
        let mut genes = [0.5; GENE_COUNT];
        genes[gene as usize] = value;
        Genome::from_genes(genes)
    }

    fn memory(event: Event, about: AgentId, valence: f32, strength: f32) -> Memory {
        Memory::new(0, event, Some(about), valence, strength)
    }

    #[test]
    fn repeats_refresh_instead_of_piling_up() {
        let mut mind = Mind::default();
        mind.remember(memory(Event::Chatted, 4, 0.2, 0.4));
        mind.remember(memory(Event::Chatted, 4, 0.8, 0.4));
        assert_eq!(mind.memories.len(), 1);
        assert!((mind.memories[0].valence - 0.5).abs() < 1e-6);
        assert!(mind.memories[0].strength > 0.4);
    }

    #[test]
    fn the_weakest_memory_is_dropped_at_the_limit() {
        let mut mind = Mind::default();
        for who in 0..MEMORY_LIMIT as u32 {
            mind.remember(memory(Event::Chatted, who, 0.1, 0.5));
        }
        mind.remember(memory(Event::Chatted, 100, 0.1, 0.1));
        assert_eq!(mind.memories.len(), MEMORY_LIMIT);
        assert!(mind.memories.iter().all(|m| m.about != Some(100)));
        mind.remember(memory(Event::Argued, 101, -0.5, 0.9));
        assert!(mind.memories.iter().any(|m| m.about == Some(101)));
        assert_eq!(mind.memories.len(), MEMORY_LIMIT);
    }

    #[test]
    fn memories_fade_and_are_eventually_forgotten() {
        let g = genome_with(Gene::Empathy, 0.5);
        let mut mind = Mind::default();
        mind.remember(memory(Event::Chatted, 1, 0.5, 0.5));
        for _ in 0..4000 {
            mind.fade(&g);
        }
        assert!(mind.memories.is_empty());
    }

    #[test]
    fn life_events_outlast_small_talk() {
        let g = genome_with(Gene::Empathy, 0.5);
        let mut mind = Mind::default();
        mind.remember(memory(Event::Chatted, 1, 0.5, 1.0));
        mind.remember(memory(Event::Paired, 2, 1.0, 1.0));
        for _ in 0..2500 {
            mind.fade(&g);
        }
        let strength = |event| mind.memories.iter().find(|m| m.event == event);
        assert!(strength(Event::Chatted).is_none_or(|m| m.strength < 0.3));
        assert!(strength(Event::Paired).expect("still remembered").strength > 0.5);
    }

    #[test]
    fn anxious_people_hold_on_to_bad_memories() {
        let anxious = genome_with(Gene::Neuroticism, 1.0);
        let calm = genome_with(Gene::Neuroticism, 0.0);
        let (mut a, mut b) = (Mind::default(), Mind::default());
        a.remember(memory(Event::Argued, 1, -0.8, 1.0));
        b.remember(memory(Event::Argued, 1, -0.8, 1.0));
        for _ in 0..800 {
            a.fade(&anxious);
            b.fade(&calm);
        }
        assert!(a.memories[0].strength > b.memories[0].strength);
    }

    #[test]
    fn affinity_stays_in_range_and_relations_stay_limited() {
        let mut mind = Mind::default();
        for _ in 0..50 {
            mind.adjust_affinity(7, 0.3, 1);
        }
        assert_eq!(mind.affinity_for(7), 1.0);
        mind.adjust_affinity(8, -5.0, 2);
        assert_eq!(mind.affinity_for(8), -1.0);
        for who in 10..40 {
            mind.adjust_affinity(who, 0.2, u64::from(who));
        }
        assert!(mind.relations.len() <= RELATION_LIMIT);
        assert_eq!(mind.affinity_for(7), 1.0);
        assert_eq!(mind.affinity_for(999), 0.0);
    }

    #[test]
    fn friends_are_counted_by_affinity() {
        let mut mind = Mind::default();
        mind.adjust_affinity(1, 0.9, 0);
        mind.adjust_affinity(2, 0.1, 0);
        mind.adjust_affinity(3, -0.9, 0);
        assert_eq!(mind.friends(), 1);
    }

    #[test]
    fn afterglow_follows_memories_and_stays_bounded() {
        let mut mind = Mind::default();
        assert_eq!(mind.afterglow(), 0.0);
        for who in 0..10 {
            mind.remember(memory(Event::Paired, who, 1.0, 1.0));
        }
        assert_eq!(mind.afterglow(), 1.0);
        let mut grim = Mind::default();
        grim.remember(memory(Event::Bereaved, 1, -1.0, 1.0));
        assert!(grim.afterglow() < 0.0);
    }

    #[test]
    fn gossip_skips_me_the_listener_and_private_pain() {
        let mut mind = Mind::default();
        mind.remember(memory(Event::Chatted, 1, 0.5, 0.9));
        mind.remember(memory(Event::Chatted, 2, 0.5, 0.8));
        mind.remember(memory(Event::Argued, 3, -0.5, 0.4));
        mind.remember(memory(Event::Bereaved, 4, -1.0, 1.0));
        let about = mind.vivid_about_others(1, 2).expect("something to tell");
        assert_eq!(about.about, Some(3));
        assert!(Mind::default().vivid_about_others(1, 2).is_none());
    }

    #[test]
    fn feeling_about_uses_the_strongest_memory() {
        let mut mind = Mind::default();
        mind.remember(memory(Event::Chatted, 5, 0.6, 0.3));
        mind.remember(memory(Event::Argued, 5, -0.9, 0.8));
        assert_eq!(mind.feeling_about(5), Some(-0.9));
        assert_eq!(mind.feeling_about(6), None);
    }
}
