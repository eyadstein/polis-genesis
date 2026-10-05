use super::*;
use crate::genome::GENE_COUNT;

#[test]
fn selling_a_meal_moves_money_exactly() {
    let mut market = Market::new(100);
    let mut buyer = 50;
    let price = market.price;
    assert!(market.sell_meal(&mut buyer));
    assert_eq!(buyer, 50 - price);
    assert_eq!(market.cash, 100 + price);
    assert_eq!(market.stock, 39);
}

#[test]
fn broke_buyers_and_empty_shelves_cannot_buy() {
    let mut market = Market::new(100);
    let mut buyer = 0;
    assert!(!market.sell_meal(&mut buyer));
    market.stock = 0;
    let mut rich = 1000;
    assert!(!market.sell_meal(&mut rich));
    assert_eq!(rich, 1000);
}

#[test]
fn shop_serves_only_as_many_as_its_staff_allow() {
    let mut market = Market::new(100);
    market.service_left = 2;
    let mut buyer = 1000;
    assert!(market.sell_meal(&mut buyer));
    assert!(market.sell_meal(&mut buyer));
    assert!(!market.sell_meal(&mut buyer));
}

#[test]
fn market_only_buys_harvest_it_can_pay_for() {
    let mut market = Market::new(1);
    market.price = 4;
    let mut farmer = 0;
    assert_eq!(market.buy_harvest(&mut farmer, 0.5, 0), 0);
    assert_eq!(farmer, 0);
    market.cash = 100;
    let paid = market.buy_harvest(&mut farmer, 0.5, 0);
    assert!(paid > 0);
    assert_eq!(farmer, paid);
    assert_eq!(market.cash, 100 - paid);
}

#[test]
fn full_shelves_stop_the_market_buying() {
    let mut market = Market::new(1000);
    market.stock = market.stock_cap;
    let mut farmer = 0;
    assert_eq!(market.buy_harvest(&mut farmer, 0.5, 0), 0);
    assert_eq!(farmer, 0);
}

#[test]
fn surplus_ignores_the_reserve() {
    assert_eq!(surplus(700, 500), 200);
    assert_eq!(surplus(300, 500), 0);
}

#[test]
fn scarcity_raises_price_and_plenty_lowers_it() {
    let mut market = Market::new(100);
    market.stock = 0;
    market.reprice(100);
    let scarce = market.price;
    market.stock = 500;
    market.reprice(100);
    assert!(scarce > market.price);
    assert!((MIN_PRICE..=MAX_PRICE).contains(&scarce));
}

#[test]
fn gini_is_zero_for_equal_and_high_for_one_holder() {
    assert!(gini(&mut [10, 10, 10, 10]).abs() < 1e-6);
    assert!(gini(&mut [0, 0, 0, 100]) > 0.7);
    assert_eq!(gini(&mut []), 0.0);
}

#[test]
fn genes_decide_who_fits_which_job() {
    let mut genes = [0.5; GENE_COUNT];
    genes[Gene::Craft as usize] = 1.0;
    genes[Gene::Athletics as usize] = 1.0;
    let builder = Genome::from_genes(genes);
    assert!(Job::Builder.fit(&builder) > Job::Shopkeeper.fit(&builder));
}

#[test]
fn jobs_start_at_different_pay() {
    let pays: Vec<Coins> = Job::ALL.iter().map(|j| j.base_wage(2)).collect();
    let mut distinct = pays.clone();
    distinct.sort_unstable();
    distinct.dedup();
    assert_eq!(distinct.len(), pays.len());
}

#[test]
fn talent_and_experience_raise_pay() {
    let rookie = wage_for(8, 0.2, 0, RESERVE);
    let talented = wage_for(8, 0.9, 0, RESERVE);
    let veteran = wage_for(8, 0.2, EXPERIENCE_CAP, RESERVE);
    assert!(talented > rookie);
    assert!(veteran > rookie);
    assert!(skill_percent(1.0, EXPERIENCE_CAP) <= 150);
    assert!(skill_percent(0.0, 0) >= 70);
}

#[test]
fn a_richer_employer_pays_more() {
    let poor = wage_for(8, 0.5, 0, 100);
    let rich = wage_for(8, 0.5, 0, 5000);
    assert!(rich > poor);
}

#[test]
fn wages_never_fall_below_one_coin() {
    assert_eq!(wage_for(1, 0.0, 0, 0), 1);
}

#[test]
fn the_treasury_pays_public_workers_only_what_it_has() {
    let mut treasury = Treasury::new(0);
    let mut officer = 0;
    assert_eq!(treasury.pay(&mut officer, Job::Officer, 0.5, 0), 0);
    assert_eq!(officer, 0);
    treasury.cash = 100;
    let wage = treasury.pay(&mut officer, Job::Officer, 0.5, 0);
    assert!(wage > 0);
    assert_eq!(officer, wage);
    assert_eq!(treasury.cash, 100 - wage);
}

#[test]
fn only_savings_above_the_allowance_are_taxed() {
    assert_eq!(wealth_tax(0), 0);
    assert_eq!(wealth_tax(TAX_FREE), 0);
    assert_eq!(wealth_tax(TAX_FREE + 100), 5);
    assert!(wealth_tax(10_000) > wealth_tax(1_000));
    assert!(wealth_tax(10_000) < 10_000);
}

#[test]
fn public_jobs_pay_and_suit_the_right_people() {
    let mut genes = [0.5; GENE_COUNT];
    genes[Gene::Intellect as usize] = 1.0;
    genes[Gene::Charisma as usize] = 1.0;
    let clever = Genome::from_genes(genes);
    assert!(Job::Lawyer.fit(&clever) > Job::Officer.fit(&clever));
    for job in [Job::Officer, Job::Judge, Job::Lawyer] {
        assert!(job.base_wage(1) > 0);
        assert!(job.share() > 0.0);
    }
}
