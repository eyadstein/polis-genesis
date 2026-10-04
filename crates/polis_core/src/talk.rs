//! Conversations between two people.
//!
//! A conversation changes what both remember and how they feel about each
//! other. The core only records what happened as an `Utterance`. Turning it
//! into words is the job of the `polis_mind` crate.

use crate::agent::{Agent, AgentId};
use crate::family::compatibility;
use crate::genome::Gene;
use crate::memory::{Event, Memory};
use crate::needs::Need;
use crate::rng::Rng;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Act {
    Smalltalk,
    Gossip,
    Confide,
    Quarrel,
}

#[derive(Clone, Debug)]
pub struct Utterance {
    pub tick: u64,
    pub speaker: AgentId,
    pub listener: AgentId,
    pub act: Act,
    /// The person being gossiped about.
    pub about: Option<AgentId>,
    /// How the speaker feels about the listener after the conversation.
    pub warmth: f32,
}

/// What the speaker decides to say, from temperament and how they feel
/// about the listener.
pub fn choose_act(speaker: &Agent, listener: &Agent, rng: &mut Rng) -> (Act, Option<AgentId>) {
    let affinity = speaker.mind.affinity_for(listener.id);
    let g = &speaker.genome;
    let edge = (g.get(Gene::Neuroticism) - g.get(Gene::Agreeableness)).max(0.0);
    let quarrel = (0.03 + 0.2 * edge) * if affinity < 0.0 { 2.0 } else { 0.5 };
    if rng.chance(quarrel) {
        return (Act::Quarrel, None);
    }
    if affinity > 0.5 && rng.chance(0.15 + 0.25 * g.get(Gene::Openness)) {
        return (Act::Confide, None);
    }
    if let Some(memory) = speaker.mind.vivid_about_others(speaker.id, listener.id) {
        if rng.chance(0.2 + 0.4 * g.get(Gene::Extraversion)) {
            return (Act::Gossip, memory.about);
        }
    }
    (Act::Smalltalk, None)
}

/// Hold a conversation and apply what it does to both people.
pub fn converse(speaker: &mut Agent, listener: &mut Agent, tick: u64, rng: &mut Rng) -> Utterance {
    let (act, about) = choose_act(speaker, listener, rng);
    let (s_id, l_id) = (speaker.id, listener.id);
    let pleasant = compatibility(&speaker.genome, &listener.genome) - 0.35;
    let l_empathy = listener.genome.get(Gene::Empathy);
    let l_openness = listener.genome.get(Gene::Openness);

    match act {
        Act::Smalltalk => {
            let delta = 0.03 + 0.25 * pleasant;
            speaker.mind.adjust_affinity(l_id, delta, tick);
            listener.mind.adjust_affinity(s_id, delta, tick);
            let valence = pleasant * 1.5;
            speaker
                .mind
                .remember(Memory::new(tick, Event::Chatted, Some(l_id), valence, 0.4));
            listener
                .mind
                .remember(Memory::new(tick, Event::Chatted, Some(s_id), valence, 0.4));
        }
        Act::Gossip => {
            speaker.mind.adjust_affinity(l_id, 0.03, tick);
            listener
                .mind
                .adjust_affinity(s_id, 0.04 + 0.05 * (l_openness - 0.5), tick);
            if let Some(third) = about {
                let told = speaker.mind.feeling_about(third).unwrap_or(0.0);
                let spin = if told < 0.0 {
                    1.0 + 0.5 * speaker.genome.get(Gene::Neuroticism)
                } else {
                    0.8 + 0.2 * speaker.genome.get(Gene::Empathy)
                };
                let heard = (told * spin).clamp(-1.0, 1.0);
                let trust = (listener.mind.affinity_for(s_id) + 1.0) / 2.0;
                listener.mind.remember(Memory::new(
                    tick,
                    Event::Gossiped,
                    Some(third),
                    heard,
                    0.3 + 0.5 * trust,
                ));
                listener
                    .mind
                    .adjust_affinity(third, heard * 0.1 * trust, tick);
            }
        }
        Act::Confide => {
            speaker.mind.adjust_affinity(l_id, 0.08, tick);
            listener
                .mind
                .adjust_affinity(s_id, 0.10 * (0.5 + l_empathy), tick);
            speaker
                .mind
                .remember(Memory::new(tick, Event::Chatted, Some(l_id), 0.6, 0.5));
            listener
                .mind
                .remember(Memory::new(tick, Event::Confided, Some(s_id), 0.7, 0.7));
        }
        Act::Quarrel => {
            speaker.mind.adjust_affinity(l_id, -0.15, tick);
            let sting = 1.0 - 0.5 * listener.genome.get(Gene::Agreeableness);
            listener.mind.adjust_affinity(s_id, -0.15 * sting, tick);
            speaker
                .mind
                .remember(Memory::new(tick, Event::Argued, Some(l_id), -0.8, 0.8));
            listener
                .mind
                .remember(Memory::new(tick, Event::Argued, Some(s_id), -0.8, 0.8));
        }
    }

    let comfort = |agent: &mut Agent, other: AgentId| {
        let warmth = agent.mind.affinity_for(other).max(0.0);
        let gain = if act == Act::Quarrel {
            -0.02
        } else {
            0.03 + 0.03 * warmth
        };
        agent.needs.add(Need::Social, gain);
    };
    comfort(speaker, l_id);
    comfort(listener, s_id);

    Utterance {
        tick,
        speaker: s_id,
        listener: l_id,
        act,
        about,
        warmth: speaker.mind.affinity_for(l_id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genome::{Genome, GENE_COUNT};

    fn person(id: AgentId, genes: [f32; GENE_COUNT]) -> Agent {
        Agent::new(id, format!("p{id}"), Genome::from_genes(genes), (0, 0), 50)
    }

    fn plain(id: AgentId) -> Agent {
        person(id, [0.5; GENE_COUNT])
    }

    fn rowdy(id: AgentId) -> Agent {
        let mut genes = [0.5; GENE_COUNT];
        genes[Gene::Neuroticism as usize] = 1.0;
        genes[Gene::Agreeableness as usize] = 0.0;
        person(id, genes)
    }

    /// Hold conversations until one with the wanted act happens.
    fn until(act: Act, a: &mut Agent, b: &mut Agent) -> Utterance {
        let mut rng = Rng::new(9);
        for tick in 0..5000 {
            let u = converse(a, b, tick, &mut rng);
            if u.act == act {
                return u;
            }
        }
        panic!("no {act:?} happened");
    }

    #[test]
    fn nobody_gossips_with_nothing_to_say() {
        let (a, b) = (plain(1), plain(2));
        let mut rng = Rng::new(1);
        for _ in 0..500 {
            let (act, about) = choose_act(&a, &b, &mut rng);
            assert_ne!(act, Act::Gossip);
            assert!(about.is_none());
        }
    }

    #[test]
    fn quarrels_hurt_both_sides_and_are_remembered() {
        let (mut a, mut b) = (rowdy(1), rowdy(2));
        let mut rng = Rng::new(9);
        for tick in 0..5000 {
            let before = (a.mind.affinity_for(2), b.mind.affinity_for(1));
            let u = converse(&mut a, &mut b, tick, &mut rng);
            if u.act == Act::Quarrel {
                assert!(a.mind.affinity_for(2) < before.0);
                assert!(b.mind.affinity_for(1) < before.1);
                assert!(a.mind.memories.iter().any(|m| m.event == Event::Argued));
                assert!(b.mind.memories.iter().any(|m| m.event == Event::Argued));
                return;
            }
        }
        panic!("no quarrel happened");
    }

    #[test]
    fn confiding_deepens_a_friendship() {
        let (mut a, mut b) = (plain(1), plain(2));
        a.mind.adjust_affinity(2, 0.9, 0);
        let before = b.mind.affinity_for(1);
        let mut rng = Rng::new(5);
        let mut confided = false;
        for tick in 0..3000 {
            let u = converse(&mut a, &mut b, tick, &mut rng);
            confided |= u.act == Act::Confide;
        }
        assert!(confided);
        assert!(b.mind.affinity_for(1) > before);
        assert!(b.mind.memories.iter().any(|m| m.event == Event::Confided));
    }

    #[test]
    fn gossip_passes_on_an_opinion_of_a_third_person() {
        let (mut a, mut b) = (plain(1), plain(2));
        a.mind
            .remember(Memory::new(0, Event::Argued, Some(3), -0.9, 0.9));
        b.mind.adjust_affinity(1, 0.8, 0);
        let u = until(Act::Gossip, &mut a, &mut b);
        assert_eq!(u.about, Some(3));
        assert!(b.mind.affinity_for(3) < 0.0);
        let heard = b
            .mind
            .memories
            .iter()
            .find(|m| m.event == Event::Gossiped)
            .expect("heard it");
        assert_eq!(heard.about, Some(3));
        assert!(heard.valence < 0.0);
    }

    #[test]
    fn anxious_gossips_make_bad_news_worse() {
        let mut anxious = [0.5; GENE_COUNT];
        anxious[Gene::Neuroticism as usize] = 1.0;
        let mut a = person(1, anxious);
        let mut b = plain(2);
        a.mind
            .remember(Memory::new(0, Event::Argued, Some(3), -0.5, 0.9));
        b.mind.adjust_affinity(1, 0.8, 0);
        until(Act::Gossip, &mut a, &mut b);
        let heard = b
            .mind
            .memories
            .iter()
            .find(|m| m.event == Event::Gossiped)
            .expect("heard it");
        assert!(heard.valence < -0.5);
    }

    #[test]
    fn conversations_change_the_need_for_company() {
        let (mut a, mut b) = (plain(1), plain(2));
        a.needs.social = 0.2;
        b.needs.social = 0.2;
        let mut rng = Rng::new(3);
        converse(&mut a, &mut b, 1, &mut rng);
        assert!(a.needs.social != 0.2 && b.needs.social != 0.2);
    }

    #[test]
    fn long_run_feelings_stay_in_range_and_are_deterministic() {
        let run = || {
            let (mut a, mut b) = (rowdy(1), plain(2));
            let mut rng = Rng::new(77);
            for tick in 0..4000 {
                converse(&mut a, &mut b, tick, &mut rng);
            }
            (a.mind.affinity_for(2), b.mind.affinity_for(1))
        };
        let (x, y) = run();
        assert!((-1.0..=1.0).contains(&x) && (-1.0..=1.0).contains(&y));
        assert_eq!(run(), (x, y));
    }
}
