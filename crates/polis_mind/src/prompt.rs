//! The inner voice. Builds what a person would think to themselves, in the
//! first person, from what they perceive and remember. It never names
//! anything outside their world.

use crate::persona::describe;
use polis_core::{Act, Agent, AgentId, Event, Kind, Memory, Utterance, World};

/// Ticks that make up one year of a person's life.
pub const TICKS_PER_YEAR: u32 = 500;

fn name_of(world: &World, id: AgentId) -> &str {
    &world.agents[id as usize].name
}

fn kind_word(kind: Kind) -> &'static str {
    match kind {
        Kind::Shack => "shack",
        Kind::Flat => "flat",
        Kind::House => "house",
        Kind::Villa => "villa",
    }
}

/// How the body and spirit feel, in a few words.
pub fn feeling(agent: &Agent) -> &'static str {
    if agent.needs.hunger < 0.25 {
        "very hungry"
    } else if agent.needs.energy < 0.25 {
        "worn out"
    } else if agent.mood.valence > 0.4 {
        "happy"
    } else if agent.mood.valence > 0.1 {
        "content"
    } else if agent.mood.valence > -0.2 {
        "uneasy"
    } else {
        "low"
    }
}

/// One memory as a sentence a person might think.
pub fn memory_sentence(world: &World, memory: &Memory) -> String {
    let who = memory.about.map(|id| name_of(world, id));
    match (memory.event, who) {
        (Event::Chatted, Some(n)) if memory.valence > 0.0 => {
            format!("You enjoyed talking with {n}.")
        }
        (Event::Chatted, Some(n)) => format!("Talking with {n} left you uneasy."),
        (Event::Argued, Some(n)) => format!("You quarrelled with {n}."),
        (Event::Confided, Some(n)) => format!("{n} confided in you."),
        (Event::Gossiped, Some(n)) if memory.valence < 0.0 => {
            format!("You heard something worrying about {n}.")
        }
        (Event::Gossiped, Some(n)) => format!("You heard good things about {n}."),
        (Event::Paired, Some(n)) => format!("You fell in love with {n}."),
        (Event::Bereaved, Some(n)) => format!("You lost {n}, and it still weighs on you."),
        (Event::Birth, Some(n)) => format!("{n} was born to you."),
        (Event::Evicted, _) => "You lost your home.".to_string(),
        _ => "Something stays with you.".to_string(),
    }
}

/// Who a person is and what is on their mind, in the second person.
pub fn inner_voice(world: &World, id: AgentId) -> String {
    let agent = &world.agents[id as usize];
    let years = agent.age / TICKS_PER_YEAR;
    let mut lines = vec![format!(
        "You are {}, {} years old, {}.",
        agent.name,
        years,
        describe(&agent.genome)
    )];
    if let Some(index) = agent.home {
        let home = &world.economy.realty.homes[index];
        lines.push(format!(
            "You live in a {} with {} rooms.",
            kind_word(home.kind),
            home.rooms
        ));
    } else {
        lines.push("You have no home of your own.".to_string());
    }
    if let Some(job) = agent.job {
        lines.push(format!(
            "You work as a {}.",
            format!("{job:?}").to_lowercase()
        ));
    } else if agent.is_adult() {
        lines.push("You are looking for work.".to_string());
    }
    lines.push(format!(
        "You have about {} coins. You feel {}.",
        agent.money,
        feeling(agent)
    ));
    if let Some(partner) = agent.partner {
        lines.push(format!("Your partner is {}.", name_of(world, partner)));
    }
    let mut vivid: Vec<&Memory> = agent.mind.memories.iter().collect();
    vivid.sort_by(|a, b| b.strength.total_cmp(&a.strength));
    for memory in vivid.into_iter().take(3) {
        lines.push(memory_sentence(world, memory));
    }
    lines.join(" ")
}

fn warmth_word(warmth: f32) -> &'static str {
    if warmth > 0.3 {
        "warmly"
    } else if warmth < -0.2 {
        "coldly"
    } else {
        "neutrally"
    }
}

/// Everything needed to put words in a speaker's mouth.
pub fn conversation_prompt(world: &World, u: &Utterance) -> String {
    let speaker = &world.agents[u.speaker as usize];
    let listener = name_of(world, u.listener);
    let intent = match (u.act, u.about) {
        (Act::Smalltalk, _) => "You make small talk.".to_string(),
        (Act::Gossip, Some(third)) => {
            let known = speaker
                .mind
                .memories
                .iter()
                .filter(|m| m.about == Some(third))
                .max_by(|a, b| a.strength.total_cmp(&b.strength))
                .map(|m| memory_sentence(world, m))
                .unwrap_or_default();
            format!(
                "You want to tell them about {}. {}",
                name_of(world, third),
                known
            )
        }
        (Act::Gossip, None) => "You make small talk.".to_string(),
        (Act::Confide, _) => format!(
            "You decide to confide in them about how you feel, which is {}.",
            feeling(speaker)
        ),
        (Act::Quarrel, _) => "You are angry with them and you say so.".to_string(),
    };
    format!(
        "{}\n\nYou are speaking with {} and you feel {} toward them. {}\n\
         Say it in one or two plain sentences, in your own voice, as {}. \
         Reply with only what you say.",
        inner_voice(world, u.speaker),
        listener,
        warmth_word(u.warmth),
        intent,
        speaker.name
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filter::leaks;
    use polis_core::WorldConfig;

    fn town() -> World {
        let mut world = World::new(WorldConfig {
            seed: 5,
            width: 40,
            height: 40,
            population: 120,
        });
        world.run(5000);
        world
    }

    #[test]
    fn nobody_ever_hears_of_the_outside() {
        let world = town();
        for agent in &world.agents {
            let voice = inner_voice(&world, agent.id);
            assert!(!leaks(&voice), "{voice}");
            assert!(voice.contains(&agent.name));
        }
    }

    #[test]
    fn conversation_prompts_stay_inside_the_world() {
        let world = town();
        assert!(!world.utterances.is_empty());
        for u in &world.utterances {
            let prompt = conversation_prompt(&world, u);
            assert!(!leaks(&prompt), "{prompt}");
            assert!(prompt.contains(&world.agents[u.listener as usize].name));
        }
    }

    #[test]
    fn people_know_their_age_in_years() {
        let world = town();
        let agent = &world.agents[0];
        let voice = inner_voice(&world, 0);
        assert!(voice.contains(&format!("{} years old", agent.age / TICKS_PER_YEAR)));
    }

    #[test]
    fn memories_become_sentences_with_names() {
        let world = town();
        let memory = Memory::new(0, Event::Paired, Some(3), 1.0, 1.0);
        let sentence = memory_sentence(&world, &memory);
        assert!(sentence.contains(&world.agents[3].name));
        assert!(sentence.contains("love"));
        let evicted = Memory::new(0, Event::Evicted, None, -0.8, 1.0);
        assert_eq!(memory_sentence(&world, &evicted), "You lost your home.");
    }
}
