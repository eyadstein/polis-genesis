use polis_core::{World, WorldConfig};

fn town(seed: u64) -> World {
    World::new(WorldConfig {
        seed,
        population: 60,
        ..WorldConfig::default()
    })
}

#[test]
fn newcomers_arrive_as_strangers() {
    let mut world = town(5);
    let before = world.agents.len();
    let ids = world.add_newcomers(7);
    assert_eq!(ids.len(), 7);
    assert_eq!(world.agents.len(), before + 7);
    for (offset, id) in ids.iter().enumerate() {
        assert_eq!(*id as usize, before + offset);
        let person = &world.agents[*id as usize];
        assert!(person.is_alive());
        assert!(person.is_adult());
        assert!(person.home.is_none());
        assert!(person.job.is_none());
        assert_eq!(person.mind.friends(), 0);
        assert!(person.pos.0 >= 0 && person.pos.0 < world.width);
        assert!(person.pos.1 >= 0 && person.pos.1 < world.height);
    }
}

#[test]
fn newcomers_get_their_own_names_and_faces() {
    let mut world = town(5);
    world.add_newcomers(20);
    let mut names: Vec<&str> = world.agents.iter().map(|a| a.name.as_str()).collect();
    let total = names.len();
    names.sort_unstable();
    names.dedup();
    assert_eq!(names.len(), total);
}

#[test]
fn the_town_gets_to_know_newcomers() {
    let mut world = town(5);
    world.run(50);
    world.add_newcomers(10);
    world.run(1000);
    let alive = world.agents.iter().filter(|a| a.is_alive()).count();
    assert!(alive > 10);
    let newcomers = || world.agents.iter().skip(60).take(10);
    assert!(newcomers().filter(|a| !a.mind.relations.is_empty()).count() >= 5);
    assert!(newcomers().any(|a| a.mind.friends() > 0 || a.home.is_some()));
}

#[test]
fn arrivals_are_repeatable() {
    let run = || {
        let mut world = town(9);
        world.run(40);
        world.add_newcomers(5);
        world.run(120);
        world.state_hash()
    };
    assert_eq!(run(), run());
}

#[test]
fn nobody_arriving_changes_nothing() {
    let mut a = town(3);
    let mut b = town(3);
    a.run(30);
    b.run(30);
    assert!(b.add_newcomers(0).is_empty());
    assert_eq!(a.state_hash(), b.state_hash());
}
