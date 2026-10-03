//! Homes, districts, and the rent each home commands.
//!
//! The map is cut into districts. A home has a district, a kind, a number of
//! rooms, and a condition that wears down. Its rent follows from all of those,
//! from how attractive its district is, and from local demand.

use crate::agent::AgentId;
use crate::economy::{wage_for, Coins, EVICTION_AFTER};
use crate::genome::{Gene, Genome};
use crate::rng::Rng;

pub const DISTRICTS_PER_SIDE: i32 = 4;
pub const DISTRICT_COUNT: usize = (DISTRICTS_PER_SIDE * DISTRICTS_PER_SIDE) as usize;

const RENT_PER_ROOM: f32 = 2.0;
const BUILDER_WAGE: Coins = 6;
const MECHANIC_WAGE: Coins = 8;
const WORK_PER_ROOM: u32 = 12;
const WEAR_EMPTY: f32 = 2.0;
const WEAR_OCCUPIED: f32 = 3.0;
const REPAIR_AMOUNT: f32 = 8.0;
const REPAIR_BELOW: f32 = 85.0;
const MIN_PRESSURE: f32 = 0.6;
const MAX_PRESSURE: f32 = 1.6;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Shack,
    Flat,
    House,
    Villa,
}

impl Kind {
    pub const ALL: [Kind; 4] = [Kind::Shack, Kind::Flat, Kind::House, Kind::Villa];

    /// Smallest and largest number of rooms for this kind.
    pub fn room_range(self) -> (u8, u8) {
        match self {
            Kind::Shack => (1, 2),
            Kind::Flat => (2, 3),
            Kind::House => (3, 5),
            Kind::Villa => (5, 8),
        }
    }

    pub fn multiplier(self) -> f32 {
        match self {
            Kind::Shack => 0.6,
            Kind::Flat => 1.0,
            Kind::House => 1.6,
            Kind::Villa => 2.8,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Home {
    pub district: usize,
    pub kind: Kind,
    pub rooms: u8,
    /// 0 is derelict, 100 is new.
    pub condition: f32,
    pub tenant: Option<AgentId>,
    pub rent: Coins,
}

impl Home {
    /// Rent before district appeal and demand: size, kind, and condition.
    pub fn base_rent(&self) -> f32 {
        RENT_PER_ROOM
            * f32::from(self.rooms)
            * self.kind.multiplier()
            * (0.5 + 0.5 * self.condition / 100.0)
    }
}

#[derive(Clone, Debug)]
pub struct District {
    /// 0 is unattractive, 1 is very attractive.
    pub appeal: f32,
    /// Share of homes that are occupied.
    pub occupancy: f32,
    /// Rent pressure from demand: above 1 when full, below 1 when empty.
    pub pressure: f32,
    pub neighbor_wealth: f32,
}

impl District {
    fn new() -> Self {
        Self {
            appeal: 0.5,
            occupancy: 0.0,
            pressure: 1.0,
            neighbor_wealth: 0.5,
        }
    }
}

/// A home under construction.
#[derive(Clone, Debug)]
pub struct Project {
    pub district: usize,
    pub kind: Kind,
    pub rooms: u8,
    pub progress: u32,
    pub needed: u32,
}

/// Which district a map position falls in.
pub fn district_of(pos: (i32, i32), width: i32, height: i32) -> usize {
    let x = (pos.0 * DISTRICTS_PER_SIDE / width).clamp(0, DISTRICTS_PER_SIDE - 1);
    let y = (pos.1 * DISTRICTS_PER_SIDE / height).clamp(0, DISTRICTS_PER_SIDE - 1);
    (y * DISTRICTS_PER_SIDE + x) as usize
}

fn district_distance(a: usize, b: usize) -> i32 {
    let side = DISTRICTS_PER_SIDE as usize;
    let (ax, ay) = ((a % side) as i32, (a / side) as i32);
    let (bx, by) = ((b % side) as i32, (b / side) as i32);
    (ax - bx).abs() + (ay - by).abs()
}

/// How much a person likes a home, beyond what it costs. Outgoing people
/// like busy districts, anxious people like quiet ones, open minded people
/// like space.
pub fn taste(home: &Home, district: &District, genome: &Genome) -> f32 {
    let busy = genome.get(Gene::Extraversion) * district.occupancy;
    let quiet = genome.get(Gene::Neuroticism) * (1.0 - district.occupancy);
    let space = genome.get(Gene::Openness) * f32::from(home.rooms) / 8.0;
    district.appeal + 0.5 * busy + 0.5 * quiet + 0.8 * space + 0.3 * home.condition / 100.0
}

#[derive(Clone, Debug)]
pub struct Realty {
    pub cash: Coins,
    pub homes: Vec<Home>,
    pub districts: Vec<District>,
    pub project: Option<Project>,
}

impl Realty {
    pub fn empty(cash: Coins) -> Self {
        Self {
            cash,
            homes: Vec::new(),
            districts: vec![District::new(); DISTRICT_COUNT],
            project: None,
        }
    }

    /// A starting stock of mixed homes spread over the districts.
    pub fn generate(cash: Coins, count: usize, rng: &mut Rng) -> Self {
        let mut realty = Self::empty(cash);
        for _ in 0..count {
            let roll = rng.next_f32();
            let kind = if roll < 0.30 {
                Kind::Shack
            } else if roll < 0.70 {
                Kind::Flat
            } else if roll < 0.95 {
                Kind::House
            } else {
                Kind::Villa
            };
            let (low, high) = kind.room_range();
            let rooms = low + rng.below(u32::from(high - low) + 1) as u8;
            realty.homes.push(Home {
                district: rng.below(DISTRICT_COUNT as u32) as usize,
                kind,
                rooms,
                condition: 60.0 + rng.below(40) as f32,
                tenant: None,
                rent: 1,
            });
        }
        realty
    }

    pub fn vacancies(&self) -> usize {
        self.homes.iter().filter(|h| h.tenant.is_none()).count()
    }

    pub fn needs_building(&self, homeless: usize) -> bool {
        homeless > self.vacancies()
    }

    pub fn needs_repair(&self) -> bool {
        self.homes.iter().any(|h| h.condition < REPAIR_BELOW)
    }

    /// The rent a home commands in its district right now.
    pub fn quote(&self, home: &Home) -> Coins {
        let district = &self.districts[home.district];
        let appeal_factor = 0.6 + 0.8 * district.appeal;
        let rent = home.base_rent() * appeal_factor * district.pressure;
        (rent.round() as Coins).max(1)
    }

    /// Recompute district appeal, demand pressure, and every rent.
    /// `tenants` holds total savings and head count of residents per district.
    pub fn refresh(&mut self, tenants: &[(Coins, u32)], market_district: usize) {
        let people: u32 = tenants.iter().map(|t| t.1).sum();
        let savings: Coins = tenants.iter().map(|t| t.0).sum();
        let overall = if people == 0 {
            1.0
        } else {
            (savings as f32 / people as f32).max(1.0)
        };
        for (id, district) in self.districts.iter_mut().enumerate() {
            let homes = self.homes.iter().filter(|h| h.district == id);
            let total = homes.clone().count();
            let occupied = homes.clone().filter(|h| h.tenant.is_some()).count();
            let condition: f32 = homes.map(|h| h.condition).sum();
            district.occupancy = if total == 0 {
                0.0
            } else {
                occupied as f32 / total as f32
            };
            let mean_condition = if total == 0 {
                0.5
            } else {
                condition / total as f32 / 100.0
            };
            let (sum, count) = tenants[id];
            district.neighbor_wealth = if count == 0 {
                0.3
            } else {
                (sum as f32 / count as f32 / (2.0 * overall)).clamp(0.0, 1.0)
            };
            let market_pull = 1.0 / (1.0 + district_distance(id, market_district) as f32);
            district.appeal = (0.35 * market_pull
                + 0.30 * district.neighbor_wealth
                + 0.25 * mean_condition
                + 0.10 * (1.0 - district.occupancy))
                .clamp(0.0, 1.0);
            if district.occupancy > 0.9 {
                district.pressure = (district.pressure + 0.05).min(MAX_PRESSURE);
            } else if district.occupancy < 0.6 {
                district.pressure = (district.pressure - 0.05).max(MIN_PRESSURE);
            }
        }
        let quotes: Vec<Coins> = self.homes.iter().map(|h| self.quote(h)).collect();
        for (home, rent) in self.homes.iter_mut().zip(quotes) {
            home.rent = rent;
        }
    }

    /// Every home wears down, occupied ones faster.
    pub fn age_homes(&mut self) {
        for home in &mut self.homes {
            let wear = if home.tenant.is_some() {
                WEAR_OCCUPIED
            } else {
                WEAR_EMPTY
            };
            home.condition = (home.condition - wear).max(0.0);
        }
    }

    /// The vacant home a person would pick: the best tasted one they can
    /// afford for three rent periods. Ties go to the lowest index.
    pub fn choose_home(&self, genome: &Genome, money: Coins) -> Option<usize> {
        let mut best: Option<(usize, f32)> = None;
        for (index, home) in self.homes.iter().enumerate() {
            if home.tenant.is_some() || home.rent * 3 > money {
                continue;
            }
            let cost_worry = home.rent as f32 / money.max(1) as f32;
            let score = taste(home, &self.districts[home.district], genome) - cost_worry;
            if best.is_none_or(|(_, top)| score > top) {
                best = Some((index, score));
            }
        }
        best.map(|(index, _)| index)
    }

    /// Start a building project where demand is strongest. Richer districts
    /// get bigger and finer homes.
    pub fn plan_project(&mut self, rng: &mut Rng) {
        if self.project.is_some() {
            return;
        }
        let mut target = 0;
        let mut best = f32::MIN;
        for (id, district) in self.districts.iter().enumerate() {
            let want = district.pressure + 0.5 * district.appeal;
            if want > best {
                best = want;
                target = id;
            }
        }
        let wealth = self.districts[target].neighbor_wealth;
        let roll = rng.next_f32() * 0.6 + wealth * 0.5;
        let kind = if roll < 0.30 {
            Kind::Shack
        } else if roll < 0.55 {
            Kind::Flat
        } else if roll < 0.80 {
            Kind::House
        } else {
            Kind::Villa
        };
        let (low, high) = kind.room_range();
        let rooms = low + rng.below(u32::from(high - low) + 1) as u8;
        self.project = Some(Project {
            district: target,
            kind,
            rooms,
            progress: 0,
            needed: u32::from(rooms) * WORK_PER_ROOM,
        });
    }

    /// Pay a builder for one tick on the current project. Returns the wage.
    pub fn pay_builder(&mut self, builder: &mut Coins, fit: f32, experience: u32) -> Coins {
        let wage = wage_for(BUILDER_WAGE, fit, experience, self.cash);
        let Some(project) = self.project.as_mut() else {
            return 0;
        };
        if self.cash < wage {
            return 0;
        }
        self.cash -= wage;
        *builder += wage;
        project.progress += 1;
        if project.progress >= project.needed {
            let done = self.project.take().expect("project exists");
            let mut home = Home {
                district: done.district,
                kind: done.kind,
                rooms: done.rooms,
                condition: 100.0,
                tenant: None,
                rent: 1,
            };
            home.rent = self.quote(&home);
            self.homes.push(home);
        }
        wage
    }

    /// Pay a mechanic for one tick of repairs on the most worn home.
    /// Returns the wage, or 0 if nothing needs fixing.
    pub fn pay_mechanic(&mut self, mechanic: &mut Coins, fit: f32, experience: u32) -> Coins {
        let wage = wage_for(MECHANIC_WAGE, fit, experience, self.cash);
        if self.cash < wage {
            return 0;
        }
        let worst = self
            .homes
            .iter()
            .enumerate()
            .filter(|(_, h)| h.condition < REPAIR_BELOW)
            .min_by(|a, b| a.1.condition.total_cmp(&b.1.condition))
            .map(|(index, _)| index);
        let Some(index) = worst else {
            return 0;
        };
        self.cash -= wage;
        *mechanic += wage;
        let home = &mut self.homes[index];
        home.condition = (home.condition + REPAIR_AMOUNT).min(100.0);
        wage
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

#[cfg(test)]
mod tests;
