//! Writes the whole town as JSON so other languages can read it: Python for
//! analysis, and the TypeScript viewer in the browser.
//!
//! The format has a version number. Version 2 adds map positions, each
//! person's inner voice, districts, a history of the whole run, and the
//! recent conversations in words.

use polis_core::{report, Job, Stats, World};
use polis_mind::prompt::inner_voice;
use polis_mind::speaker::{RuleSpeaker, Speaker};
use serde_json::{json, Value};

pub const FORMAT_VERSION: u32 = 2;

fn job_name(job: Option<Job>) -> Value {
    match job {
        Some(job) => json!(format!("{job:?}")),
        None => Value::Null,
    }
}

/// One person, with everything a report or viewer needs.
fn person(world: &World, index: usize) -> Value {
    let a = &world.agents[index];
    let home = a.home.map(|h| &world.economy.realty.homes[h]);
    json!({
        "id": a.id,
        "name": a.name,
        "alive": a.is_alive(),
        "age": a.age,
        "adult": a.is_adult(),
        "generation": a.generation,
        "money": a.money,
        "job": job_name(a.job),
        "home": a.home,
        "home_kind": home.map(|h| format!("{:?}", h.kind)),
        "home_district": home.map(|h| h.district),
        "rent": home.map(|h| h.rent),
        "partner": a.partner,
        "parents": a.parents.map(|(x, y)| vec![x, y]),
        "record": a.record,
        "jailed": a.jailed_until.is_some(),
        "friends": a.mind.friends(),
        "mood": a.mood.valence,
        "hunger": a.needs.hunger,
        "x": a.pos.0,
        "y": a.pos.1,
        "voice": a.is_alive().then(|| inner_voice(world, a.id)),
    })
}

fn stats_json(s: &Stats) -> Value {
    json!({
        "alive": s.alive,
        "children": s.children,
        "couples": s.couples,
        "births": s.births,
        "max_generation": s.max_generation,
        "starved": s.starved,
        "mean_money": s.mean_money,
        "gini": s.gini,
        "employed": s.employed,
        "homeless": s.homeless,
        "homes": s.homes,
        "vacant": s.vacant,
        "mean_rent": s.mean_rent,
        "food_price": s.food_price,
        "friends": s.friends,
        "conversations": s.conversations,
        "gossips": s.gossips,
        "crimes": s.crimes,
        "convictions": s.convictions,
        "jailed": s.jailed,
        "treasury": s.treasury,
    })
}

/// A short record of the town at one moment, for charts over time.
pub fn history_point(world: &World) -> Value {
    let s = world.stats();
    json!({
        "tick": s.tick,
        "alive": s.alive,
        "children": s.children,
        "couples": s.couples,
        "gini": s.gini,
        "employed": s.employed,
        "homeless": s.homeless,
        "vacant": s.vacant,
        "mean_money": s.mean_money,
        "mean_rent": s.mean_rent,
        "crimes": s.crimes,
        "convictions": s.convictions,
        "treasury": s.treasury,
    })
}

fn districts(world: &World) -> Vec<Value> {
    report::districts(world)
        .iter()
        .map(|d| {
            json!({
                "id": d.district,
                "homes": d.homes,
                "appeal": d.appeal,
                "occupancy": d.occupancy,
                "neighbor_wealth": d.neighbor_wealth,
                "mean_rent": d.mean_rent,
            })
        })
        .collect()
}

fn conversations(world: &World) -> Vec<Value> {
    let mut voice = RuleSpeaker::new();
    world
        .utterances
        .iter()
        .map(|u| {
            json!({
                "tick": u.tick,
                "speaker": u.speaker,
                "listener": u.listener,
                "act": format!("{:?}", u.act),
                "about": u.about,
                "text": voice.say(world, u),
            })
        })
        .collect()
}

/// The whole town at this moment, with the history gathered so far.
pub fn snapshot(world: &World, history: &[Value]) -> Value {
    let s = world.stats();
    json!({
        "version": FORMAT_VERSION,
        "tick": world.tick,
        "width": world.width,
        "height": world.height,
        "stats": stats_json(&s),
        "justice": {
            "crimes": s.crimes,
            "convictions": s.convictions,
            "acquittals": world.justice.acquittals,
            "jailed": s.jailed,
            "treasury": s.treasury,
        },
        "history": history,
        "districts": districts(world),
        "people": (0..world.agents.len()).map(|i| person(world, i)).collect::<Vec<_>>(),
        "conversations": conversations(world),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use polis_core::WorldConfig;
    use polis_mind::filter::leaks;

    fn town() -> World {
        let mut world = World::new(WorldConfig {
            seed: 3,
            width: 32,
            height: 32,
            population: 60,
        });
        world.run(2500);
        world
    }

    #[test]
    fn every_person_is_exported_with_their_fields() {
        let world = town();
        let json = snapshot(&world, &[]);
        let people = json["people"].as_array().expect("people list");
        assert_eq!(people.len(), world.agents.len());
        for (value, agent) in people.iter().zip(&world.agents) {
            assert_eq!(value["id"], agent.id);
            assert_eq!(value["name"], agent.name.as_str());
            assert_eq!(value["money"], agent.money);
        }
    }

    #[test]
    fn totals_in_the_export_match_the_world() {
        let world = town();
        let json = snapshot(&world, &[]);
        let stats = world.stats();
        assert_eq!(json["tick"], world.tick);
        assert_eq!(json["stats"]["alive"], stats.alive);
        assert_eq!(json["stats"]["crimes"], stats.crimes);
        assert_eq!(json["stats"]["treasury"], stats.treasury);
        assert_eq!(json["justice"]["treasury"], stats.treasury);
    }

    #[test]
    fn the_export_round_trips_as_text() {
        let text = snapshot(&town(), &[]).to_string();
        let back: Value = serde_json::from_str(&text).expect("valid json");
        assert!(back["people"].as_array().is_some_and(|p| !p.is_empty()));
        assert_eq!(back["version"], FORMAT_VERSION);
    }

    #[test]
    fn family_links_point_at_real_people() {
        let world = town();
        let json = snapshot(&world, &[]);
        let count = world.agents.len() as u64;
        for person in json["people"].as_array().expect("people") {
            if let Some(parents) = person["parents"].as_array() {
                assert!(parents
                    .iter()
                    .all(|p| p.as_u64().is_some_and(|id| id < count)));
            }
            if let Some(partner) = person["partner"].as_u64() {
                assert!(partner < count);
            }
        }
    }

    #[test]
    fn positions_stay_on_the_map() {
        let world = town();
        let json = snapshot(&world, &[]);
        assert_eq!(json["width"], world.width);
        for person in json["people"].as_array().expect("people") {
            let x = person["x"].as_i64().expect("x");
            let y = person["y"].as_i64().expect("y");
            assert!((0..i64::from(world.width)).contains(&x));
            assert!((0..i64::from(world.height)).contains(&y));
        }
    }

    #[test]
    fn the_living_have_an_inner_voice_the_dead_do_not() {
        let world = town();
        let json = snapshot(&world, &[]);
        for person in json["people"].as_array().expect("people") {
            if person["alive"] == true {
                let voice = person["voice"].as_str().expect("living voice");
                assert!(voice.contains(person["name"].as_str().expect("name")));
                assert!(!leaks(voice));
            } else {
                assert!(person["voice"].is_null());
            }
        }
    }

    #[test]
    fn districts_and_conversations_are_included() {
        let world = town();
        let json = snapshot(&world, &[]);
        assert_eq!(json["districts"].as_array().expect("districts").len(), 16);
        let talk = json["conversations"].as_array().expect("conversations");
        assert_eq!(talk.len(), world.utterances.len());
        for line in talk {
            assert!(!line["text"].as_str().expect("text").is_empty());
            assert!(!leaks(line["text"].as_str().expect("text")));
        }
    }

    #[test]
    fn history_is_passed_through() {
        let world = town();
        let points = vec![history_point(&world), history_point(&world)];
        let json = snapshot(&world, &points);
        assert_eq!(json["history"].as_array().expect("history").len(), 2);
        assert_eq!(json["history"][0]["alive"], world.stats().alive);
    }
}
