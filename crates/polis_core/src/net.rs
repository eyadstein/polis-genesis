//! A small neural network that helps a person decide what to do each tick.
//!
//! Every person carries one. It has an input layer (how hungry, thirsty,
//! tired, lonely and purposeful they feel, their mood and money worries,
//! what is around them, and two temperament traits), one hidden layer of
//! tanh units, and one output per daily choice: eat, drink, rest, socialize,
//! work, wander. Each output is the learned value of that choice.
//!
//! Nobody writes the habits down. After every choice the person compares how
//! they feel now with how they felt before, and the network is trained on
//! that difference (a one step temporal difference update, by backpropagation).
//! The old rules stay in charge of emergencies and still provide the base
//! score for every choice. The network only adds to it, and gains influence
//! slowly as it learns.

use crate::agent::{money_pressure, Action, Agent, Percept};
use crate::genome::{Gene, Genome};
use crate::needs::{urgency, Need};
use crate::rng::Rng;
use serde::{Deserialize, Serialize};

pub const INPUTS: usize = 13;
pub const HIDDEN: usize = 8;
pub const CHOICES: usize = 6;

const W1: usize = 0;
const B1: usize = W1 + HIDDEN * INPUTS;
const W2: usize = B1 + HIDDEN;
const B2: usize = W2 + CHOICES * HIDDEN;
/// Number of learned numbers in one network.
pub const PARAMS: usize = B2 + CHOICES;

const LEARNING_RATE: f32 = 0.03;
const DISCOUNT: f32 = 0.85;
const WEIGHT_LIMIT: f32 = 4.0;
const VALUE_LIMIT: f32 = 5.0;
const ERROR_LIMIT: f32 = 2.0;
/// Feelings change by small amounts each tick, so they are scaled up.
const REWARD_SCALE: f32 = 10.0;
/// Learning steps before the network has its full say.
const TRUST_STEPS: f32 = 4000.0;
const MAX_TRUST: f32 = 0.6;
/// How much a learned value can move the score of a choice.
const PULL: f32 = 0.2;
/// Below this level of hunger, thirst or energy the old rules decide alone.
pub const REFLEX_LEVEL: f32 = 0.15;

pub type Inputs = [f32; INPUTS];
pub type Allowed = [bool; CHOICES];

/// The order of the network outputs.
pub const CHOICE_ORDER: [Action; CHOICES] = [
    Action::Eat,
    Action::Drink,
    Action::Rest,
    Action::Socialize,
    Action::Work,
    Action::Wander,
];

pub fn slot(action: Action) -> usize {
    match action {
        Action::Eat => 0,
        Action::Drink => 1,
        Action::Rest => 2,
        Action::Socialize => 3,
        Action::Work => 4,
        Action::Wander => 5,
    }
}

/// Which choices are open to someone right now.
pub fn allowed(percept: &Percept) -> Allowed {
    let mut open = [true; CHOICES];
    open[slot(Action::Work)] = percept.employed;
    open
}

/// What the network sees. Every value is roughly between -1 and 1.
pub fn inputs(agent: &Agent, percept: &Percept) -> Inputs {
    let flag = |on: bool| if on { 1.0 } else { 0.0 };
    [
        agent.needs.get(Need::Hunger),
        agent.needs.get(Need::Thirst),
        agent.needs.get(Need::Energy),
        agent.needs.get(Need::Social),
        agent.needs.get(Need::Purpose),
        agent.mood.valence,
        percept.money_pressure,
        (percept.people_nearby.min(4) as f32) / 4.0,
        flag(percept.food_underfoot || percept.meal_affordable),
        flag(percept.water_nearby),
        flag(percept.employed),
        agent.genome.get(Gene::Extraversion) - 0.5,
        agent.genome.get(Gene::Conscientiousness) - 0.5,
    ]
}

/// How good life feels right now, from 0 to 1. Outgoing people feel the lack
/// of company more, conscientious people the lack of purpose more.
pub fn feeling(agent: &Agent) -> f32 {
    let weights = [
        (Need::Hunger, 1.0),
        (Need::Thirst, 1.0),
        (Need::Energy, 1.0),
        (Need::Social, 0.5 + agent.genome.get(Gene::Extraversion)),
        (
            Need::Purpose,
            0.5 + agent.genome.get(Gene::Conscientiousness),
        ),
    ];
    let mut total = 0.0;
    let mut sum = 0.0;
    for (need, weight) in weights {
        total += weight * (1.0 - urgency(agent.needs.get(need)));
        sum += weight;
    }
    total += 0.3 * (1.0 - money_pressure(agent.money));
    sum += 0.3;
    total / sum
}

/// The change in feeling after a choice, as the lesson the network learns.
pub fn reward(before: f32, after: f32) -> f32 {
    (after - before) * REWARD_SCALE
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
struct Pending {
    inputs: Inputs,
    choice: usize,
    reward: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DailyNet {
    weights: Vec<f32>,
    steps: u32,
    pending: Option<Pending>,
}

impl Default for DailyNet {
    /// An untrained network that has no say. Used for saves made before
    /// networks existed.
    fn default() -> Self {
        Self {
            weights: vec![0.0; PARAMS],
            steps: 0,
            pending: None,
        }
    }
}

impl DailyNet {
    /// A person's first network. It is different for everyone, because it is
    /// drawn from their genome, and small, so life teaches it most of what it
    /// knows.
    pub fn from_genome(genome: &Genome) -> Self {
        let mut seed: u64 = 0xcbf2_9ce4_8422_2325;
        for gene in Gene::ALL {
            seed ^= u64::from(genome.get(gene).to_bits());
            seed = seed.wrapping_mul(0x0000_0100_0000_01b3);
        }
        let mut rng = Rng::new(seed ^ 0x6e65_7475_7265);
        let mut weights = vec![0.0; PARAMS];
        let hidden_scale = 1.0 / (INPUTS as f32).sqrt();
        for w in &mut weights[W1..B1] {
            *w = (rng.next_f32() * 2.0 - 1.0) * hidden_scale;
        }
        for w in &mut weights[W2..B2] {
            *w = (rng.next_f32() * 2.0 - 1.0) * 0.15;
        }
        Self {
            weights,
            steps: 0,
            pending: None,
        }
    }

    pub fn is_valid(&self) -> bool {
        let pending_ok = match &self.pending {
            None => true,
            Some(p) => {
                p.choice < CHOICES && p.reward.is_finite() && p.inputs.iter().all(|v| v.is_finite())
            }
        };
        pending_ok
            && self.weights.len() == PARAMS
            && self
                .weights
                .iter()
                .all(|w| w.is_finite() && w.abs() <= WEIGHT_LIMIT)
    }

    /// Learning updates so far.
    pub fn steps(&self) -> u32 {
        self.steps
    }

    /// How much say the network has, from 0 (none) to a cap below 1.
    pub fn trust(&self) -> f32 {
        (self.steps as f32 / TRUST_STEPS).min(1.0) * MAX_TRUST
    }

    fn forward(&self, x: &Inputs) -> ([f32; HIDDEN], [f32; CHOICES]) {
        let w = &self.weights;
        let mut hidden = [0.0; HIDDEN];
        for (j, h) in hidden.iter_mut().enumerate() {
            let mut sum = w[B1 + j];
            for (i, value) in x.iter().enumerate() {
                sum += w[W1 + j * INPUTS + i] * value;
            }
            *h = sum.tanh();
        }
        let mut out = [0.0; CHOICES];
        for (c, q) in out.iter_mut().enumerate() {
            let mut sum = w[B2 + c];
            for (j, h) in hidden.iter().enumerate() {
                sum += w[W2 + c * HIDDEN + j] * h;
            }
            *q = sum.clamp(-VALUE_LIMIT, VALUE_LIMIT);
        }
        (hidden, out)
    }

    /// The learned value of each choice in this situation.
    pub fn values(&self, x: &Inputs) -> [f32; CHOICES] {
        self.forward(x).1
    }

    /// How much to add to the score of each choice.
    pub fn nudges(&self, x: &Inputs) -> [f32; CHOICES] {
        let trust = self.trust();
        let mut out = self.values(x);
        for value in &mut out {
            *value *= trust * PULL;
        }
        out
    }

    /// Keep what just happened so the next tick can learn from it.
    pub fn remember(&mut self, inputs: Inputs, action: Action, reward: f32) {
        self.pending = Some(Pending {
            inputs,
            choice: slot(action),
            reward: reward.clamp(-VALUE_LIMIT, VALUE_LIMIT),
        });
    }

    /// Forget a pending lesson (for example while in prison).
    pub fn forget_pending(&mut self) {
        self.pending = None;
    }

    /// Learn from the last choice now that its result and the new situation
    /// are known.
    pub fn learn_from_pending(&mut self, next: &Inputs, open: &Allowed) {
        let Some(last) = self.pending.take() else {
            return;
        };
        let future = self
            .values(next)
            .iter()
            .zip(open)
            .filter(|(_, ok)| **ok)
            .map(|(q, _)| *q)
            .fold(f32::MIN, f32::max);
        let future = if future == f32::MIN { 0.0 } else { future };
        let target = (last.reward + DISCOUNT * future).clamp(-VALUE_LIMIT, VALUE_LIMIT);
        self.train(&last.inputs, last.choice, target);
        self.steps = self.steps.saturating_add(1);
    }

    /// One step of backpropagation on the chosen output only.
    fn train(&mut self, x: &Inputs, choice: usize, target: f32) {
        let (hidden, out) = self.forward(x);
        let error = (out[choice] - target).clamp(-ERROR_LIMIT, ERROR_LIMIT);
        let mut back = [0.0; HIDDEN];
        for (j, b) in back.iter_mut().enumerate() {
            *b = error * self.weights[W2 + choice * HIDDEN + j] * (1.0 - hidden[j] * hidden[j]);
        }
        for (j, h) in hidden.iter().enumerate() {
            let w = &mut self.weights[W2 + choice * HIDDEN + j];
            *w = (*w - LEARNING_RATE * error * h).clamp(-WEIGHT_LIMIT, WEIGHT_LIMIT);
        }
        let bias = &mut self.weights[B2 + choice];
        *bias = (*bias - LEARNING_RATE * error).clamp(-WEIGHT_LIMIT, WEIGHT_LIMIT);
        for (j, b) in back.iter().enumerate() {
            for (i, value) in x.iter().enumerate() {
                let w = &mut self.weights[W1 + j * INPUTS + i];
                *w = (*w - LEARNING_RATE * b * value).clamp(-WEIGHT_LIMIT, WEIGHT_LIMIT);
            }
            let bias = &mut self.weights[B1 + j];
            *bias = (*bias - LEARNING_RATE * b).clamp(-WEIGHT_LIMIT, WEIGHT_LIMIT);
        }
    }

    /// A child starts from their own network, pulled toward what both
    /// parents learned. They keep only a small part of the parents' trust.
    pub fn blend(own: &DailyNet, a: &DailyNet, b: &DailyNet) -> DailyNet {
        let weights = (0..PARAMS)
            .map(|i| 0.5 * own.weights[i] + 0.25 * a.weights[i] + 0.25 * b.weights[i])
            .collect();
        DailyNet {
            weights,
            steps: a.steps.saturating_add(b.steps) / 8,
            pending: None,
        }
    }

    /// Changes whenever anything was learned. Used to check runs repeat exactly.
    pub fn fingerprint(&self) -> u64 {
        let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
        for w in &self.weights {
            hash ^= u64::from(w.to_bits());
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
        hash ^ u64::from(self.steps)
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

    fn situation() -> Inputs {
        let mut x = [0.5; INPUTS];
        x[0] = 0.3;
        x
    }

    #[test]
    fn a_network_has_a_hidden_layer_and_a_few_hundred_weights() {
        assert_eq!(PARAMS, 13 * 8 + 8 + 6 * 8 + 6);
        let net = DailyNet::from_genome(&genome(|_| {}));
        assert_eq!(net.weights.len(), PARAMS);
        assert!(net.is_valid());
        assert!(net.values(&situation()).iter().all(|q| q.is_finite()));
    }

    #[test]
    fn every_person_starts_with_a_different_network() {
        let a = DailyNet::from_genome(&genome(|g| g[0] = 0.2));
        let b = DailyNet::from_genome(&genome(|g| g[0] = 0.8));
        assert_ne!(a.fingerprint(), b.fingerprint());
        let again = DailyNet::from_genome(&genome(|g| g[0] = 0.2));
        assert_eq!(a, again);
    }

    #[test]
    fn an_untrained_default_network_has_no_say() {
        let net = DailyNet::default();
        assert!(net.is_valid());
        assert!(net.nudges(&situation()).iter().all(|q| *q == 0.0));
    }

    #[test]
    fn the_network_learns_which_choice_feels_better() {
        let mut net = DailyNet::from_genome(&genome(|_| {}));
        let x = situation();
        let open = [true; CHOICES];
        for _ in 0..600 {
            net.remember(x, Action::Rest, 1.0);
            net.learn_from_pending(&x, &open);
            net.remember(x, Action::Wander, -0.5);
            net.learn_from_pending(&x, &open);
        }
        let q = net.values(&x);
        assert!(
            q[slot(Action::Rest)] > q[slot(Action::Wander)] + 0.5,
            "{q:?}"
        );
        assert_eq!(net.steps(), 1200);
        assert!(net.is_valid());
    }

    #[test]
    fn learning_changes_the_network_and_trust_grows_slowly() {
        let mut net = DailyNet::from_genome(&genome(|_| {}));
        let before = net.fingerprint();
        assert_eq!(net.trust(), 0.0);
        let x = situation();
        net.remember(x, Action::Eat, 1.0);
        net.learn_from_pending(&x, &[true; CHOICES]);
        assert_ne!(before, net.fingerprint());
        assert!(net.trust() > 0.0 && net.trust() < 0.01);
    }

    #[test]
    fn learning_never_runs_away() {
        let mut net = DailyNet::from_genome(&genome(|_| {}));
        let x = situation();
        for i in 0..5000 {
            let action = CHOICE_ORDER[i % CHOICES];
            net.remember(x, action, if i % 2 == 0 { 50.0 } else { -50.0 });
            net.learn_from_pending(&x, &[true; CHOICES]);
        }
        assert!(net.is_valid());
        assert!(net.trust() <= MAX_TRUST);
    }

    #[test]
    fn closed_choices_are_not_counted_as_future_value() {
        let mut net = DailyNet::from_genome(&genome(|_| {}));
        let x = situation();
        let mut open = [false; CHOICES];
        open[slot(Action::Rest)] = true;
        net.remember(x, Action::Rest, 0.0);
        net.learn_from_pending(&x, &open);
        assert_eq!(net.steps(), 1);
    }

    #[test]
    fn children_blend_both_parents_and_keep_little_trust() {
        let a = DailyNet::from_genome(&genome(|g| g[1] = 0.1));
        let b = DailyNet::from_genome(&genome(|g| g[1] = 0.9));
        let own = DailyNet::from_genome(&genome(|g| g[1] = 0.5));
        let mut trained = a.clone();
        trained.steps = 4000;
        let child = DailyNet::blend(&own, &trained, &b);
        assert!(child.is_valid());
        assert!(child.steps() < trained.steps());
        assert_ne!(child.fingerprint(), own.fingerprint());
    }

    #[test]
    fn rewards_follow_the_change_in_feeling() {
        assert!(reward(0.5, 0.6) > 0.0);
        assert!(reward(0.6, 0.5) < 0.0);
        assert_eq!(reward(0.5, 0.5), 0.0);
    }

    #[test]
    fn in_an_emergency_the_old_rules_decide_alone() {
        use crate::agent::Agent;
        let mut agent = Agent::new(0, "Test".into(), genome(|_| {}), (0, 0), 50);
        agent.needs.hunger = 0.05;
        // A network that strongly dislikes eating and loves wandering.
        let mut weights = vec![0.0; PARAMS];
        weights[B2 + slot(Action::Eat)] = -4.0;
        weights[B2 + slot(Action::Wander)] = 4.0;
        agent.brain.daily = DailyNet {
            weights,
            steps: 10_000,
            pending: None,
        };
        let percept = Percept {
            food_underfoot: true,
            meal_affordable: true,
            ..Percept::default()
        };
        let x = inputs(&agent, &percept);
        for seed in 0..20 {
            let choice = agent.choose_action_with(&percept, &x, true, &mut Rng::new(seed));
            assert_eq!(choice, Action::Eat);
        }
        // When not in danger, the same network does change the choice.
        agent.needs.hunger = 0.7;
        let x = inputs(&agent, &percept);
        let changed = (0..20)
            .filter(|seed| {
                agent.choose_action_with(&percept, &x, true, &mut Rng::new(*seed)) == Action::Wander
            })
            .count();
        assert!(changed > 10, "{changed}");
    }
}