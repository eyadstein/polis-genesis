//! Conversations between two people.
//!
//! A conversation changes what both remember and how they feel about each
//! other. The core only records what happened as an `Utterance`. Turning it
//! into words is the job of the `polis_mind` crate.

use crate::agent::{Agent, AgentId};
use crate::brain::{features, Features, OPENERS, REPLIES};
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

const OPENER_ACTS: [Act; OPENERS] = [Act::Smalltalk, Act::Gossip, Act::Confide, Act::Quarrel];

/// How the listener answered a greeting.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reply {
    /// Greeted back, and the conversation went on.
    Greeted,
    /// A short nod and nothing more.
    Nodded,
    /// No answer at all.
    Ignored,
}

const REPLY_CHOICES: [Reply; REPLIES] = [Reply::Greeted, Reply::Nodded, Reply::Ignored];

#[derive(Clone, Debug)]
pub struct Utterance {
    pub tick: u64,
    pub speaker: AgentId,
    pub listener: AgentId,
    pub act: Act,
    /// How the listener answered the greeting.
    pub reply: Reply,
    /// The person being gossiped about.
    pub about: Option<AgentId>,
    /// How the speaker feels about the listener after the conversation.
    pub warmth: f32,
}

/// Feelings of comfort count for a lot, and so does growing fonder.
const SOCIAL_WEIGHT: f32 = 8.0;
const AFFINITY_WEIGHT: f32 = 1.5;

/// What the speaker could say right now, and who they could gossip about.
fn allowed_openers(speaker: &Agent, listener: &Agent) -> ([bool; OPENERS], Option<AgentId>) {
    let memory = speaker.mind.vivid_about_others(speaker.id, listener.id);
    let close = speaker.mind.affinity_for(listener.id) > 0.25;
    (
        [true, memory.is_some(), close, true],
        memory.and_then(|m| m.about),
    )
}

struct Opening {
    act: usize,
    about: Option<AgentId>,
    x: Features,
    allowed: [bool; OPENERS],
}

fn open(speaker: &Agent, listener: &Agent, rng: &mut Rng) -> Opening {
    let (allowed, about) = allowed_openers(speaker, listener);
    let x = features(speaker, listener.id);
    let act = speaker.brain.opener.choose(&x, &allowed, rng);
    let about = if OPENER_ACTS[act] == Act::Gossip {
        about
    } else {
        None
    };
    Opening {
        act,
        about,
        x,
        allowed,
    }
}

/// What the speaker decides to say. Learned, so it differs from person to
/// person and changes with what has worked for them.
pub fn choose_act(speaker: &Agent, listener: &Agent, rng: &mut Rng) -> (Act, Option<AgentId>) {
    let opening = open(speaker, listener, rng);
    (OPENER_ACTS[opening.act], opening.about)
}

/// What the conversation itself does to the two people, once it has begun.
fn play(speaker: &mut Agent, listener: &mut Agent, act: Act, about: Option<AgentId>, tick: u64) {
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
}

/// The speaker met the listener and the listener answered, as they have
/// learned to. Returns what the greeting did to the two of them.
fn greeting(speaker: &mut Agent, listener: &mut Agent, reply: Reply, tick: u64) {
    let (s_id, l_id) = (speaker.id, listener.id);
    match reply {
        Reply::Greeted => {}
        Reply::Nodded => {
            speaker.mind.adjust_affinity(l_id, 0.005, tick);
            listener.mind.adjust_affinity(s_id, 0.005, tick);
            speaker.needs.add(Need::Social, 0.01);
            listener.needs.add(Need::Social, 0.01);
        }
        Reply::Ignored => {
            let sting = 1.0 + speaker.genome.get(Gene::Neuroticism);
            speaker.mind.adjust_affinity(l_id, -0.05 * sting, tick);
            speaker
                .mind
                .remember(Memory::new(tick, Event::Snubbed, Some(l_id), -0.6, 0.6));
            listener.mind.adjust_affinity(s_id, -0.01, tick);
            speaker.needs.add(Need::Social, -0.03);
        }
    }
}

/// Hold a conversation and apply what it does to both people. The speaker
/// greets, the listener answers, and if they greet back the talk goes on.
/// Both learn from how it went.
pub fn converse(speaker: &mut Agent, listener: &mut Agent, tick: u64, rng: &mut Rng) -> Utterance {
    let (s_id, l_id) = (speaker.id, listener.id);
    let answer_x = features(listener, s_id);
    let answer = listener
        .brain
        .reply
        .choose(&answer_x, &[true; REPLIES], rng);
    let reply = REPLY_CHOICES[answer];
    let listener_affinity = listener.mind.affinity_for(s_id);
    let listener_social = listener.needs.social;

    greeting(speaker, listener, reply, tick);

    let mut act = Act::Smalltalk;
    let mut about = None;
    let listener_reward = match reply {
        Reply::Ignored => {
            let avoided = if listener_affinity < 0.0 {
                0.15 * -listener_affinity
            } else {
                -0.3 * listener_affinity
            };
            avoided - 0.05
        }
        Reply::Nodded => 0.02,
        Reply::Greeted => {
            let opening = open(speaker, listener, rng);
            act = OPENER_ACTS[opening.act];
            about = opening.about;
            let speaker_social = speaker.needs.social;
            let speaker_affinity = speaker.mind.affinity_for(l_id);
            play(speaker, listener, act, about, tick);
            let gained = |agent: &Agent, social: f32, affinity: f32, other: AgentId| {
                SOCIAL_WEIGHT * (agent.needs.social - social)
                    + AFFINITY_WEIGHT * (agent.mind.affinity_for(other) - affinity)
            };
            let speaker_reward = gained(speaker, speaker_social, speaker_affinity, l_id) + 0.3;
            speaker.brain.opener.learn(
                &opening.x,
                &opening.allowed,
                opening.act,
                speaker_reward.clamp(-1.5, 1.5),
            );
            gained(listener, listener_social, listener_affinity, s_id) + 0.1
        }
    };
    listener.brain.reply.learn(
        &answer_x,
        &[true; REPLIES],
        answer,
        listener_reward.clamp(-1.5, 1.5),
    );

    Utterance {
        tick,
        speaker: s_id,
        listener: l_id,
        act,
        reply,
        about,
        warmth: speaker.mind.affinity_for(l_id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brain::summarize;
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

    fn counts(a: &mut Agent, b: &mut Agent, rounds: u64) -> (u32, u32, u32) {
        let mut rng = Rng::new(21);
        let (mut greeted, mut nodded, mut ignored) = (0, 0, 0);
        for tick in 0..rounds {
            match converse(a, b, tick, &mut rng).reply {
                Reply::Greeted => greeted += 1,
                Reply::Nodded => nodded += 1,
                Reply::Ignored => ignored += 1,
            }
        }
        (greeted, nodded, ignored)
    }

    #[test]
    fn friends_greet_each_other_back() {
        let (mut a, mut b) = (plain(1), plain(2));
        a.mind.adjust_affinity(2, 0.9, 0);
        b.mind.adjust_affinity(1, 0.9, 0);
        let (greeted, _, ignored) = counts(&mut a, &mut b, 200);
        assert!(greeted > 150, "{greeted}");
        assert!(ignored < 20, "{ignored}");
    }

    #[test]
    fn people_who_dislike_someone_do_not_greet_them_back() {
        let (mut a, mut b) = (plain(1), plain(2));
        b.mind.adjust_affinity(1, -0.9, 0);
        b.mind
            .remember(Memory::new(0, Event::Wronged, Some(1), -1.0, 1.0));
        let mut rng = Rng::new(3);
        let mut ignored = 0;
        let mut greeted = 0;
        for tick in 0..60 {
            b.mind.adjust_affinity(1, -0.9, tick);
            match converse(&mut a, &mut b, tick, &mut rng).reply {
                Reply::Ignored => ignored += 1,
                Reply::Greeted => greeted += 1,
                Reply::Nodded => {}
            }
        }
        assert!(ignored > greeted, "{ignored} against {greeted}");
    }

    #[test]
    fn being_ignored_hurts_and_is_remembered() {
        let (mut a, mut b) = (plain(1), rowdy(2));
        b.mind.adjust_affinity(1, -0.9, 0);
        let mut rng = Rng::new(8);
        for tick in 0..400 {
            let before = a.mind.affinity_for(2);
            let social = a.needs.social;
            let u = converse(&mut a, &mut b, tick, &mut rng);
            if u.reply == Reply::Ignored {
                assert!(a.mind.affinity_for(2) < before);
                assert!(a.needs.social < social || social <= 0.0);
                assert!(a.mind.memories.iter().any(|m| m.event == Event::Snubbed));
                assert_eq!(u.act, Act::Smalltalk);
                return;
            }
        }
        panic!("nobody was ignored");
    }

    #[test]
    fn a_greeting_that_is_not_answered_goes_nowhere() {
        let (mut a, mut b) = (plain(1), plain(2));
        let mut rng = Rng::new(5);
        let mut checked = false;
        for tick in 0..2000 {
            b.mind.adjust_affinity(1, -0.4, tick);
            let confided = b
                .mind
                .memories
                .iter()
                .filter(|m| m.event == Event::Confided)
                .count();
            let u = converse(&mut a, &mut b, tick, &mut rng);
            if u.reply != Reply::Greeted {
                assert_eq!(
                    b.mind
                        .memories
                        .iter()
                        .filter(|m| m.event == Event::Confided)
                        .count(),
                    confided
                );
                assert_eq!(u.about, None);
                checked = true;
            }
        }
        assert!(checked);
    }

    #[test]
    fn people_learn_from_how_conversations_go() {
        let (mut a, mut b) = (plain(1), plain(2));
        let (before_a, before_b) = (a.brain.clone(), b.brain.clone());
        counts(&mut a, &mut b, 500);
        assert!(a.brain.experience() > 0 && b.brain.experience() > 0);
        assert_ne!(a.brain, before_a);
        assert_ne!(b.brain, before_b);
        assert!(a.brain.opener.trials() + a.brain.reply.trials() <= 1000);
    }

    #[test]
    fn two_people_with_the_same_start_grow_apart() {
        let (mut a, mut b) = (plain(1), plain(2));
        let mut c = plain(3);
        counts(&mut a, &mut b, 800);
        counts(&mut c, &mut rowdy(4), 800);
        assert_ne!(a.brain.fingerprint(), c.brain.fingerprint());
    }

    #[test]
    fn the_summary_follows_what_was_learned() {
        let (mut a, mut b) = (plain(1), plain(2));
        let before = summarize(&a);
        counts(&mut a, &mut b, 1500);
        let after = summarize(&a);
        assert!(after.experience > before.experience);
        assert!((after.greets_back - before.greets_back).abs() > 0.001);
    }
}
