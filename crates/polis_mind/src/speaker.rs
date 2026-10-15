//! Finding words for what people do.

use crate::prompt::feeling;
use polis_core::{Act, Reply, Utterance, World};

/// Anything that can put an utterance into words.
pub trait Speaker {
    fn say(&mut self, world: &World, utterance: &Utterance) -> String;
}

/// Free, instant, and exactly repeatable. Chooses from plain templates by
/// act, by how warm the speaker feels, and by what they know.
#[derive(Clone, Debug, Default)]
pub struct RuleSpeaker;

impl RuleSpeaker {
    pub fn new() -> Self {
        Self
    }
}

const WARM_SMALLTALK: [&str; 3] = [
    "{l}, it is good to see you. How have your days been?",
    "There you are, {l}. I was hoping we would cross paths.",
    "{l}, you always make the street feel friendlier.",
];
const COOL_SMALLTALK: [&str; 3] = [
    "{l}. Fine weather, I suppose.",
    "Oh, {l}. I did not expect to see you here.",
    "{l}. Busy day for everyone.",
];
const PLAIN_SMALLTALK: [&str; 3] = [
    "Good day, {l}. How are things with you?",
    "{l}, how is the work going?",
    "Morning, {l}. Did you sleep well?",
];
const KIND_GOSSIP: [&str; 2] = [
    "{l}, have you heard about {t}? People say {t} has been kind lately.",
    "{l}, I met {t} the other day. A good soul, I think.",
];
const SOUR_GOSSIP: [&str; 2] = [
    "{l}, I would keep my distance from {t}. I did not like what I saw.",
    "{l}, have you heard about {t}? Nothing good, I am afraid.",
];
const CONFIDE: [&str; 3] = [
    "I do not tell everyone this, {l}, but lately I have been feeling {m}.",
    "{l}, can I say something? I am feeling {m} and I needed someone to hear it.",
    "You are one of the few I trust, {l}. I am feeling {m} these days.",
];
const QUARREL: [&str; 3] = [
    "I am tired of how you treat people, {l}.",
    "{l}, we need to talk, and you will not like it.",
    "I have had enough of your ways, {l}.",
];

const GREETING: [&str; 3] = ["Good morning, {l}.", "Hello, {l}.", "{l}! Hello there."];
const GREETED_BACK: [&str; 3] = [
    "{l} greets {s} back.",
    "{l} smiles and says hello.",
    "{l} answers warmly.",
];
const NODDED: [&str; 3] = [
    "{l} gives a short nod and walks on.",
    "{l} nods, but says nothing.",
    "{l} answers with a quick nod.",
];
const IGNORED: [&str; 3] = [
    "{l} looks away and says nothing.",
    "{l} walks past as if {s} was not there.",
    "{l} pretends not to hear.",
];

fn pick<'a>(options: &[&'a str], u: &Utterance) -> &'a str {
    let seed = u.tick * 31 + u64::from(u.speaker) * 17 + u64::from(u.listener) * 13;
    options[(seed % options.len() as u64) as usize]
}

impl Speaker for RuleSpeaker {
    fn say(&mut self, world: &World, u: &Utterance) -> String {
        let speaker = &world.agents[u.speaker as usize];
        let listener = &world.agents[u.listener as usize].name;
        let third = u
            .about
            .map_or("someone", |id| world.agents[id as usize].name.as_str());
        let template = match u.act {
            Act::Smalltalk if u.warmth > 0.3 => pick(&WARM_SMALLTALK, u),
            Act::Smalltalk if u.warmth < -0.2 => pick(&COOL_SMALLTALK, u),
            Act::Smalltalk => pick(&PLAIN_SMALLTALK, u),
            Act::Gossip => {
                let opinion = u
                    .about
                    .and_then(|id| speaker.mind.feeling_about(id))
                    .unwrap_or(0.0);
                if opinion < 0.0 {
                    pick(&SOUR_GOSSIP, u)
                } else {
                    pick(&KIND_GOSSIP, u)
                }
            }
            Act::Confide => pick(&CONFIDE, u),
            Act::Quarrel => pick(&QUARREL, u),
        };
        let spoken = template
            .replace("{l}", listener)
            .replace("{t}", third)
            .replace("{m}", feeling(speaker));
        let line = match u.reply {
            Reply::Greeted => format!("{} {spoken}", pick(&GREETED_BACK, u)),
            Reply::Nodded => format!("{} {}", pick(&GREETING, u), pick(&NODDED, u)),
            Reply::Ignored => format!("{} {}", pick(&GREETING, u), pick(&IGNORED, u)),
        };
        line.replace("{l}", listener).replace("{s}", &speaker.name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filter::leaks;
    use polis_core::{Reply, WorldConfig};

    fn town() -> World {
        let mut world = World::new(WorldConfig {
            seed: 11,
            width: 40,
            height: 40,
            population: 120,
        });
        world.run(5000);
        world
    }

    #[test]
    fn every_conversation_gets_words_that_name_the_listener() {
        let world = town();
        assert!(!world.utterances.is_empty());
        let mut voice = RuleSpeaker::new();
        for u in &world.utterances {
            let text = voice.say(&world, u);
            assert!(!text.is_empty());
            assert!(text.contains(&world.agents[u.listener as usize].name));
            assert!(!text.contains('{') && !text.contains('}'));
        }
    }

    #[test]
    fn gossip_names_the_person_talked_about() {
        let world = town();
        let mut voice = RuleSpeaker::new();
        let gossip: Vec<_> = world
            .utterances
            .iter()
            .filter(|u| u.act == Act::Gossip)
            .collect();
        assert!(!gossip.is_empty());
        for u in gossip {
            let about = u.about.expect("gossip is about someone");
            assert!(voice
                .say(&world, u)
                .contains(&world.agents[about as usize].name));
        }
    }

    #[test]
    fn speech_never_leaks_the_outside_and_is_repeatable() {
        let world = town();
        let mut first = RuleSpeaker::new();
        let mut second = RuleSpeaker::new();
        for u in &world.utterances {
            let a = first.say(&world, u);
            assert!(!leaks(&a), "{a}");
            assert_eq!(a, second.say(&world, u));
        }
    }

    #[test]
    fn different_acts_sound_different() {
        let world = town();
        let mut voice = RuleSpeaker::new();
        let mut seen = std::collections::BTreeSet::new();
        for u in &world.utterances {
            seen.insert(format!("{:?}", u.act));
            voice.say(&world, u);
        }
        assert!(seen.len() >= 2);
    }

    fn greeting(reply: Reply) -> Utterance {
        Utterance {
            tick: 7,
            speaker: 0,
            listener: 1,
            act: Act::Smalltalk,
            reply,
            about: None,
            warmth: 0.0,
        }
    }

    #[test]
    fn an_ignored_greeting_is_told_as_a_snub() {
        let world = town();
        let mut voice = RuleSpeaker::new();
        let name = &world.agents[1].name;
        let ignored = voice.say(&world, &greeting(Reply::Ignored));
        assert!(ignored.contains(name), "{ignored}");
        assert!(
            ["says nothing", "as if", "pretends"]
                .iter()
                .any(|w| ignored.contains(w)),
            "{ignored}"
        );
        assert!(!ignored.contains('{') && !ignored.contains('}'));
    }

    #[test]
    fn a_nod_and_a_greeting_back_each_sound_like_themselves() {
        let world = town();
        let mut voice = RuleSpeaker::new();
        let nodded = voice.say(&world, &greeting(Reply::Nodded));
        let greeted = voice.say(&world, &greeting(Reply::Greeted));
        assert!(nodded.contains("nod"), "{nodded}");
        assert!(
            ["back", "hello", "warmly"]
                .iter()
                .any(|w| greeted.contains(w)),
            "{greeted}"
        );
        assert!(!greeted.contains('{') && !greeted.contains('}'));
        assert_ne!(nodded, greeted);
    }
}
