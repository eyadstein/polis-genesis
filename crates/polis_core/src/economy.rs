//! Money, jobs, wages, and the food market.
//!
//! Money is whole coins and is never created or destroyed. It only moves
//! between people, the market, and the realty office. Housing lives in
//! the housing module.

use crate::genome::{Gene, Genome};
use crate::housing::Realty;
use crate::rng::Rng;

pub type Coins = i64;

pub const RENT_PERIOD: u64 = 100;
pub const HOUSING_PERIOD: u64 = 10;
pub const EVICTION_AFTER: u32 = 2;
pub const MEAL_RESTORE: f32 = 0.5;
pub const SAFETY_SAVINGS: Coins = 60;
pub const RESERVE: Coins = 500;
pub const EXPERIENCE_CAP: u32 = 1500;

const BASE_PRICE: f32 = 4.0;
const MIN_PRICE: Coins = 1;
const MAX_PRICE: Coins = 20;
const FOOD_PER_WORK: u32 = 2;
const SHOPKEEPER_WAGE: Coins = 5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Job {
    Farmer,
    Builder,
    Mechanic,
    Shopkeeper,
}

impl Job {
    pub const ALL: [Job; 4] = [Job::Farmer, Job::Builder, Job::Mechanic, Job::Shopkeeper];

    pub fn index(self) -> usize {
        self as usize
    }

    /// How well a person's genes suit this job, in [0, 1].
    pub fn fit(self, genome: &Genome) -> f32 {
        let (a, b) = match self {
            Job::Farmer => (Gene::Conscientiousness, Gene::Athletics),
            Job::Builder => (Gene::Craft, Gene::Athletics),
            Job::Mechanic => (Gene::Craft, Gene::Intellect),
            Job::Shopkeeper => (Gene::Charisma, Gene::Conscientiousness),
        };
        0.5 * genome.get(a) + 0.5 * genome.get(b)
    }

    /// Share of the town that the economy can employ in this job.
    pub fn share(self) -> f32 {
        match self {
            Job::Farmer => 0.26,
            Job::Builder => 0.06,
            Job::Mechanic => 0.06,
            Job::Shopkeeper => 0.12,
        }
    }

    /// Starting pay for one tick of work. Farmers are paid per unit of
    /// food at the market's wholesale price, so theirs follows the market.
    pub fn base_wage(self, wholesale: Coins) -> Coins {
        match self {
            Job::Farmer => FOOD_PER_WORK as Coins * wholesale,
            Job::Builder => 6,
            Job::Mechanic => 8,
            Job::Shopkeeper => SHOPKEEPER_WAGE,
        }
    }
}

/// Pay as a percent of the base wage: talent adds up to 40, experience up
/// to 40 more, starting from 70.
pub fn skill_percent(fit: f32, experience: u32) -> i64 {
    let talent = 70.0 + 40.0 * fit;
    let seasoned = 40.0 * (experience.min(EXPERIENCE_CAP) as f32 / EXPERIENCE_CAP as f32);
    (talent + seasoned).round() as i64
}

/// A rich employer pays up to 30 percent more, a struggling one 40 percent less.
pub fn solvency_percent(cash: Coins) -> i64 {
    (cash * 100 / RESERVE).clamp(60, 130)
}

/// The wage for one tick of work: base pay, scaled by the worker's skill and
/// by how well off the employer is.
pub fn wage_for(base: Coins, fit: f32, experience: u32, employer_cash: Coins) -> Coins {
    (base * skill_percent(fit, experience) * solvency_percent(employer_cash) / 10_000).max(1)
}

#[derive(Clone, Debug)]
pub struct Market {
    pub cash: Coins,
    pub stock: u32,
    pub stock_cap: u32,
    pub price: Coins,
    /// Meals the shop can still serve this tick. Shopkeepers raise it.
    pub service_left: u32,
}

impl Market {
    pub fn new(cash: Coins) -> Self {
        Self {
            cash,
            stock: 40,
            stock_cap: 100,
            price: BASE_PRICE as Coins,
            service_left: 20,
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
        self.stock > 0 && self.service_left > 0 && money >= self.price
    }

    pub fn sell_meal(&mut self, buyer: &mut Coins) -> bool {
        if !self.can_sell_to(*buyer) {
            return false;
        }
        *buyer -= self.price;
        self.cash += self.price;
        self.stock -= 1;
        self.service_left -= 1;
        true
    }

    /// A farmer delivers a harvest. The market takes it only if its shelves
    /// have room and it can pay the wage. Returns the wage paid.
    pub fn buy_harvest(&mut self, seller: &mut Coins, fit: f32, experience: u32) -> Coins {
        let room = self.stock_cap.saturating_sub(self.stock);
        let units = FOOD_PER_WORK.min(room);
        if units == 0 {
            return 0;
        }
        let base = Job::Farmer.base_wage(self.wholesale());
        let wage = wage_for(base, fit, experience, self.cash);
        if self.cash < wage {
            return 0;
        }
        self.cash -= wage;
        *seller += wage;
        self.stock += units;
        wage
    }

    pub fn pay_shopkeeper(&mut self, shopkeeper: &mut Coins, fit: f32, experience: u32) -> Coins {
        let wage = wage_for(SHOPKEEPER_WAGE, fit, experience, self.cash);
        if self.cash < wage {
            return 0;
        }
        self.cash -= wage;
        *shopkeeper += wage;
        wage
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
    pub fn new(population: usize, rng: &mut Rng) -> Self {
        Self {
            market: Market::new(500),
            realty: Realty::generate(500, population * 6 / 10, rng),
        }
    }
}

#[cfg(test)]
mod tests;
