//! Money, jobs, the food market and housing.
//!
//! Money is whole coins and is never created or destroyed. It only moves
//! between people, the market, and the realty office.

use crate::agent::AgentId;
use crate::genome::{Gene, Genome};

pub type Coins = i64;

pub const RENT_PERIOD: u64 = 100;
pub const BASE_RENT: Coins = 3;
pub const EVICTION_AFTER: u32 = 2;
pub const MEAL_RESTORE: f32 = 0.5;
pub const SAFETY_SAVINGS: Coins = 60;

const BASE_PRICE: f32 = 4.0;
const MIN_PRICE: Coins = 1;
const MAX_PRICE: Coins = 20;
const FOOD_PER_WORK: u32 = 2;
const CLERK_WAGE: Coins = 2;
const BUILDER_WAGE: Coins = 2;
const HOME_WORK: u32 = 30;
pub const RESERVE: Coins = 500;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Job {
    Farmer,
    Builder,
    Clerk,
}

impl Job {
    pub const ALL: [Job; 3] = [Job::Farmer, Job::Builder, Job::Clerk];

    pub fn index(self) -> usize {
        self as usize
    }

    /// How well a person's genes suit this job, in [0, 1].
    pub fn fit(self, genome: &Genome) -> f32 {
        let (a, b) = match self {
            Job::Farmer => (Gene::Conscientiousness, Gene::Athletics),
            Job::Builder => (Gene::Craft, Gene::Athletics),
            Job::Clerk => (Gene::Charisma, Gene::Intellect),
        };
        0.5 * genome.get(a) + 0.5 * genome.get(b)
    }

    /// Share of the town that the economy can employ in this job.
    pub fn share(self) -> f32 {
        match self {
            Job::Farmer => 0.30,
            Job::Builder => 0.08,
            Job::Clerk => 0.10,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Market {
    pub cash: Coins,
    pub stock: u32,
    pub stock_cap: u32,
    pub price: Coins,
}

impl Market {
    pub fn new(cash: Coins) -> Self {
        Self {
            cash,
            stock: 40,
            stock_cap: 100,
            price: BASE_PRICE as Coins,
        }
    }

    /// Scarce food costs more, plentiful food costs less.
    pub fn reprice(&mut self, population: usize) {
        self.stock_cap = population.max(20) as u32;
        let target = (population as f32 * 0.5).max(10.0);
        let scarcity = target / (self.stock as f32 + 1.0);
        let price = (BASE_PRICE * scarcity.sqrt()).round() as Coins;
        self.price = price.clamp(MIN_PRICE, MAX_PRICE);
    }

    pub fn wholesale(&self) -> Coins {
        (self.price / 2).max(1)
    }

    pub fn can_sell_to(&self, money: Coins) -> bool {
        self.stock > 0 && money >= self.price
    }

    pub fn sell_meal(&mut self, buyer: &mut Coins) -> bool {
        if !self.can_sell_to(*buyer) {
            return false;
        }
        *buyer -= self.price;
        self.cash += self.price;
        self.stock -= 1;
        true
    }

    /// A farmer delivers a harvest. The market only takes what it can pay
    /// for and what its shelves have room for.
    pub fn buy_harvest(&mut self, seller: &mut Coins) -> u32 {
        let wholesale = self.wholesale();
        let affordable = (self.cash / wholesale).max(0) as u32;
        let room = self.stock_cap.saturating_sub(self.stock);
        let units = FOOD_PER_WORK.min(affordable).min(room);
        let pay = Coins::from(units) * wholesale;
        self.cash -= pay;
        *seller += pay;
        self.stock += units;
        units
    }

    pub fn pay_clerk(&mut self, clerk: &mut Coins) -> bool {
        if self.cash < CLERK_WAGE {
            return false;
        }
        self.cash -= CLERK_WAGE;
        *clerk += CLERK_WAGE;
        true
    }
}

#[derive(Clone, Debug)]
pub struct Home {
    pub rent: Coins,
    pub tenant: Option<AgentId>,
}

#[derive(Clone, Debug)]
pub struct Realty {
    pub cash: Coins,
    pub homes: Vec<Home>,
    progress: u32,
}

impl Realty {
    pub fn new(cash: Coins, homes: usize) -> Self {
        let homes = (0..homes)
            .map(|_| Home {
                rent: BASE_RENT,
                tenant: None,
            })
            .collect();
        Self {
            cash,
            homes,
            progress: 0,
        }
    }

    pub fn first_vacant(&self) -> Option<usize> {
        self.homes.iter().position(|home| home.tenant.is_none())
    }

    pub fn vacancies(&self) -> usize {
        self.homes.iter().filter(|h| h.tenant.is_none()).count()
    }

    pub fn needs_building(&self, homeless: usize) -> bool {
        homeless > self.vacancies()
    }

    /// Pay a builder for one tick of work, but only while there is a shortage.
    pub fn pay_builder(&mut self, builder: &mut Coins, homeless: usize) -> bool {
        if !self.needs_building(homeless) || self.cash < BUILDER_WAGE {
            return false;
        }
        self.cash -= BUILDER_WAGE;
        *builder += BUILDER_WAGE;
        self.progress += 1;
        if self.progress >= HOME_WORK {
            self.progress = 0;
            self.homes.push(Home {
                rent: BASE_RENT,
                tenant: None,
            });
        }
        true
    }

    /// Charge rent. Returns true if the tenant was evicted.
    pub fn charge_rent(&mut self, index: usize, money: &mut Coins, missed: &mut u32) -> bool {
        let rent = self.homes[index].rent;
        if *money >= rent {
            *money -= rent;
            self.cash += rent;
            *missed = 0;
            return false;
        }
        *missed += 1;
        if *missed >= EVICTION_AFTER {
            self.homes[index].tenant = None;
            *missed = 0;
            return true;
        }
        false
    }
}

/// Cash a fund holds beyond its working reserve.
pub fn surplus(cash: Coins, reserve: Coins) -> Coins {
    (cash - reserve).max(0)
}

/// Inequality of a set of holdings: 0 is perfectly equal, 1 is one person
/// holding everything.
pub fn gini(holdings: &mut [Coins]) -> f32 {
    let count = holdings.len();
    let total: Coins = holdings.iter().sum();
    if count == 0 || total <= 0 {
        return 0.0;
    }
    holdings.sort_unstable();
    let weighted: f64 = holdings
        .iter()
        .enumerate()
        .map(|(i, &value)| (i as f64 + 1.0) * value as f64)
        .sum();
    let n = count as f64;
    ((2.0 * weighted) / (n * total as f64) - (n + 1.0) / n) as f32
}

#[derive(Clone, Debug)]
pub struct Economy {
    pub market: Market,
    pub realty: Realty,
}

impl Economy {
    pub fn new(population: usize) -> Self {
        Self {
            market: Market::new(500),
            realty: Realty::new(500, population * 6 / 10),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn market_only_buys_harvest_it_can_pay_for() {
        let mut market = Market::new(1);
        market.price = 4;
        let mut farmer = 0;
        let units = market.buy_harvest(&mut farmer);
        assert_eq!(units, 0);
        assert_eq!(farmer, 0);
        market.cash = 100;
        let units = market.buy_harvest(&mut farmer);
        assert_eq!(units, 2);
        assert_eq!(farmer, 4);
        assert_eq!(market.cash, 96);
    }

    #[test]
    fn full_shelves_stop_the_market_buying() {
        let mut market = Market::new(1000);
        market.stock = market.stock_cap;
        let mut farmer = 0;
        assert_eq!(market.buy_harvest(&mut farmer), 0);
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
    fn missing_rent_twice_means_eviction() {
        let mut realty = Realty::new(0, 1);
        realty.homes[0].tenant = Some(7);
        let (mut money, mut missed) = (0, 0);
        assert!(!realty.charge_rent(0, &mut money, &mut missed));
        assert!(realty.charge_rent(0, &mut money, &mut missed));
        assert!(realty.homes[0].tenant.is_none());
    }

    #[test]
    fn paying_rent_clears_missed_payments() {
        let mut realty = Realty::new(0, 1);
        realty.homes[0].tenant = Some(1);
        let (mut money, mut missed) = (0, 1);
        money += BASE_RENT;
        assert!(!realty.charge_rent(0, &mut money, &mut missed));
        assert_eq!(missed, 0);
        assert_eq!(realty.cash, BASE_RENT);
    }

    #[test]
    fn builders_are_only_paid_during_a_housing_shortage() {
        let mut realty = Realty::new(100, 5);
        let mut builder = 0;
        assert!(!realty.pay_builder(&mut builder, 3));
        assert_eq!(builder, 0);
        assert!(realty.pay_builder(&mut builder, 9));
        assert_eq!(builder, BUILDER_WAGE);
    }

    #[test]
    fn enough_building_work_creates_a_home() {
        let mut realty = Realty::new(10_000, 0);
        let mut builder = 0;
        for _ in 0..HOME_WORK {
            realty.pay_builder(&mut builder, 5);
        }
        assert_eq!(realty.homes.len(), 1);
    }

    #[test]
    fn gini_is_zero_for_equal_and_high_for_one_holder() {
        assert!(gini(&mut [10, 10, 10, 10]).abs() < 1e-6);
        assert!(gini(&mut [0, 0, 0, 100]) > 0.7);
        assert_eq!(gini(&mut []), 0.0);
    }

    #[test]
    fn genes_decide_who_fits_which_job() {
        let mut genes = [0.5; crate::genome::GENE_COUNT];
        genes[Gene::Craft as usize] = 1.0;
        genes[Gene::Athletics as usize] = 1.0;
        let builder = Genome::from_genes(genes);
        assert!(Job::Builder.fit(&builder) > Job::Clerk.fit(&builder));
    }
}
