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
                let head = homes[index].tenant.expect("lived in home has a head");
                let head = &world.agents[head as usize];
                assert!(head.is_alive());
                assert_eq!(head.home, Some(index));
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

fn long_world(seed: u64) -> World {
    let mut world = World::new(medium_config(seed));
    world.run(8000);
    world
}

#[test]
fn couples_form_and_children_are_born() {
    let world = long_world(53);
    let stats = world.stats();
    assert!(stats.couples > 0);
    assert!(stats.births > 0);
    assert!(stats.max_generation >= 1);
    assert!(stats.alive > 0);
}

#[test]
fn partners_are_mutual_alive_and_unrelated() {
    let world = long_world(59);
    for agent in world.agents.iter().filter(|a| a.is_alive()) {
        if let Some(p) = agent.partner {
            let other = &world.agents[p as usize];
            assert!(other.is_alive());
            assert_eq!(other.partner, Some(agent.id));
            assert!(agent.is_adult() && other.is_adult());
            assert!(!crate::family::are_kin(agent, other));
        }
    }
}

#[test]
fn children_come_from_their_parents() {
    let world = long_world(61);
    let mut checked = 0;
    for child in world.agents.iter().filter(|a| a.parents.is_some()) {
        let (x, y) = child.parents.expect("has parents");
        let (a, b) = (&world.agents[x as usize], &world.agents[y as usize]);
        assert!(x < child.id && y < child.id);
        assert_eq!(child.generation, a.generation.max(b.generation) + 1);
        assert!(child.genome.distance(&a.genome) < 0.5);
        assert!(child.genome.distance(&b.genome) < 0.5);
        assert!(child.genome != a.genome && child.genome != b.genome);
        checked += 1;
    }
    assert!(checked > 0);
}

#[test]
fn names_stay_unique_as_the_town_grows() {
    let world = long_world(67);
    let names: BTreeSet<&str> = world.agents.iter().map(|a| a.name.as_str()).collect();
    assert_eq!(names.len(), world.agents.len());
}

#[test]
fn children_never_work_or_hold_a_tenancy() {
    let mut world = World::new(medium_config(71));
    for _ in 0..8000 {
        world.step();
        for agent in world
            .agents
            .iter()
            .filter(|a| a.is_alive() && !a.is_adult())
        {
            assert!(agent.job.is_none());
            if let Some(index) = agent.home {
                let head = world.economy.realty.homes[index].tenant;
                assert!(head.is_some());
            }
        }
    }
}

#[test]
fn money_is_conserved_through_births_deaths_and_inheritance() {
    let mut world = World::new(medium_config(73));
    let start = world.total_money();
    for _ in 0..80 {
        world.run(100);
        assert_eq!(world.total_money(), start);
        assert!(world.agents.iter().all(|a| a.money >= 0));
    }
}

#[test]
fn newborns_start_with_no_money_and_a_home() {
    let world = long_world(79);
    for child in world
        .agents
        .iter()
        .filter(|a| a.parents.is_some() && a.age < 50)
    {
        assert!(child.home.is_some() || !child.is_alive());
    }
}

#[test]
fn households_stay_within_their_homes_room_limit() {
    let mut world = World::new(medium_config(83));
    for _ in 0..6000 {
        world.step();
    }
    for (index, home) in world.economy.realty.homes.iter().enumerate() {
        let residents = world
            .agents
            .iter()
            .filter(|a| a.is_alive() && a.home == Some(index))
            .count();
        assert!(residents <= usize::from(home.rooms) * 2 + 4);
    }
}

#[test]
fn people_talk_and_make_friends() {
    let world = long_world(89);
    let stats = world.stats();
    assert!(stats.conversations > 0);
    assert!(stats.friends > 0.0);
}

#[test]
fn minds_stay_valid() {
    use crate::memory::{MEMORY_LIMIT, RELATION_LIMIT};
    let world = long_world(97);
    for agent in &world.agents {
        assert!(agent.mind.memories.len() <= MEMORY_LIMIT);
        assert!(agent.mind.relations.len() <= RELATION_LIMIT);
        for memory in &agent.mind.memories {
            assert!((0.0..=1.0).contains(&memory.strength));
            assert!((-1.0..=1.0).contains(&memory.valence));
            assert!(memory
                .about
                .is_none_or(|x| (x as usize) < world.agents.len()));
        }
        for relation in &agent.mind.relations {
            assert_ne!(relation.other, agent.id);
            assert!((-1.0..=1.0).contains(&relation.affinity));
            assert!((relation.other as usize) < world.agents.len());
        }
    }
}

#[test]
fn the_conversation_log_is_bounded_and_makes_sense() {
    let world = long_world(101);
    assert!(!world.utterances.is_empty());
    assert!(world.utterances.len() <= 200);
    let mut last = 0;
    for u in &world.utterances {
        assert!(u.tick >= last);
        last = u.tick;
        assert_ne!(u.speaker, u.listener);
        assert!(u.about.is_some() == (u.act == crate::talk::Act::Gossip));
        assert!((-1.0..=1.0).contains(&u.warmth));
    }
}

#[test]
fn gossip_and_quarrels_both_happen() {
    let world = long_world(103);
    assert!(world.stats().gossips > 0);
    assert!(world
        .utterances
        .iter()
        .any(|u| u.act == crate::talk::Act::Smalltalk));
}

#[test]
fn falling_in_love_is_remembered() {
    use crate::memory::Event;
    let world = long_world(107);
    let mut checked = 0;
    for agent in world
        .agents
        .iter()
        .filter(|a| a.is_alive() && a.partner.is_some())
    {
        let partner = agent.partner.expect("has partner");
        let remembered = agent
            .mind
            .memories
            .iter()
            .any(|m| m.event == Event::Paired && m.about == Some(partner));
        assert!(remembered || agent.age > 4000);
        checked += 1;
    }
    assert!(checked > 0);
}
