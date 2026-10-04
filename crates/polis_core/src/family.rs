//! Couples, children, and inheritance rules.
//!
//! These are pure rules about people. The world applies them. Every person
//! can pair with any other adult who is not close kin, so this models bonds
//! and households, not biology. Sex, gender and orientation come later.

use crate::agent::Agent;
use crate::economy::Coins;
use crate::genome::{Gene, Genome};

pub const MAX_AGE_GAP: u32 = 6000;
pub const BOND_TO_PAIR: f32 = 1.0;
pub const BIRTH_COOLDOWN: u32 = 1500;
pub const MAX_CHILDREN_AT_HOME: usize = 4;
pub const MIN_SAVINGS_FOR_CHILD: Coins = 30;
pub const MUTATION_RATE: f32 = 0.08;
pub const MUTATION_SIZE: f32 = 0.1;

const BASE_BIRTH_CHANCE: f32 = 0.003;
const BOND_RATE: f32 = 0.5;
const MIN_COMPATIBILITY: f32 = 0.35;

/// How well two people suit each other, in [0, 1]: alike in nature and warm.
pub fn compatibility(a: &Genome, b: &Genome) -> f32 {
    let alike = 1.0 - 2.0 * a.distance(b);
    let warmth = 0.5 * (a.get(Gene::Agreeableness) + b.get(Gene::Agreeableness));
    (0.6 * alike + 0.4 * warmth).clamp(0.0, 1.0)
}

/// Parent and child, or siblings.
pub fn are_kin(a: &Agent, b: &Agent) -> bool {
    let parents_of = |p: &Agent| p.parents.map_or(Vec::new(), |(x, y)| vec![x, y]);
    let (pa, pb) = (parents_of(a), parents_of(b));
    pa.contains(&b.id) || pb.contains(&a.id) || pa.iter().any(|id| pb.contains(id))
}

pub fn can_pair(a: &Agent, b: &Agent) -> bool {
    a.id != b.id
        && a.is_alive()
        && b.is_alive()
        && a.is_adult()
        && b.is_adult()
        && a.partner.is_none()
        && b.partner.is_none()
        && !are_kin(a, b)
        && a.age.abs_diff(b.age) <= MAX_AGE_GAP
}

/// How much closer two people grow in one tick spent together. People who
/// do not suit each other never grow close.
pub fn bond_gain(a: &Agent, b: &Agent) -> f32 {
    let fit = compatibility(&a.genome, &b.genome);
    if fit < MIN_COMPATIBILITY {
        return 0.0;
    }
    BOND_RATE * (fit - 0.2)
}

/// A couple can have a child when both are adult and not elderly, rested
/// from the last birth, have savings, and the home has room.
pub fn can_have_child(a: &Agent, b: &Agent, rooms: usize, residents: usize, kids: usize) -> bool {
    a.is_alive()
        && b.is_alive()
        && a.is_adult()
        && b.is_adult()
        && !a.is_elderly()
        && !b.is_elderly()
        && a.baby_cooldown == 0
        && b.baby_cooldown == 0
        && kids < MAX_CHILDREN_AT_HOME
        && residents < rooms * 2
        && a.money + b.money >= MIN_SAVINGS_FOR_CHILD
}

/// Chance per tick that a couple that can have a child does. Warmer
/// couples are likelier.
pub fn birth_chance(a: &Agent, b: &Agent) -> f32 {
    let warmth = 0.5 * (a.genome.get(Gene::Empathy) + b.genome.get(Gene::Empathy));
    BASE_BIRTH_CHANCE * (0.5 + warmth)
}

/// Split an estate between heirs. The first heir gets any remainder, so
/// not one coin is lost.
pub fn inherit_split(money: Coins, heirs: usize) -> Vec<Coins> {
    if heirs == 0 {
        return Vec::new();
    }
    let share = money / heirs as Coins;
    let mut shares = vec![share; heirs];
    shares[0] += money - share * heirs as Coins;
    shares
}

/// Two distinct elements of a slice, mutably.
pub fn pair_mut<T>(items: &mut [T], i: usize, j: usize) -> (&mut T, &mut T) {
    assert_ne!(i, j, "need two different elements");
    if i < j {
        let (left, right) = items.split_at_mut(j);
        (&mut left[i], &mut right[0])
    } else {
        let (left, right) = items.split_at_mut(i);
        (&mut right[0], &mut left[j])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::{AgentId, ADULT_AGE};
    use crate::genome::GENE_COUNT;

    fn person(id: AgentId, genes: [f32; GENE_COUNT]) -> Agent {
        let mut a = Agent::new(id, format!("p{id}"), Genome::from_genes(genes), (0, 0), 50);
        a.age = ADULT_AGE + 100;
        a
    }

    fn plain(id: AgentId) -> Agent {
        person(id, [0.5; GENE_COUNT])
    }

    #[test]
    fn similar_warm_people_are_more_compatible() {
        let mut warm = [0.5; GENE_COUNT];
        warm[Gene::Agreeableness as usize] = 0.9;
        let mut cold = [0.5; GENE_COUNT];
        cold[Gene::Agreeableness as usize] = 0.1;
        cold[Gene::Openness as usize] = 0.0;
        let a = Genome::from_genes(warm);
        assert!(compatibility(&a, &a) > compatibility(&a, &Genome::from_genes(cold)));
    }

    #[test]
    fn only_compatible_people_grow_close() {
        let opposite = person(1, [0.0; GENE_COUNT]);
        let other = person(2, [1.0; GENE_COUNT]);
        assert_eq!(bond_gain(&opposite, &other), 0.0);
        assert!(bond_gain(&plain(3), &plain(4)) > 0.0);
    }

    #[test]
    fn kin_cannot_pair() {
        let (a, b) = (plain(1), plain(2));
        let mut child = plain(3);
        child.parents = Some((1, 2));
        let mut sibling = plain(4);
        sibling.parents = Some((1, 2));
        assert!(are_kin(&a, &child));
        assert!(are_kin(&child, &sibling));
        assert!(!are_kin(&a, &b));
        assert!(!can_pair(&a, &child));
        assert!(!can_pair(&child, &sibling));
        assert!(can_pair(&a, &b));
    }

    #[test]
    fn children_taken_and_far_apart_in_age_cannot_pair() {
        let mut kid = plain(1);
        kid.age = 100;
        let mut taken = plain(3);
        taken.partner = Some(9);
        let mut old = plain(4);
        old.age += MAX_AGE_GAP + 1;
        let a = plain(2);
        assert!(!can_pair(&a, &kid));
        assert!(!can_pair(&a, &taken));
        assert!(!can_pair(&a, &old));
        assert!(!can_pair(&a, &a));
    }

    #[test]
    fn a_child_needs_room_money_rest_and_youth() {
        let (a, b) = (plain(1), plain(2));
        assert!(can_have_child(&a, &b, 3, 2, 0));
        assert!(!can_have_child(&a, &b, 1, 2, 0));
        assert!(!can_have_child(&a, &b, 3, 2, MAX_CHILDREN_AT_HOME));
        let mut tired = plain(3);
        tired.baby_cooldown = 10;
        assert!(!can_have_child(&a, &tired, 3, 2, 0));
        let mut broke = plain(4);
        broke.money = 0;
        let mut also_broke = plain(5);
        also_broke.money = 0;
        assert!(!can_have_child(&broke, &also_broke, 3, 2, 0));
        let mut elder = plain(6);
        elder.age = elder.lifespan();
        assert!(!can_have_child(&a, &elder, 3, 2, 0));
    }

    #[test]
    fn warmer_couples_are_likelier_to_have_children() {
        let mut warm = [0.5; GENE_COUNT];
        warm[Gene::Empathy as usize] = 1.0;
        let mut cold = [0.5; GENE_COUNT];
        cold[Gene::Empathy as usize] = 0.0;
        assert!(
            birth_chance(&person(1, warm), &person(2, warm))
                > birth_chance(&person(3, cold), &person(4, cold))
        );
    }

    #[test]
    fn estates_split_without_losing_a_coin() {
        for money in [0, 1, 7, 100, 101] {
            for heirs in 1..6 {
                let shares = inherit_split(money, heirs);
                assert_eq!(shares.len(), heirs);
                assert_eq!(shares.iter().sum::<Coins>(), money);
            }
        }
        assert!(inherit_split(50, 0).is_empty());
    }

    #[test]
    fn pair_mut_returns_both_in_either_order() {
        let mut items = [1, 2, 3, 4];
        let (a, b) = pair_mut(&mut items, 3, 1);
        std::mem::swap(a, b);
        assert_eq!(items, [1, 4, 3, 2]);
    }
}
