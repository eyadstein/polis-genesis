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

fn medium_config(seed: u64) -> WorldConfig {
    WorldConfig {
        seed,
        width: 48,
        height: 48,
        population: 150,
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

#[test]
fn money_is_never_created_or_destroyed() {
    let mut world = World::new(medium_config(13));
    let start = world.total_money();
    for _ in 0..30 {
        world.run(100);
        assert_eq!(world.total_money(), start);
    }
}

#[test]
fn nobody_ever_has_negative_money() {
    let mut world = World::new(medium_config(17));
    for _ in 0..2000 {
        world.step();
        assert!(world.agents.iter().all(|a| a.money >= 0));
        assert!(world.economy.market.cash >= 0);
        assert!(world.economy.realty.cash >= 0);
    }
}

#[test]
fn housing_records_always_agree() {
    let mut world = World::new(medium_config(19));
    for _ in 0..1500 {
        world.step();
        let homes = &world.economy.realty.homes;
        for agent in world.agents.iter().filter(|a| a.is_alive()) {
            if let Some(index) = agent.home {
                assert_eq!(homes[index].tenant, Some(agent.id));
            }
        }
        for (index, home) in homes.iter().enumerate() {
            if let Some(tenant) = home.tenant {
                let person = &world.agents[tenant as usize];
                assert!(person.is_alive());
                assert_eq!(person.home, Some(index));
            }
        }
    }
}

#[test]
fn the_dead_hold_no_money_job_or_home() {
    let mut world = World::new(medium_config(23));
    world.run(3000);
    for agent in world.agents.iter().filter(|a| !a.is_alive()) {
        assert_eq!(agent.money, 0);
        assert!(agent.job.is_none() && agent.home.is_none());
    }
}

#[test]
fn market_price_and_inequality_stay_in_range() {
    let mut world = World::new(medium_config(29));
    for _ in 0..1500 {
        world.step();
        let stats = world.stats();
        assert!((1..=20).contains(&stats.food_price));
        assert!((0.0..=1.0).contains(&stats.gini));
    }
}

#[test]
fn people_find_jobs_and_every_job_type_gets_filled() {
    let mut world = World::new(medium_config(31));
    world.run(2000);
    assert!(world.stats().employed > 0);
    for job in crate::economy::Job::ALL {
        assert!(
            world.agents.iter().any(|a| a.job == Some(job)) || job == crate::economy::Job::Builder
        );
    }
}

#[test]
fn different_jobs_pay_differently() {
    let mut world = World::new(medium_config(37));
    world.run(3000);
    let mut means: Vec<i64> = crate::report::wages(&world)
        .iter()
        .filter(|row| row.paid_ticks > 0)
        .map(|row| (row.mean_wage * 10.0).round() as i64)
        .collect();
    assert!(means.len() >= 3);
    means.sort_unstable();
    means.dedup();
    assert!(means.len() >= 3);
}

#[test]
fn homes_differ_in_rent_by_kind_and_place() {
    let mut world = World::new(medium_config(41));
    world.run(1500);
    let rows = crate::report::rents_by_kind(&world);
    let rent_of = |kind| {
        rows.iter()
            .find(|r| r.kind == kind)
            .expect("kind row")
            .mean_rent
    };
    assert!(rent_of(crate::housing::Kind::Villa) > rent_of(crate::housing::Kind::Shack));
    let mut rents: Vec<i64> = world.economy.realty.homes.iter().map(|h| h.rent).collect();
    rents.sort_unstable();
    rents.dedup();
    assert!(rents.len() >= 5);
    let appeals: Vec<f32> = world
        .economy
        .realty
        .districts
        .iter()
        .map(|d| d.appeal)
        .collect();
    let (low, high) = appeals
        .iter()
        .fold((f32::MAX, f32::MIN), |(l, h), &a| (l.min(a), h.max(a)));
    assert!(high - low > 0.1);
}

#[test]
fn experience_builds_up_and_raises_pay() {
    let mut world = World::new(medium_config(43));
    world.run(4000);
    let (veteran, job) = world
        .agents
        .iter()
        .filter_map(|a| a.job.map(|job| (a, job)))
        .max_by_key(|(a, job)| a.seasoning(*job))
        .expect("someone has a job");
    let experience = veteran.seasoning(job);
    assert!(experience > 200);
    let fit = job.fit(&veteran.genome);
    let base = job.base_wage(2);
    let cash = crate::economy::RESERVE;
    assert!(
        crate::economy::wage_for(base, fit, experience, cash)
            > crate::economy::wage_for(base, fit, 0, cash)
    );
}

#[test]
fn rents_stay_positive_and_conditions_stay_in_range() {
    let mut world = World::new(medium_config(47));
    for _ in 0..2000 {
        world.step();
        for home in &world.economy.realty.homes {
            assert!(home.rent >= 1);
            assert!((0.0..=100.0).contains(&home.condition));
        }
    }
}
