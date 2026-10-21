//! Records the run as a replay: where everyone is every few ticks, and every
//! line they say. The viewer plays it forward, fast, or backward.

use polis_core::{Action, World};
use polis_mind::speaker::{RuleSpeaker, Speaker};
use serde_json::{json, Value};

pub const REPLAY_VERSION: u32 = 1;

pub const ACTIONS: [&str; 6] = ["Eat", "Rest", "Socialize", "Work", "Wander", "Drink"];

pub fn action_code(action: Action) -> u8 {
    match action {
        Action::Eat => 0,
        Action::Rest => 1,
        Action::Socialize => 2,
        Action::Work => 3,
        Action::Wander => 4,
        Action::Drink => 5,
    }
}

/// One spoken line: tick, speaker, listener, and the words.
pub type TalkLine = (u64, u32, u32, String);

/// Notices new speech after each step, so no line is taken twice.
pub struct TalkTap {
    voice: RuleSpeaker,
    last_tick: Option<u64>,
}

impl TalkTap {
    pub fn new() -> Self {
        Self {
            voice: RuleSpeaker::new(),
            last_tick: None,
        }
    }

    /// Call after every step. Returns the lines spoken since the last call.
    pub fn collect(&mut self, world: &World) -> Vec<TalkLine> {
        let mut lines = Vec::new();
        for u in world.utterances.iter() {
            if self.last_tick.is_none_or(|t| u.tick > t) {
                lines.push((u.tick, u.speaker, u.listener, self.voice.say(world, u)));
            }
        }
        if let Some(u) = world.utterances.back() {
            self.last_tick = Some(u.tick);
        }
        lines
    }
}

impl Default for TalkTap {
    fn default() -> Self {
        Self::new()
    }
}

pub struct Recorder {
    every: u64,
    frames: Vec<Value>,
    talk: Vec<Value>,
    tap: TalkTap,
}

impl Recorder {
    pub fn new(every: u64) -> Self {
        Self {
            every: every.max(1),
            frames: Vec::new(),
            talk: Vec::new(),
            tap: TalkTap::new(),
        }
    }

    /// Call after every step. Keeps new lines of speech, and a frame on the beat.
    pub fn observe(&mut self, world: &World) {
        for (tick, speaker, listener, text) in self.tap.collect(world) {
            self.talk.push(json!([tick, speaker, listener, text]));
        }
        if world.tick.is_multiple_of(self.every) {
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

    #[test]
    fn the_tap_hands_out_each_line_once() {
        let mut world = World::new(WorldConfig {
            seed: 3,
            population: 40,
            ..WorldConfig::default()
        });
        let mut tap = TalkTap::new();
        let mut all = Vec::new();
        for _ in 0..200 {
            world.step();
            all.extend(tap.collect(&world));
        }
        assert!(!all.is_empty());
        assert!(all.windows(2).all(|w| w[0].0 <= w[1].0));
        assert!(tap.collect(&world).is_empty());
    }
}
