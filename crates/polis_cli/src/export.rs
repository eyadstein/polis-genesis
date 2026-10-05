//! Writes the whole town as JSON so other languages can read it: Python for
//! analysis today, a browser viewer and a server later.

use polis_core::{Job, World};
use serde_json::{json, Value};

fn job_name(job: Option<Job>) -> Value {
    match job {
        Some(job) => json!(format!("{job:?}")),
        None => Value::Null,
    }
}

/// One person, with everything an analysis or viewer needs.
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
    })
}

/// The whole town at this moment.
pub fn snapshot(world: &World) -> Value {
    let s = world.stats();
    json!({
        "tick": world.tick,
        "stats": {
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
        },
        "people": (0..world.agents.len()).map(|i| person(world, i)).collect::<Vec<_>>(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use polis_core::WorldConfig;

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
        let json = snapshot(&world);
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
        let json = snapshot(&world);
        let stats = world.stats();
        assert_eq!(json["tick"], world.tick);
        assert_eq!(json["stats"]["alive"], stats.alive);
        assert_eq!(json["stats"]["crimes"], stats.crimes);
        assert_eq!(json["stats"]["treasury"], stats.treasury);
    }

    #[test]
    fn the_export_round_trips_as_text() {
        let text = snapshot(&town()).to_string();
        let back: Value = serde_json::from_str(&text).expect("valid json");
        assert!(back["people"].as_array().is_some_and(|p| !p.is_empty()));
    }

    #[test]
    fn family_links_point_at_real_people() {
        let world = town();
        let json = snapshot(&world);
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
}
