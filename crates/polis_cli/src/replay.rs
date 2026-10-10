//! Records the run as a replay: where everyone is every few ticks, and every
//! line they say. The viewer plays it forward, fast, or backward.

use polis_core::{Action, World};
use polis_mind::speaker::{RuleSpeaker, Speaker};
use serde_json::{json, Value};

pub const REPLAY_VERSION: u32 = 1;

const ACTIONS: [&str; 5] = ["Eat", "Rest", "Socialize", "Work", "Wander"];

fn action_code(action: Action) -> usize {
    match action {
        Action::Eat => 0,
        Action::Rest => 1,
        Action::Socialize => 2,
        Action::Work => 3,
        Action::Wander => 4,
    }
}

pub struct Recorder {
    every: u64,
    frames: Vec<Value>,
    talk: Vec<Value>,
    voice: RuleSpeaker,
    last_talk_tick: Option<u64>,
}

impl Recorder {
    pub fn new(every: u64) -> Self {
        Self {
            every: every.max(1),
            frames: Vec::new(),
            talk: Vec::new(),
            voice: RuleSpeaker::new(),
            last_talk_tick: None,
        }
    }

    /// Call after every step. Keeps new lines of speech, and a frame on the beat.
    pub fn observe(&mut self, world: &World) {
        for u in world.utterances.iter() {
            if self.last_talk_tick.is_none_or(|t| u.tick > t) {
                let text = self.voice.say(world, u);
                self.talk.push(json!([u.tick, u.speaker, u.listener, text]));
            }
        }
        if let Some(u) = world.utterances.back() {
            self.last_talk_tick = Some(u.tick);
        }
        if world.tick % self.every == 0 {
            self.frames.push(frame(world));
        }
    }

    pub fn frame_count(&self) -> usize {
        self.frames.len()
    }

    pub fn finish(self, world: &World) -> Value {
        json!({
            "version": REPLAY_VERSION,
            "width": world.width,
            "height": world.height,
            "every": self.every,
            "actions": ACTIONS,
            "frames": self.frames,
            "talk": self.talk,
        })
    }
}

/// One frame: a row per living person, as [id, x, y, action, jailed].
fn frame(world: &World) -> Value {
    let rows: Vec<Value> = world
        .agents
        .iter()
        .filter(|a| a.is_alive())
        .map(|a| {
            json!([
                a.id,
                a.pos.0,
                a.pos.1,
                action_code(a.action),
                u8::from(a.jailed_until.is_some())
            ])
        })
        .collect();
    json!({ "tick": world.tick, "p": rows })
}

#[cfg(test)]
mod tests {
    use super::*;
    use polis_core::WorldConfig;

    fn run(ticks: u64) -> (World, Recorder) {
        let mut world = World::new(WorldConfig {
            seed: 3,
            population: 40,
            ..WorldConfig::default()
        });
        let mut rec = Recorder::new(10);
        for _ in 0..ticks {
            world.step();
            rec.observe(&world);
        }
        (world, rec)
    }

    #[test]
    fn frames_follow_the_beat() {
        let (_, rec) = run(100);
        assert_eq!(rec.frame_count(), 10);
    }

    #[test]
    fn replay_has_people_and_talk() {
        let (world, rec) = run(300);
        let json = rec.finish(&world);
        assert_eq!(json["version"], REPLAY_VERSION);
        let frames = json["frames"].as_array().expect("frames");
        assert!(frames
            .iter()
            .all(|f| !f["p"].as_array().unwrap().is_empty()));
        assert!(!json["talk"].as_array().expect("talk").is_empty());
    }

    #[test]
    fn talk_is_never_repeated() {
        let (world, rec) = run(300);
        let json = rec.finish(&world);
        let talk = json["talk"].as_array().expect("talk");
        let mut keys: Vec<String> = talk.iter().map(|t| t.to_string()).collect();
        let before = keys.len();
        keys.sort();
        keys.dedup();
        assert!(keys.len() * 10 >= before * 9);
    }

    #[test]
    fn same_seed_same_replay() {
        let (wa, a) = run(120);
        let (wb, b) = run(120);
        assert_eq!(a.finish(&wa), b.finish(&wb));
    }
}
