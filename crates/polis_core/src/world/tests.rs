use super::*;
use crate::genome::{Gene, Genome};
use crate::rng::Rng;
use std::collections::BTreeSet;

fn small_config(seed: u64) -> WorldConfig {
    WorldConfig {
        seed,
        width: 32,
        height: 32,
        population: 60,
    }
}

#[test]
fn same_seed_gives_identical_worlds() {
    let mut a = World::new(small_config(7));
    let mut b = World::new(small_config(7));
    a.run(300);
    b.run(300);
    assert_eq!(a.state_hash(), b.state_hash());
}

#[test]
fn different_seeds_diverge() {
    let mut a = World::new(small_config(1));
    let mut b = World::new(small_config(2));
    a.run(100);
    b.run(100);
    assert_ne!(a.state_hash(), b.state_hash());
}

#[test]
fn every_person_has_a_unique_name_and_genome() {
    let world = World::new(small_config(3));
    let names: BTreeSet<&str> = world.agents.iter().map(|a| a.name.as_str()).collect();
    assert_eq!(names.len(), world.agents.len());
    for i in 0..world.agents.len() {
        for j in (i + 1)..world.agents.len() {
            assert!(world.agents[i].genome.distance(&world.agents[j].genome) > 0.0);
        }
    }
}

#[test]
fn needs_and_mood_stay_in_range() {
    let mut world = World::new(small_config(5));
    for _ in 0..400 {
        world.step();
        for agent in &world.agents {
            let n = &agent.needs;
            for level in [n.hunger, n.energy, n.social, n.purpose] {
                assert!((0.0..=1.0).contains(&level));
            }
            assert!((-1.0..=1.0).contains(&agent.mood.valence));
            assert!((0.0..=1.0).contains(&agent.mood.arousal));
        }
    }
}

#[test]
fn people_cannot_die_twice_or_come_back() {
    let mut world = World::new(small_config(9));
    world.run(2000);
    let dead_before: BTreeSet<u32> = world
        .agents
        .iter()
        .filter(|a| !a.is_alive())
        .map(|a| a.id)
        .collect();
    world.run(200);
    for agent in &world.agents {
        if dead_before.contains(&agent.id) {
            assert!(!agent.is_alive());
        }
    }
}

#[test]
fn children_inherit_from_parents_and_stay_in_bounds() {
    let mut rng = Rng::new(11);
    let a = Genome::random(&mut rng);
    let b = Genome::random(&mut rng);
    let child = Genome::crossbreed(&a, &b, &mut rng, 0.1, 0.1);
    for gene in Gene::ALL {
        assert!((0.0..=1.0).contains(&child.get(gene)));
    }
    assert!(child.distance(&a) < 0.5 && child.distance(&b) < 0.5);
    assert!(child.distance(&a) > 0.0 || child.distance(&b) > 0.0);
}

#[test]
fn zero_mutation_child_only_carries_parent_genes() {
    let mut rng = Rng::new(21);
    let a = Genome::random(&mut rng);
    let b = Genome::random(&mut rng);
    let child = Genome::crossbreed(&a, &b, &mut rng, 0.0, 0.0);
    for gene in Gene::ALL {
        let v = child.get(gene);
        assert!(v == a.get(gene) || v == b.get(gene));
    }
}
