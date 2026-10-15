//! A mind that learns.
//!
//! Every person carries two small learning policies. One decides how to answer
//! a greeting, the other what to say when starting a conversation. They begin
//! from temperament (the genes), then change with every conversation: a choice
//! that left someone feeling better is chosen more often, one that hurt less
//! often. Nobody writes the habits down. They grow from what happens.

use crate::agent::Agent;
use crate::agent::AgentId;
use crate::genome::{Gene, Genome};
use crate::rng::Rng;

pub const FEATURES: usize = 8;
pub type Features = [f32; FEATURES];

/// Greet back, nod, or ignore.
pub const REPLIES: usize = 3;
pub const GREET_BACK: usize = 0;
pub const NOD: usize = 1;
pub const IGNORE: usize = 2;

/// Smalltalk, gossip, confide, or quarrel.
pub const OPENERS: usize = 4;
pub const SMALLTALK: usize = 0;
pub const GOSSIP: usize = 1;
pub const CONFIDE: usize = 2;
pub const QUARREL: usize = 3;

const BIAS: usize = 0;
const AFFINITY: usize = 1;
const STRANGER: usize = 2;
const MOOD: usize = 3;
const LONELY: usize = 4;
const EXTRAVERSION: usize = 5;
const AGREEABLE: usize = 6;
const GRUDGE: usize = 7;

const LEARNING_RATE: f32 = 0.2;
const WEIGHT_LIMIT: f32 = 3.0;
const EXPLORATION: f32 = 0.04;
const BASELINE_RATE: f32 = 0.05;

/// What a person senses about someone else, each from about -1 to 1.
pub fn features(me: &Agent, other: AgentId) -> Features {
    let genes = &me.genome;
    let known = me.mind.relations.iter().any(|r| r.other == other);
    let grudge = (-me.mind.feeling_about(other).unwrap_or(0.0)).max(0.0);
    let mut x = [0.0; FEATURES];
    x[BIAS] = 1.0;
    x[AFFINITY] = me.mind.affinity_for(other);
    x[STRANGER] = if known { 0.0 } else { 1.0 };
    x[MOOD] = me.mood.valence;
    x[LONELY] = (0.5 - me.needs.social) * 2.0;
    x[EXTRAVERSION] = (genes.get(Gene::Extraversion) - 0.5) * 2.0;
    x[AGREEABLE] = (genes.get(Gene::Agreeableness) - 0.5) * 2.0;
    x[GRUDGE] = grudge;
    x
}

fn dot(weights: &Features, x: &Features) -> f32 {
    weights.iter().zip(x).map(|(w, v)| w * v).sum()
}

/// A softmax policy over `A` choices that learns from rewards.
#[derive(Clone, Debug, PartialEq)]
pub struct Policy<const A: usize> {
    weights: [Features; A],
    baseline: f32,
    trials: u32,
}

impl<const A: usize> Policy<A> {
    pub fn new(weights: [Features; A]) -> Self {
        Self {
            weights,
            baseline: 0.0,
            trials: 0,
        }
    }

    pub fn trials(&self) -> u32 {
        self.trials
    }

    /// The chance of each choice. Choices that are not allowed get none.
    pub fn probabilities(&self, x: &Features, allowed: &[bool; A]) -> [f32; A] {
        let mut logits = [f32::NEG_INFINITY; A];
        for ((logit, weights), ok) in logits.iter_mut().zip(&self.weights).zip(allowed) {
            if *ok {
                *logit = dot(weights, x);
            }
        }
        let top = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let count = allowed.iter().filter(|ok| **ok).count();
        if count == 0 {
            return [0.0; A];
        }
        let mut odds = [0.0; A];
        for (odd, logit) in odds.iter_mut().zip(&logits) {
            if logit.is_finite() {
                *odd = (logit - top).exp();
            }
        }
        let total: f32 = odds.iter().sum();
        let share = EXPLORATION / count as f32;
        let mut chance = [0.0; A];
        for ((c, odd), ok) in chance.iter_mut().zip(&odds).zip(allowed) {
            if *ok {
                *c = (1.0 - EXPLORATION) * odd / total + share;
            }
        }
        chance
    }

    pub fn choose(&self, x: &Features, allowed: &[bool; A], rng: &mut Rng) -> usize {
        let chance = self.probabilities(x, allowed);
        let mut roll = rng.next_f32();
        let mut last = 0;
        for (i, (c, ok)) in chance.iter().zip(allowed).enumerate() {
            if !ok {
                continue;
            }
            last = i;
            if roll < *c {
                return i;
            }
            roll -= c;
        }
        last
    }

    /// Nudge the policy toward `chosen` when the reward beat what this person
    /// usually gets, and away from it when it fell short.
    pub fn learn(&mut self, x: &Features, allowed: &[bool; A], chosen: usize, reward: f32) {
        let chance = self.probabilities(x, allowed);
        let advantage = reward - self.baseline;
        for (i, (weights, ok)) in self.weights.iter_mut().zip(allowed).enumerate() {
            if !ok {
                continue;
            }
            let pull = if i == chosen { 1.0 } else { 0.0 } - chance[i];
            for (w, v) in weights.iter_mut().zip(x) {
                *w = (*w + LEARNING_RATE * advantage * pull * v).clamp(-WEIGHT_LIMIT, WEIGHT_LIMIT);
            }
        }
        self.baseline += BASELINE_RATE * (reward - self.baseline);
        self.trials += 1;
    }

    fn blend(own: &Self, a: &Self, b: &Self) -> Self {
        let mut weights = own.weights;
        for (i, row) in weights.iter_mut().enumerate() {
            for (k, w) in row.iter_mut().enumerate() {
                *w = 0.5 * own.weights[i][k] + 0.25 * a.weights[i][k] + 0.25 * b.weights[i][k];
            }
        }
        Self::new(weights)
    }

    fn fingerprint(&self) -> u64 {
        let mut hash = u64::from(self.trials);
        for w in self.weights.iter().flatten() {
            hash = hash.rotate_left(5) ^ u64::from(w.to_bits());
        }
        hash
    }
}

/// How someone tends to act toward an ordinary acquaintance, for showing.
#[derive(Clone, Debug, PartialEq)]
pub struct MindSummary {
    pub experience: u32,
    pub greets_back: f32,
    pub ignores: f32,
    pub quarrels: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Brain {
    pub reply: Policy<REPLIES>,
    pub opener: Policy<OPENERS>,
}

impl Brain {
    /// The temperament someone is born with, before life teaches them anything.
    pub fn from_genome(genome: &Genome) -> Self {
        let agree = genome.get(Gene::Agreeableness) - 0.5;
        let extra = genome.get(Gene::Extraversion) - 0.5;
        let neuro = genome.get(Gene::Neuroticism) - 0.5;
        let open = genome.get(Gene::Openness) - 0.5;

        let mut reply = [[0.0; FEATURES]; REPLIES];
        reply[GREET_BACK] = [
            1.2 + 1.6 * agree + 0.8 * extra,
            2.2,
            -0.2,
            0.4,
            0.6,
            0.0,
            0.0,
            -1.5,
        ];
        reply[NOD] = [0.3, 0.0, 0.4, -0.2, 0.0, 0.0, 0.0, 0.4];
        reply[IGNORE] = [
            -1.0 - 1.6 * agree + 1.2 * neuro,
            -2.4,
            -0.2,
            -0.5,
            -0.5,
            0.0,
            0.0,
            2.2,
        ];

        let mut opener = [[0.0; FEATURES]; OPENERS];
        opener[SMALLTALK] = [2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        opener[GOSSIP] = [1.0 + 1.4 * extra, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        opener[CONFIDE] = [-1.2 + 1.2 * open, 3.0, -0.5, 0.0, 0.3, 0.0, 0.0, 0.0];
        opener[QUARREL] = [
            -3.2 + 2.6 * (neuro - agree),
            -2.0,
            0.0,
            -0.6,
            0.0,
            0.0,
            0.0,
            2.5,
        ];
        Self {
            reply: Policy::new(reply),
            opener: Policy::new(opener),
        }
    }

    /// A child starts from their own temperament, shaped by the habits both
    /// parents have learned.
    pub fn inherit(own: &Brain, a: &Brain, b: &Brain) -> Brain {
        Brain {
            reply: Policy::blend(&own.reply, &a.reply, &b.reply),
            opener: Policy::blend(&own.opener, &a.opener, &b.opener),
        }
    }

    pub fn experience(&self) -> u32 {
        self.reply.trials + self.opener.trials
    }

    /// Changes whenever anything was learned. Used to check runs repeat exactly.
    pub fn fingerprint(&self) -> u64 {
        self.reply.fingerprint().rotate_left(17) ^ self.opener.fingerprint()
    }
}

/// How someone tends to treat the people they know, averaged over them. With
/// nobody known yet, how they would treat an ordinary acquaintance.
pub fn summarize(agent: &Agent) -> MindSummary {
    let mut crowd: Vec<Features> = agent
        .mind
        .relations
        .iter()
        .map(|r| features(agent, r.other))
        .collect();
    if crowd.is_empty() {
        let mut x = [0.0; FEATURES];
        x[BIAS] = 1.0;
        x[EXTRAVERSION] = (agent.genome.get(Gene::Extraversion) - 0.5) * 2.0;
        x[AGREEABLE] = (agent.genome.get(Gene::Agreeableness) - 0.5) * 2.0;
        crowd.push(x);
    }
    let (mut greets, mut ignores, mut quarrels) = (0.0, 0.0, 0.0);
    for x in &crowd {
        let reply = agent.brain.reply.probabilities(x, &[true; REPLIES]);
        let opener = agent
            .brain
            .opener
            .probabilities(x, &[true, false, true, true]);
        greets += reply[GREET_BACK];
        ignores += reply[IGNORE];
        quarrels += opener[QUARREL];
    }
    let n = crowd.len() as f32;
    MindSummary {
        experience: agent.brain.experience(),
        greets_back: greets / n,
        ignores: ignores / n,
        quarrels: quarrels / n,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genome::GENE_COUNT;

    fn genome(f: impl Fn(&mut [f32; GENE_COUNT])) -> Genome {
        let mut genes = [0.5; GENE_COUNT];
        f(&mut genes);
        Genome::from_genes(genes)
    }

    fn x(affinity: f32) -> Features {
        let mut x = [0.0; FEATURES];
        x[BIAS] = 1.0;
        x[AFFINITY] = affinity;
        x
    }

    #[test]
    fn chances_add_up_and_respect_what_is_allowed() {
        let brain = Brain::from_genome(&genome(|_| {}));
        let p = brain
            .opener
            .probabilities(&x(0.0), &[true, false, true, true]);
        assert!((p.iter().sum::<f32>() - 1.0).abs() < 1e-5);
        assert_eq!(p[GOSSIP], 0.0);
        assert!(p.iter().filter(|c| **c > 0.0).count() == 3);
        let none = brain.opener.probabilities(&x(0.0), &[false; OPENERS]);
        assert_eq!(none, [0.0; OPENERS]);
    }

    #[test]
    fn friends_are_greeted_back_and_enemies_are_ignored() {
        let brain = Brain::from_genome(&genome(|_| {}));
        let all = [true; REPLIES];
        let friend = brain.reply.probabilities(&x(0.8), &all);
        let enemy = brain.reply.probabilities(&x(-0.8), &all);
        assert!(friend[GREET_BACK] > 0.8);
        assert!(enemy[IGNORE] > enemy[GREET_BACK]);
    }

    #[test]
    fn kind_people_start_out_warmer() {
        let kind = Brain::from_genome(&genome(|g| g[Gene::Agreeableness as usize] = 1.0));
        let cold = Brain::from_genome(&genome(|g| g[Gene::Agreeableness as usize] = 0.0));
        let all = [true; REPLIES];
        assert!(
            kind.reply.probabilities(&x(0.0), &all)[GREET_BACK]
                > cold.reply.probabilities(&x(0.0), &all)[GREET_BACK]
        );
    }

    #[test]
    fn rewarded_choices_become_more_likely() {
        let mut brain = Brain::from_genome(&genome(|_| {}));
        let all = [true; REPLIES];
        let before = brain.reply.probabilities(&x(0.0), &all)[IGNORE];
        for _ in 0..200 {
            brain.reply.learn(&x(0.0), &all, IGNORE, 1.0);
            brain.reply.learn(&x(0.0), &all, GREET_BACK, -0.5);
        }
        let after = brain.reply.probabilities(&x(0.0), &all)[IGNORE];
        assert!(after > before + 0.2, "{before} to {after}");
        assert_eq!(brain.reply.trials(), 400);
    }

    #[test]
    fn punished_choices_become_less_likely() {
        let mut brain = Brain::from_genome(&genome(|_| {}));
        let all = [true; REPLIES];
        let before = brain.reply.probabilities(&x(0.0), &all)[GREET_BACK];
        for _ in 0..200 {
            brain.reply.learn(&x(0.0), &all, GREET_BACK, -1.0);
            brain.reply.learn(&x(0.0), &all, NOD, 0.3);
        }
        assert!(brain.reply.probabilities(&x(0.0), &all)[GREET_BACK] < before - 0.2);
    }

    #[test]
    fn learning_never_runs_away() {
        let mut brain = Brain::from_genome(&genome(|_| {}));
        let all = [true; REPLIES];
        for _ in 0..20_000 {
            brain.reply.learn(&x(1.0), &all, IGNORE, 5.0);
        }
        let p = brain.reply.probabilities(&x(1.0), &all);
        assert!(p.iter().all(|c| c.is_finite() && *c > 0.0));
        assert!((p.iter().sum::<f32>() - 1.0).abs() < 1e-4);
    }

    #[test]
    fn something_is_always_left_to_try() {
        let mut brain = Brain::from_genome(&genome(|_| {}));
        let all = [true; REPLIES];
        for _ in 0..5000 {
            brain.reply.learn(&x(0.0), &all, GREET_BACK, 1.0);
        }
        let p = brain.reply.probabilities(&x(0.0), &all);
        assert!(p[IGNORE] >= EXPLORATION / 3.0 - 1e-6);
    }

    #[test]
    fn choices_follow_the_chances() {
        let brain = Brain::from_genome(&genome(|_| {}));
        let all = [true; REPLIES];
        let mut rng = Rng::new(4);
        let mut greeted = 0;
        for _ in 0..4000 {
            if brain.reply.choose(&x(0.8), &all, &mut rng) == GREET_BACK {
                greeted += 1;
            }
        }
        assert!(greeted > 3200, "{greeted}");
        let only = [false, true, false];
        assert_eq!(brain.reply.choose(&x(0.8), &only, &mut rng), NOD);
    }

    #[test]
    fn children_take_after_both_parents_habits() {
        let own = Brain::from_genome(&genome(|_| {}));
        let mut a = own.clone();
        let b = own.clone();
        let all = [true; REPLIES];
        for _ in 0..300 {
            a.reply.learn(&x(0.0), &all, IGNORE, 1.0);
            a.reply.learn(&x(0.0), &all, GREET_BACK, -0.5);
        }
        let child = Brain::inherit(&own, &a, &b);
        let (p_own, p_child, p_a) = (
            own.reply.probabilities(&x(0.0), &all)[IGNORE],
            child.reply.probabilities(&x(0.0), &all)[IGNORE],
            a.reply.probabilities(&x(0.0), &all)[IGNORE],
        );
        assert!(p_own < p_child && p_child < p_a);
        assert_eq!(child.experience(), 0);
    }

    #[test]
    fn the_fingerprint_notices_learning() {
        let mut brain = Brain::from_genome(&genome(|_| {}));
        let before = brain.fingerprint();
        assert_eq!(before, brain.clone().fingerprint());
        brain.opener.learn(&x(0.0), &[true; OPENERS], QUARREL, -1.0);
        assert_ne!(before, brain.fingerprint());
    }

    #[test]
    fn the_summary_describes_an_acquaintance() {
        let person = Agent::new(1, "p1".to_string(), genome(|_| {}), (0, 0), 50);
        let s = summarize(&person);
        assert!(s.greets_back > s.ignores);
        assert!(s.quarrels < 0.2);
        assert_eq!(s.experience, 0);
    }

    #[test]
    fn the_summary_follows_the_people_someone_knows() {
        let mut person = Agent::new(1, "p1".to_string(), genome(|_| {}), (0, 0), 50);
        let stranger = summarize(&person).greets_back;
        person.mind.adjust_affinity(2, 0.95, 0);
        assert!(summarize(&person).greets_back > stranger);
        let mut grudge = Agent::new(3, "p3".to_string(), genome(|_| {}), (0, 0), 50);
        grudge.mind.adjust_affinity(4, -0.95, 0);
        assert!(summarize(&grudge).greets_back < stranger);
        assert!(summarize(&grudge).ignores > summarize(&person).ignores);
    }
}
