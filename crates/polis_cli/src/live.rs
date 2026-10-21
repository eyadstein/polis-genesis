//! The living town. It keeps running with no end, remembers the last stretch
//! of time so the viewer can catch up, and takes commands while it runs.

use crate::export;
use crate::replay::{action_code, TalkLine, TalkTap};
use polis_core::{World, WorldConfig};
use serde_json::{json, Value};
use std::collections::VecDeque;

const FRAME_BUFFER: usize = 4000;
const TALK_BUFFER: usize = 20_000;
const HISTORY_EVERY: u64 = 100;
const HISTORY_LIMIT: usize = 2000;
const MAX_FRAMES_PER_REPLY: usize = 2000;

pub const MAX_NEWCOMERS: u32 = 100;
pub const MIN_SPEED: f64 = 0.05;
pub const MAX_SPEED: f64 = 200.0;
pub const DEFAULT_SPEED: f64 = 2.0;

struct Row {
    id: u32,
    x: i32,
    y: i32,
    action: u8,
    jailed: bool,
}

struct Frame {
    seq: u64,
    tick: u64,
    rows: Vec<Row>,
}

pub struct Engine {
    world: World,
    tap: TalkTap,
    frames: VecDeque<Frame>,
    next_seq: u64,
    talk: VecDeque<TalkLine>,
    talk_total: u64,
    history: Vec<Value>,
    pub paused: bool,
    pub speed: f64,
}

fn rows_of(world: &World) -> Vec<Row> {
    world
        .agents
        .iter()
        .filter(|a| a.is_alive())
        .map(|a| Row {
            id: a.id,
            x: a.pos.0,
            y: a.pos.1,
            action: action_code(a.action),
            jailed: a.jailed_until.is_some(),
        })
        .collect()
}

impl Engine {
    #[cfg(test)]
    pub fn new(config: WorldConfig) -> Self {
        let world = World::new(config);
        Self::from_world(world)
    }

    pub fn try_new(config: WorldConfig) -> Result<Self, String> {
        World::try_new(config).map(Self::from_world)
    }

    fn from_world(world: World) -> Self {
        let history = vec![export::history_point(&world)];
        let mut engine = Self {
            world,
            tap: TalkTap::new(),
            frames: VecDeque::new(),
            next_seq: 1,
            talk: VecDeque::new(),
            talk_total: 0,
            history,
            paused: false,
            speed: DEFAULT_SPEED,
        };
        engine.record_frame();
        engine
    }

    pub fn alive(&self) -> usize {
        self.world.agents.iter().filter(|a| a.is_alive()).count()
    }

    fn record_frame(&mut self) {
        let frame = Frame {
            seq: self.next_seq,
            tick: self.world.tick,
            rows: rows_of(&self.world),
        };
        self.next_seq += 1;
        if self
            .frames
            .back()
            .is_some_and(|last| last.tick == frame.tick)
        {
            self.frames.pop_back();
        }
        self.frames.push_back(frame);
        while self.frames.len() > FRAME_BUFFER {
            self.frames.pop_front();
        }
    }

    /// Advance one tick and remember what happened.
    pub fn step(&mut self) {
        self.world.step();
        for line in self.tap.collect(&self.world) {
            self.talk.push_back(line);
            self.talk_total += 1;
        }
        while self.talk.len() > TALK_BUFFER {
            self.talk.pop_front();
        }
        self.record_frame();
        if self.world.tick.is_multiple_of(HISTORY_EVERY) {
            self.history.push(export::history_point(&self.world));
            if self.history.len() > HISTORY_LIMIT {
                self.history.remove(1);
            }
        }
    }

    /// Change the clock. Anything out of range is refused, nothing is half applied.
    pub fn set_clock(&mut self, paused: Option<bool>, speed: Option<f64>) -> Result<(), String> {
        if let Some(speed) = speed {
            if !speed.is_finite() || !(MIN_SPEED..=MAX_SPEED).contains(&speed) {
                return Err(format!(
                    "speed must be between {MIN_SPEED} and {MAX_SPEED} ticks per second"
                ));
            }
        }
        if let Some(paused) = paused {
            self.paused = paused;
        }
        if let Some(speed) = speed {
            self.speed = speed;
        }
        Ok(())
    }

    /// Strangers walk into town. They show up in the very next frame, even while paused.
    pub fn add_people(&mut self, count: u32) -> Result<Vec<u32>, String> {
        if count == 0 || count > MAX_NEWCOMERS {
            return Err(format!("count must be between 1 and {MAX_NEWCOMERS}"));
        }
        let ids = self.world.add_newcomers(count);
        self.record_frame();
        Ok(ids)
    }

    /// Everything since the viewer last asked: frames after `after_seq`, and speech from line `talk_after` on.
    pub fn since(&self, after_seq: u64, talk_after: u64, limit: usize) -> Value {
        let limit = limit.clamp(1, MAX_FRAMES_PER_REPLY);
        let frames: Vec<Value> = self
            .frames
            .iter()
            .filter(|f| f.seq > after_seq)
            .take(limit)
            .map(|f| {
                let rows: Vec<Value> = f
                    .rows
                    .iter()
                    .map(|r| json!([r.id, r.x, r.y, r.action, u8::from(r.jailed)]))
                    .collect();
                json!({ "seq": f.seq, "tick": f.tick, "p": rows })
            })
            .collect();
        let first_kept = self.talk_total - self.talk.len() as u64;
        let skip = talk_after.saturating_sub(first_kept) as usize;
        let talk: Vec<Value> = self
            .talk
            .iter()
            .skip(skip)
            .map(|(tick, speaker, listener, text)| json!([tick, speaker, listener, text]))
            .collect();
        json!({
            "seq": self.next_seq - 1,
            "tick": self.world.tick,
            "paused": self.paused,
            "speed": self.speed,
            "alive": self.alive(),
            "width": self.world.width,
            "height": self.world.height,
            "frames": frames,
            "talk": talk,
            "talk_total": self.talk_total,
        })
    }

    /// The whole town as it is now, in the same format as the town file.
    pub fn town(&self) -> Value {
        export::snapshot(&self.world, &self.history)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engine() -> Engine {
        Engine::new(WorldConfig {
            seed: 4,
            population: 40,
            ..WorldConfig::default()
        })
    }

    #[test]
    fn it_starts_with_a_first_frame() {
        let e = engine();
        let reply = e.since(0, 0, 10);
        assert_eq!(reply["frames"].as_array().unwrap().len(), 1);
        assert_eq!(reply["tick"], 0);
        assert_eq!(reply["alive"], 40);
    }

    #[test]
    fn it_runs_without_end_and_keeps_only_the_recent_past() {
        let mut e = engine();
        for _ in 0..(FRAME_BUFFER + 50) {
            e.step();
        }
        assert_eq!(e.frames.len(), FRAME_BUFFER);
        assert_eq!(e.world.tick, (FRAME_BUFFER + 50) as u64);
        assert!(e.talk.len() <= TALK_BUFFER);
        assert!(e.history.len() <= HISTORY_LIMIT);
    }

    #[test]
    fn the_viewer_only_gets_what_is_new() {
        let mut e = engine();
        for _ in 0..5 {
            e.step();
        }
        let first = e.since(0, 0, 100);
        let seq = first["seq"].as_u64().unwrap();
        let talk_total = first["talk_total"].as_u64().unwrap();
        assert_eq!(first["frames"].as_array().unwrap().len(), 6);
        let nothing = e.since(seq, talk_total, 100);
        assert!(nothing["frames"].as_array().unwrap().is_empty());
        assert!(nothing["talk"].as_array().unwrap().is_empty());
        e.step();
        e.step();
        let more = e.since(seq, talk_total, 100);
        assert_eq!(more["frames"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn speech_is_handed_out_once() {
        let mut e = engine();
        let mut seen = 0;
        let mut talk_total = 0;
        let mut seq = 0;
        for _ in 0..300 {
            e.step();
            let reply = e.since(seq, talk_total, 100);
            seen += reply["talk"].as_array().unwrap().len() as u64;
            talk_total = reply["talk_total"].as_u64().unwrap();
            seq = reply["seq"].as_u64().unwrap();
        }
        assert!(seen > 0);
        assert_eq!(seen, talk_total);
    }

    #[test]
    fn the_clock_refuses_nonsense() {
        let mut e = engine();
        assert!(e.set_clock(Some(true), Some(5.0)).is_ok());
        assert!(e.paused);
        assert_eq!(e.speed, 5.0);
        assert!(e.set_clock(Some(false), Some(0.0)).is_err());
        assert!(e.set_clock(None, Some(f64::NAN)).is_err());
        assert!(e.set_clock(None, Some(1000.0)).is_err());
        assert!(e.paused);
        assert_eq!(e.speed, 5.0);
        assert!(e.set_clock(None, None).is_ok());
    }

    #[test]
    fn newcomers_appear_at_once_even_while_paused() {
        let mut e = engine();
        e.set_clock(Some(true), None).unwrap();
        let before = e.since(0, 0, 100);
        let seq = before["seq"].as_u64().unwrap();
        let ids = e.add_people(3).unwrap();
        assert_eq!(ids, vec![40, 41, 42]);
        let after = e.since(seq, 0, 100);
        let frames = after["frames"].as_array().unwrap();
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0]["p"].as_array().unwrap().len(), 43);
        assert_eq!(frames[0]["tick"], before["tick"]);
        assert_eq!(e.alive(), 43);
    }

    #[test]
    fn arrivals_are_limited() {
        let mut e = engine();
        assert!(e.add_people(0).is_err());
        assert!(e.add_people(MAX_NEWCOMERS + 1).is_err());
        assert!(e.add_people(MAX_NEWCOMERS).is_ok());
    }

    #[test]
    fn the_town_file_matches_the_file_format() {
        let mut e = engine();
        e.add_people(2).unwrap();
        e.step();
        let town = e.town();
        assert_eq!(town["version"], export::FORMAT_VERSION);
        assert_eq!(town["people"].as_array().unwrap().len(), 42);
        assert_eq!(town["tick"], 1);
    }
}
