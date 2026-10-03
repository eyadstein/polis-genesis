use super::*;
use crate::genome::GENE_COUNT;

fn home(kind: Kind, rooms: u8, condition: f32, district: usize) -> Home {
    Home {
        district,
        kind,
        rooms,
        condition,
        tenant: None,
        rent: 1,
    }
}

fn genome_with(gene: Gene, value: f32) -> Genome {
    let mut genes = [0.5; GENE_COUNT];
    genes[gene as usize] = value;
    Genome::from_genes(genes)
}

#[test]
fn bigger_and_finer_homes_cost_more() {
    let mut realty = Realty::empty(0);
    let shack = home(Kind::Shack, 1, 100.0, 0);
    let flat = home(Kind::Flat, 2, 100.0, 0);
    let villa = home(Kind::Villa, 6, 100.0, 0);
    realty.homes = vec![shack.clone(), flat.clone(), villa.clone()];
    assert!(realty.quote(&shack) < realty.quote(&flat));
    assert!(realty.quote(&flat) < realty.quote(&villa));
}

#[test]
fn same_kind_more_rooms_costs_more() {
    let realty = Realty::empty(0);
    let small = home(Kind::House, 3, 100.0, 0);
    let large = home(Kind::House, 5, 100.0, 0);
    assert!(realty.quote(&large) > realty.quote(&small));
}

#[test]
fn worn_homes_cost_less() {
    let realty = Realty::empty(0);
    let new = home(Kind::House, 4, 100.0, 0);
    let worn = home(Kind::House, 4, 10.0, 0);
    assert!(realty.quote(&new) > realty.quote(&worn));
}

#[test]
fn attractive_districts_cost_more() {
    let mut realty = Realty::empty(0);
    realty.districts[1].appeal = 0.9;
    realty.districts[2].appeal = 0.1;
    let nice = home(Kind::House, 4, 100.0, 1);
    let dull = home(Kind::House, 4, 100.0, 2);
    assert!(realty.quote(&nice) > realty.quote(&dull));
}

#[test]
fn demand_raises_rent_and_empty_districts_lower_it() {
    let mut realty = Realty::empty(0);
    let mut full = home(Kind::Flat, 3, 100.0, 0);
    full.tenant = Some(1);
    realty.homes = vec![full, home(Kind::Flat, 3, 100.0, 1)];
    let tenants = [(0, 0); DISTRICT_COUNT];
    for _ in 0..40 {
        realty.refresh(&tenants, 0);
    }
    assert!(realty.districts[0].pressure > 1.0);
    assert!(realty.districts[1].pressure < 1.0);
    for district in &realty.districts {
        assert!((0.6..=1.6).contains(&district.pressure));
    }
}

#[test]
fn services_and_wealthy_neighbors_raise_district_appeal() {
    let mut realty = Realty::empty(0);
    realty.homes = vec![home(Kind::Flat, 2, 80.0, 0), home(Kind::Flat, 2, 80.0, 15)];
    let mut tenants = [(0, 0); DISTRICT_COUNT];
    tenants[0] = (900, 3);
    tenants[15] = (30, 3);
    tenants[5] = (60, 3);
    realty.refresh(&tenants, 0);
    assert!(realty.districts[0].appeal > realty.districts[15].appeal);
    assert!(realty.districts[0].neighbor_wealth > realty.districts[15].neighbor_wealth);
}

#[test]
fn people_choose_homes_by_taste_and_budget() {
    let mut realty = Realty::empty(0);
    realty.homes = vec![home(Kind::Flat, 3, 90.0, 0), home(Kind::Flat, 3, 90.0, 1)];
    realty.districts[0].occupancy = 0.95;
    realty.districts[1].occupancy = 0.05;
    for district in &mut realty.districts {
        district.appeal = 0.5;
    }
    for home in realty.homes.iter_mut() {
        home.rent = 5;
    }
    let outgoing = genome_with(Gene::Extraversion, 1.0);
    let anxious = genome_with(Gene::Neuroticism, 1.0);
    assert_eq!(realty.choose_home(&outgoing, 100), Some(0));
    assert_eq!(realty.choose_home(&anxious, 100), Some(1));
    assert_eq!(realty.choose_home(&outgoing, 10), None);
}

#[test]
fn open_minded_people_pick_bigger_homes() {
    let mut realty = Realty::empty(0);
    realty.homes = vec![home(Kind::Flat, 2, 90.0, 0), home(Kind::Flat, 3, 90.0, 0)];
    for home in realty.homes.iter_mut() {
        home.rent = 4;
    }
    let open = genome_with(Gene::Openness, 1.0);
    assert_eq!(realty.choose_home(&open, 100), Some(1));
}

#[test]
fn homes_are_built_in_a_chosen_place_and_take_work() {
    let mut rng = Rng::new(5);
    let mut realty = Realty::empty(100_000);
    realty.districts[7].pressure = 1.6;
    realty.plan_project(&mut rng);
    let project = realty.project.clone().expect("project planned");
    assert_eq!(project.district, 7);
    let mut builder = 0;
    for _ in 0..project.needed {
        assert!(realty.pay_builder(&mut builder, 0.5, 0) > 0);
    }
    assert!(realty.project.is_none());
    assert_eq!(realty.homes.len(), 1);
    assert_eq!(realty.homes[0].district, 7);
    assert_eq!(realty.homes[0].condition, 100.0);
}

#[test]
fn builders_without_a_project_or_cash_are_not_paid() {
    let mut realty = Realty::empty(100_000);
    let mut builder = 0;
    assert_eq!(realty.pay_builder(&mut builder, 0.5, 0), 0);
    realty.cash = 0;
    realty.project = Some(Project {
        district: 0,
        kind: Kind::Flat,
        rooms: 2,
        progress: 0,
        needed: 24,
    });
    assert_eq!(realty.pay_builder(&mut builder, 0.5, 0), 0);
    assert_eq!(builder, 0);
}

#[test]
fn mechanics_repair_the_worst_home_first() {
    let mut realty = Realty::empty(1000);
    realty.homes = vec![
        home(Kind::Flat, 2, 70.0, 0),
        home(Kind::Flat, 2, 20.0, 0),
        home(Kind::Flat, 2, 95.0, 0),
    ];
    let mut mechanic = 0;
    let wage = realty.pay_mechanic(&mut mechanic, 0.5, 0);
    assert!(wage > 0);
    assert_eq!(realty.homes[1].condition, 28.0);
    assert_eq!(realty.homes[0].condition, 70.0);
}

#[test]
fn mechanics_are_not_paid_when_nothing_needs_fixing() {
    let mut realty = Realty::empty(1000);
    realty.homes = vec![home(Kind::Flat, 2, 100.0, 0)];
    let mut mechanic = 0;
    assert_eq!(realty.pay_mechanic(&mut mechanic, 0.5, 0), 0);
    assert_eq!(realty.cash, 1000);
}

#[test]
fn homes_wear_down_and_occupied_ones_faster() {
    let mut realty = Realty::empty(0);
    let mut lived_in = home(Kind::Flat, 2, 50.0, 0);
    lived_in.tenant = Some(1);
    realty.homes = vec![lived_in, home(Kind::Flat, 2, 50.0, 0)];
    realty.age_homes();
    assert!(realty.homes[0].condition < realty.homes[1].condition);
    assert!(realty.homes[1].condition < 50.0);
}

#[test]
fn missing_rent_twice_means_eviction() {
    let mut realty = Realty::empty(0);
    let mut flat = home(Kind::Flat, 2, 80.0, 0);
    flat.tenant = Some(7);
    flat.rent = 5;
    realty.homes = vec![flat];
    let (mut money, mut missed) = (0, 0);
    assert!(!realty.charge_rent(0, &mut money, &mut missed));
    assert!(realty.charge_rent(0, &mut money, &mut missed));
    assert!(realty.homes[0].tenant.is_none());
}

#[test]
fn paying_rent_moves_exact_coins() {
    let mut realty = Realty::empty(0);
    let mut flat = home(Kind::Flat, 2, 80.0, 0);
    flat.tenant = Some(1);
    flat.rent = 6;
    realty.homes = vec![flat];
    let (mut money, mut missed) = (10, 1);
    assert!(!realty.charge_rent(0, &mut money, &mut missed));
    assert_eq!((money, missed, realty.cash), (4, 0, 6));
}

#[test]
fn map_positions_fall_into_districts() {
    assert_eq!(district_of((0, 0), 64, 64), 0);
    assert_eq!(district_of((63, 0), 64, 64), 3);
    assert_eq!(district_of((0, 63), 64, 64), 12);
    assert_eq!(district_of((63, 63), 64, 64), DISTRICT_COUNT - 1);
}

#[test]
fn generated_homes_respect_kind_room_ranges() {
    let mut rng = Rng::new(3);
    let realty = Realty::generate(0, 300, &mut rng);
    assert_eq!(realty.homes.len(), 300);
    for home in &realty.homes {
        let (low, high) = home.kind.room_range();
        assert!((low..=high).contains(&home.rooms));
        assert!(home.district < DISTRICT_COUNT);
    }
    for kind in Kind::ALL {
        assert!(realty.homes.iter().any(|h| h.kind == kind));
    }
}
