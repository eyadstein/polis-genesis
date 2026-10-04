//! The world: a grid with food, an economy, and the people living in it.

use crate::agent::{money_pressure, Action, Agent, AgentId, Death, Percept, ADULT_AGE};
use crate::economy::{
    gini, surplus, Coins, Economy, Job, HOUSING_PERIOD, MEAL_RESTORE, RENT_PERIOD, RESERVE,
};
use crate::family::{
    birth_chance, bond_gain, can_have_child, can_pair, inherit_split, pair_mut, BIRTH_COOLDOWN,
    BOND_TO_PAIR, MUTATION_RATE, MUTATION_SIZE,
};
use crate::genome::Genome;
use crate::housing::{district_of, DISTRICT_COUNT};
use crate::names::NameBook;
use crate::needs::Need;
use crate::rng::Rng;
use std::collections::BTreeMap;

#[derive(Clone, Debug)]
pub struct WorldConfig {
    pub seed: u64,
    pub width: i32,
    pub height: i32,
    pub population: u32,
}

impl Default for WorldConfig {
    fn default() -> Self {
        Self {
            seed: 1,
            width: 64,
            height: 64,
            population: 200,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Stats {
    pub tick: u64,
    pub alive: usize,
    pub starved: usize,
    pub died_old: usize,
    pub mean_valence: f32,
    pub mean_hunger: f32,
    pub mean_money: f32,
    pub gini: f32,
    pub employed: usize,
    pub homeless: usize,
    pub homes: usize,
    pub vacant: usize,
    pub mean_rent: f32,
    pub food_price: Coins,
    pub food_stock: u32,
    pub children: usize,
    pub couples: usize,
    pub births: u64,
    pub max_generation: u32,
}

/// Running totals of what each job has paid, for comparing jobs.
#[derive(Clone, Debug, Default)]
pub struct WageLedger {
    pub total: [Coins; Job::ALL.len()],
    pub ticks: [u64; Job::ALL.len()],
}

impl WageLedger {
    fn record(&mut self, job: Job, wage: Coins) {
        self.total[job.index()] += wage;
        self.ticks[job.index()] += 1;
    }
}

/// Who is working where this tick, against how many jobs exist.
struct Labor {
    filled: [usize; Job::ALL.len()],
    limit: [usize; Job::ALL.len()],
}

impl Labor {
    fn new(agents: &[Agent], alive: usize, building_needed: bool, repair_needed: bool) -> Self {
        let mut filled = [0; Job::ALL.len()];
        for job in agents.iter().filter(|a| a.is_alive()).filter_map(|a| a.job) {
            filled[job.index()] += 1;
        }
        let mut limit = [0; Job::ALL.len()];
        for job in Job::ALL {
            let wanted = (job.share() * alive as f32).ceil() as usize;
            let open = match job {
                Job::Builder => building_needed,
                Job::Mechanic => repair_needed,
                _ => true,
            };
            limit[job.index()] = if open { wanted } else { 0 };
        }
        Self { filled, limit }
    }

    fn has_opening(&self, job: Job) -> bool {
        self.filled[job.index()] < self.limit[job.index()]
    }

    fn release(&mut self, job: Job) {
        self.filled[job.index()] = self.filled[job.index()].saturating_sub(1);
    }
}

/// What a person leaves behind when they die.
struct Estate {
    id: AgentId,
    money: Coins,
    home: Option<usize>,
    partner: Option<AgentId>,
}

pub struct World {
    pub tick: u64,
    pub width: i32,
    pub height: i32,
    pub agents: Vec<Agent>,
    pub economy: Economy,
    pub wages: WageLedger,
    food: Vec<f32>,
    rng: Rng,
    rent_countdown: u64,
    housing_countdown: u64,
    names: NameBook,
    bonds: BTreeMap<(AgentId, AgentId), f32>,
    estates: Vec<Estate>,
    births: u64,
}

const FOOD_REGROWTH: f32 = 0.002;
const SEARCH_RADIUS: i32 = 6;
const STARVATION_LIMIT: u32 = 30;
const QUIT_AFTER_UNPAID: u32 = 20;
const COURT_REACH: i32 = 3;
const MOVE_OUT_SAVINGS: Coins = 60;

impl World {
    pub fn new(config: WorldConfig) -> Self {
        let mut rng = Rng::new(config.seed);
        let cells = (config.width * config.height) as usize;
        let food = (0..cells).map(|_| rng.next_f32()).collect();
        let mut names = NameBook::new();
        let mut agents = Vec::with_capacity(config.population as usize);
        for id in 0..config.population {
            let genome = Genome::random(&mut rng);
            let name = names.fresh(&mut rng);
            let pos = (
                rng.below(config.width as u32) as i32,
                rng.below(config.height as u32) as i32,
            );
            let money = 60 + Coins::from(rng.below(80));
            let mut person = Agent::new(id, name, genome, pos, money);
            person.age = ADULT_AGE + rng.below(12_000);
            agents.push(person);
        }
        let economy = Economy::new(config.population as usize, &mut rng);
        let mut world = Self {
            tick: 0,
            width: config.width,
            height: config.height,
            agents,
            economy,
            wages: WageLedger::default(),
            food,
            rng,
            rent_countdown: RENT_PERIOD,
            housing_countdown: 0,
            names,
            bonds: BTreeMap::new(),
            estates: Vec::new(),
            births: 0,
        };
        world.refresh_housing(&[]);
        world
    }

    fn cell(&self, pos: (i32, i32)) -> usize {
        (pos.1 * self.width + pos.0) as usize
    }

    fn wrap(&self, pos: (i32, i32)) -> (i32, i32) {
        (pos.0.rem_euclid(self.width), pos.1.rem_euclid(self.height))
    }

    fn random_step(&mut self, pos: (i32, i32)) -> (i32, i32) {
        let dx = self.rng.below(3) as i32 - 1;
        let dy = self.rng.below(3) as i32 - 1;
        self.wrap((pos.0 + dx, pos.1 + dy))
    }

    /// Step one cell toward the richest nearby food, or wander if none.
    fn step_toward_food(&mut self, pos: (i32, i32)) -> (i32, i32) {
        let mut best: Option<((i32, i32), f32)> = None;
        for dy in -SEARCH_RADIUS..=SEARCH_RADIUS {
            for dx in -SEARCH_RADIUS..=SEARCH_RADIUS {
                let target = self.wrap((pos.0 + dx, pos.1 + dy));
                let amount = self.food[self.cell(target)];
                let distance = (dx.abs() + dy.abs()) as f32 + 1.0;
                let score = amount / distance;
                if amount > 0.1 && best.is_none_or_worse(score) {
                    best = Some(((dx, dy), score));
                }
            }
        }
        match best {
            Some(((dx, dy), _)) => self.wrap((pos.0 + dx.signum(), pos.1 + dy.signum())),
            None => self.random_step(pos),
        }
    }

    fn crowd_map(&self) -> BTreeMap<(i32, i32), u32> {
        let mut crowd = BTreeMap::new();
        for agent in self.agents.iter().filter(|a| a.is_alive()) {
            *crowd.entry(agent.pos).or_insert(0) += 1;
        }
        crowd
    }

    /// Advance the world by one tick.
    pub fn step(&mut self) {
        for amount in self.food.iter_mut() {
            *amount = (*amount + FOOD_REGROWTH).min(1.0);
        }
        let crowd = self.crowd_map();
        let mut agents = std::mem::take(&mut self.agents);

        if self.housing_countdown == 0 {
            self.assign_housing(&mut agents);
            self.housing_countdown = HOUSING_PERIOD;
        }
        self.housing_countdown -= 1;
        if self.rent_countdown == 0 {
            self.collect_rent(&mut agents);
            self.economy.realty.age_homes();
            self.refresh_housing(&agents);
            self.pay_dividends(&mut agents);
            self.rent_countdown = RENT_PERIOD;
        }
        self.rent_countdown -= 1;

        let alive = agents.iter().filter(|a| a.is_alive()).count();
        let homeless = agents
            .iter()
            .filter(|a| a.is_alive() && a.home.is_none())
            .count();
        self.economy.market.reprice(alive);
        let building_needed = self.economy.realty.needs_building(homeless);
        if building_needed {
            self.economy.realty.plan_project(&mut self.rng);
        }
        let repair_needed = self.economy.realty.needs_repair();
        let adults = agents
            .iter()
            .filter(|a| a.is_alive() && a.is_adult())
            .count();
        let mut labor = Labor::new(&agents, adults, building_needed, repair_needed);
        for agent in agents
            .iter_mut()
            .filter(|a| a.is_alive() && a.is_adult() && a.job.is_none())
        {
            self.try_hire(agent, &mut labor);
        }
        self.economy.market.service_left = 3 + 4 * labor.filled[Job::Shopkeeper.index()] as u32;

        self.feed_children(&mut agents);
        for agent in agents.iter_mut().filter(|a| a.is_alive()) {
            self.live_one_tick(agent, &crowd, &mut labor, homeless);
        }
        self.court(&mut agents);
        self.births(&mut agents);
        self.distribute_estates(&mut agents);
        self.agents = agents;
        self.tick += 1;
    }

    pub fn run(&mut self, ticks: u64) {
        for _ in 0..ticks {
            self.step();
        }
    }

    /// Homeless adults, and grown children who can afford to leave, pick the
    /// home they like best among those they can afford. Couples search
    /// together on pooled savings and bring their dependents along. The
    /// housing market only moves every few ticks.
    fn assign_housing(&mut self, agents: &mut [Agent]) {
        for i in 0..agents.len() {
            let person = &agents[i];
            if !person.is_alive() || !person.is_adult() {
                continue;
            }
            let homeless = person.home.is_none();
            let outgrown = person
                .home
                .is_some_and(|h| self.economy.realty.homes[h].tenant != Some(person.id))
                && person.partner.is_none()
                && person.money >= MOVE_OUT_SAVINGS;
            if !homeless && !outgrown {
                continue;
            }
            let partner = person.partner.map(|p| p as usize);
            if partner.is_some_and(|p| p < i) {
                continue;
            }
            let budget = person.money + partner.map_or(0, |p| agents[p].money);
            let Some(index) = self.economy.realty.choose_home(&person.genome, budget) else {
                continue;
            };
            let id = person.id;
            let partner_id = partner.map(|p| agents[p].id);
            self.economy.realty.homes[index].tenant = Some(id);
            agents[i].home = Some(index);
            agents[i].missed_rent = 0;
            for other in agents
                .iter_mut()
                .filter(|a| a.is_alive() && a.id != id && a.home.is_none())
            {
                let own_child = other.parents.is_some_and(|(x, y)| {
                    x == id || y == id || Some(x) == partner_id || Some(y) == partner_id
                });
                if Some(other.id) == partner_id || (!other.is_adult() && own_child) {
                    other.home = Some(index);
                }
            }
        }
    }

    /// Recompute district appeal and every rent from who lives where.
    fn refresh_housing(&mut self, agents: &[Agent]) {
        let mut tenants = [(0, 0); DISTRICT_COUNT];
        for agent in agents.iter().filter(|a| a.is_alive()) {
            if let Some(index) = agent.home {
                let district = self.economy.realty.homes[index].district;
                tenants[district].0 += agent.money;
                tenants[district].1 += 1;
            }
        }
        let market_district =
            district_of((self.width / 2, self.height / 2), self.width, self.height);
        self.economy.realty.refresh(&tenants, market_district);
    }

    /// The head of each household pays the rent. A household that cannot
    /// pay twice in a row loses the home, and everyone in it with it.
    fn collect_rent(&mut self, agents: &mut [Agent]) {
        let mut evicted = Vec::new();
        for agent in agents.iter_mut().filter(|a| a.is_alive()) {
            let Some(index) = agent.home else {
                continue;
            };
            if self.economy.realty.homes[index].tenant == Some(agent.id)
                && self
                    .economy
                    .realty
                    .charge_rent(index, &mut agent.money, &mut agent.missed_rent)
            {
                evicted.push(index);
            }
        }
        for agent in agents.iter_mut() {
            if agent.home.is_some_and(|h| evicted.contains(&h)) {
                agent.home = None;
            }
        }
    }

    /// Money the market and realty hold beyond their reserves is shared out
    /// equally as a town dividend, so coins keep circulating. Any remainder
    /// that does not divide evenly stays in the fund.
    fn pay_dividends(&mut self, agents: &mut [Agent]) {
        let living = agents.iter().filter(|a| a.is_alive()).count() as Coins;
        if living == 0 {
            return;
        }
        let market_share = surplus(self.economy.market.cash, RESERVE) / living;
        let realty_share = surplus(self.economy.realty.cash, RESERVE) / living;
        self.economy.market.cash -= market_share * living;
        self.economy.realty.cash -= realty_share * living;
        for agent in agents.iter_mut().filter(|a| a.is_alive()) {
            agent.money += market_share + realty_share;
        }
    }

    /// A person's belongings are set aside until the end of the tick, when
    /// their family inherits them.
    fn settle_estate(&mut self, agent: &mut Agent) {
        self.estates.push(Estate {
            id: agent.id,
            money: agent.money,
            home: agent.home,
            partner: agent.partner,
        });
        agent.money = 0;
        agent.home = None;
        agent.job = None;
        agent.partner = None;
    }

    /// Money goes to the partner, else to the children, else to the realty
    /// office. A household whose head died passes to the partner or the
    /// eldest resident.
    fn distribute_estates(&mut self, agents: &mut [Agent]) {
        for estate in std::mem::take(&mut self.estates) {
            let mut heirs: Vec<usize> = Vec::new();
            if let Some(p) = estate.partner.map(|p| p as usize) {
                if agents[p].is_alive() {
                    heirs.push(p);
                }
            }
            if heirs.is_empty() {
                heirs = (0..agents.len())
                    .filter(|&k| {
                        agents[k].is_alive()
                            && agents[k]
                                .parents
                                .is_some_and(|(x, y)| x == estate.id || y == estate.id)
                    })
                    .collect();
            }
            if heirs.is_empty() {
                self.economy.realty.cash += estate.money;
            } else {
                for (&k, share) in heirs.iter().zip(inherit_split(estate.money, heirs.len())) {
                    agents[k].money += share;
                }
            }
            if let Some(p) = estate.partner.map(|p| p as usize) {
                if agents[p].partner == Some(estate.id) {
                    agents[p].partner = None;
                }
            }
            let Some(home) = estate.home else {
                continue;
            };
            if self.economy.realty.homes[home].tenant == Some(estate.id) {
                let heir = agents
                    .iter()
                    .filter(|a| a.is_alive() && a.home == Some(home))
                    .max_by_key(|a| (a.is_adult(), a.age))
                    .map(|a| a.id);
                self.economy.realty.homes[home].tenant = heir;
            }
        }
    }

    fn near(&self, a: (i32, i32), b: (i32, i32), reach: i32) -> bool {
        let dx = (a.0 - b.0).abs();
        let dy = (a.1 - b.1).abs();
        dx.min(self.width - dx) <= reach && dy.min(self.height - dy) <= reach
    }

    /// Single adults who spend time socializing close to each other grow
    /// fond of each other. Fond enough means a couple and one household.
    fn court(&mut self, agents: &mut [Agent]) {
        let seekers: Vec<usize> = agents
            .iter()
            .enumerate()
            .filter(|(_, a)| {
                a.is_alive() && a.is_adult() && a.partner.is_none() && a.action == Action::Socialize
            })
            .map(|(i, _)| i)
            .collect();
        let mut ready = Vec::new();
        for (n, &i) in seekers.iter().enumerate() {
            for &j in &seekers[n + 1..] {
                if !can_pair(&agents[i], &agents[j])
                    || !self.near(agents[i].pos, agents[j].pos, COURT_REACH)
                {
                    continue;
                }
                let key = (
                    agents[i].id.min(agents[j].id),
                    agents[i].id.max(agents[j].id),
                );
                let bond = self.bonds.entry(key).or_insert(0.0);
                *bond += bond_gain(&agents[i], &agents[j]);
                if *bond >= BOND_TO_PAIR {
                    ready.push((i, j, key));
                }
            }
        }
        for (i, j, key) in ready {
            if agents[i].partner.is_none() && agents[j].partner.is_none() {
                agents[i].partner = Some(agents[j].id);
                agents[j].partner = Some(agents[i].id);
                self.bonds.remove(&key);
                self.merge_households(agents, i, j);
            }
        }
    }

    /// A new couple share the bigger of their two homes.
    fn merge_households(&mut self, agents: &mut [Agent], i: usize, j: usize) {
        let rooms_i = agents[i]
            .home
            .map_or(0, |h| self.economy.realty.homes[h].rooms);
        let rooms_j = agents[j]
            .home
            .map_or(0, |h| self.economy.realty.homes[h].rooms);
        let (stay, mover) = if rooms_i >= rooms_j { (i, j) } else { (j, i) };
        let Some(target) = agents[stay].home else {
            return;
        };
        let id = agents[mover].id;
        match agents[mover].home {
            Some(from) if from == target => {}
            Some(from) => {
                for a in agents.iter_mut().filter(|a| a.home == Some(from)) {
                    a.home = Some(target);
                }
                self.economy.realty.homes[from].tenant = None;
            }
            None => {
                agents[mover].home = Some(target);
                for a in agents.iter_mut().filter(|a| {
                    a.home.is_none()
                        && !a.is_adult()
                        && a.parents.is_some_and(|(x, y)| x == id || y == id)
                }) {
                    a.home = Some(target);
                }
            }
        }
    }

    /// Couples with room, savings, and time to spare sometimes have a child
    /// who inherits a mix of both genomes, with a little mutation.
    fn births(&mut self, agents: &mut Vec<Agent>) {
        for agent in agents.iter_mut() {
            agent.baby_cooldown = agent.baby_cooldown.saturating_sub(1);
        }
        let mut newborns: Vec<Agent> = Vec::new();
        for i in 0..agents.len() {
            let Some(partner) = agents[i].partner else {
                continue;
            };
            let j = partner as usize;
            if j < i {
                continue;
            }
            let (a, b) = (&agents[i], &agents[j]);
            let Some(home) = a.home.filter(|h| b.home == Some(*h)) else {
                continue;
            };
            let rooms = usize::from(self.economy.realty.homes[home].rooms);
            let residents = agents
                .iter()
                .filter(|p| p.is_alive() && p.home == Some(home))
                .count();
            let kids = agents
                .iter()
                .filter(|p| p.is_alive() && !p.is_adult() && p.home == Some(home))
                .count();
            if !can_have_child(a, b, rooms, residents, kids) || !self.rng.chance(birth_chance(a, b))
            {
                continue;
            }
            let genome = Genome::crossbreed(
                &a.genome,
                &b.genome,
                &mut self.rng,
                MUTATION_RATE,
                MUTATION_SIZE,
            );
            let name = self.names.fresh(&mut self.rng);
            let id = (agents.len() + newborns.len()) as AgentId;
            let mut child = Agent::new(id, name, genome, a.pos, 0);
            child.home = Some(home);
            child.parents = Some((a.id, b.id));
            child.generation = a.generation.max(b.generation) + 1;
            newborns.push(child);
            agents[i].baby_cooldown = BIRTH_COOLDOWN;
            agents[j].baby_cooldown = BIRTH_COOLDOWN;
        }
        self.births += newborns.len() as u64;
        agents.extend(newborns);
    }

    /// The adult in charge of a child's household, or a living parent.
    fn guardian_of(&self, agents: &[Agent], child: &Agent) -> Option<usize> {
        let usable = |k: usize| agents[k].is_alive() && agents[k].is_adult();
        let head = child
            .home
            .and_then(|h| self.economy.realty.homes[h].tenant)
            .map(|id| id as usize)
            .filter(|&k| usable(k));
        let parent = child.parents.and_then(|(x, y)| {
            [x, y]
                .into_iter()
                .map(|id| id as usize)
                .find(|&k| usable(k))
        });
        head.or(parent)
    }

    /// Hungry children are fed by their guardian when the shop has food.
    fn feed_children(&mut self, agents: &mut [Agent]) {
        for i in 0..agents.len() {
            if !agents[i].is_alive() || agents[i].is_adult() || agents[i].needs.hunger > 0.6 {
                continue;
            }
            let Some(g) = self.guardian_of(agents, &agents[i]) else {
                continue;
            };
            let (child, guardian) = pair_mut(agents, i, g);
            if self.economy.market.sell_meal(&mut guardian.money) {
                child.needs.add(Need::Hunger, MEAL_RESTORE);
            }
        }
    }

    fn try_hire(&mut self, agent: &mut Agent, labor: &mut Labor) {
        let mut best: Option<(Job, f32)> = None;
        for job in Job::ALL.into_iter().filter(|j| labor.has_opening(*j)) {
            let score = job.fit(&agent.genome) + self.rng.next_f32() * 0.1;
            if best.is_none_or(|(_, top)| score > top) {
                best = Some((job, score));
            }
        }
        if let Some((job, _)) = best {
            agent.job = Some(job);
            agent.unpaid_streak = 0;
            labor.filled[job.index()] += 1;
        }
    }

    fn work(&mut self, agent: &mut Agent, labor: &mut Labor, homeless: usize) {
        let _ = homeless;
        agent.needs.add(Need::Energy, -0.01);
        let Some(job) = agent.job else {
            return;
        };
        let fit = job.fit(&agent.genome);
        let experience = agent.seasoning(job);
        let wage = match job {
            Job::Farmer => self
                .economy
                .market
                .buy_harvest(&mut agent.money, fit, experience),
            Job::Shopkeeper => {
                self.economy
                    .market
                    .pay_shopkeeper(&mut agent.money, fit, experience)
            }
            Job::Builder => self
                .economy
                .realty
                .pay_builder(&mut agent.money, fit, experience),
            Job::Mechanic => self
                .economy
                .realty
                .pay_mechanic(&mut agent.money, fit, experience),
        };
        agent.needs.add(Need::Purpose, 0.03);
        if wage > 0 {
            agent.unpaid_streak = 0;
            agent.experience[job.index()] += 1;
            self.wages.record(job, wage);
        } else {
            agent.unpaid_streak += 1;
            if agent.unpaid_streak > QUIT_AFTER_UNPAID {
                agent.job = None;
                labor.release(job);
            }
        }
    }

    fn live_one_tick(
        &mut self,
        agent: &mut Agent,
        crowd: &BTreeMap<(i32, i32), u32>,
        labor: &mut Labor,
        homeless: usize,
    ) {
        agent.needs.decay(&agent.genome);
        agent.mood.update(&agent.needs, &agent.genome);

        let percept = Percept {
            people_nearby: crowd
                .get(&agent.pos)
                .copied()
                .unwrap_or(1)
                .saturating_sub(1),
            food_underfoot: self.food[self.cell(agent.pos)] > 0.1,
            meal_affordable: self.economy.market.can_sell_to(agent.money),
            employed: agent.job.is_some(),
            money_pressure: money_pressure(agent.money),
        };
        agent.action = agent.choose_action(&percept, &mut self.rng);

        match agent.action {
            Action::Eat => {
                let index = self.cell(agent.pos);
                if self.economy.market.sell_meal(&mut agent.money) {
                    agent.needs.add(Need::Hunger, MEAL_RESTORE);
                } else if self.food[index] > 0.1 {
                    let bite = self.food[index].min(0.3);
                    self.food[index] -= bite;
                    agent.needs.add(Need::Hunger, bite * 1.5);
                } else {
                    agent.pos = self.step_toward_food(agent.pos);
                }
            }
            Action::Rest => {
                let comfort = match agent.home {
                    Some(index) => {
                        0.025 + 0.025 * self.economy.realty.homes[index].condition / 100.0
                    }
                    None => 0.02,
                };
                agent.needs.add(Need::Energy, comfort);
            }
            Action::Socialize => {
                if percept.people_nearby > 0 {
                    agent.needs.add(Need::Social, 0.04);
                } else {
                    agent.pos = self.random_step(agent.pos);
                }
            }
            Action::Work => self.work(agent, labor, homeless),
            Action::Wander => agent.pos = self.random_step(agent.pos),
        }

        agent.age += 1;
        if agent.needs.hunger <= 0.02 {
            agent.starving_for += 1;
        } else {
            agent.starving_for = 0;
        }
        if agent.starving_for > STARVATION_LIMIT {
            agent.death = Some(Death::Starvation);
        } else if agent.age > agent.lifespan() {
            agent.death = Some(Death::OldAge);
        }
        if agent.death.is_some() {
            if let Some(job) = agent.job {
                labor.release(job);
            }
            self.settle_estate(agent);
        }
    }

    /// All coins in the world. This never changes.
    pub fn total_money(&self) -> Coins {
        let held: Coins = self.agents.iter().map(|a| a.money).sum();
        held + self.economy.market.cash + self.economy.realty.cash
    }

    /// Average rent actually being paid.
    pub fn mean_rent(&self) -> f32 {
        let paying: Vec<Coins> = self
            .economy
            .realty
            .homes
            .iter()
            .filter(|h| h.tenant.is_some())
            .map(|h| h.rent)
            .collect();
        if paying.is_empty() {
            return 0.0;
        }
        paying.iter().sum::<Coins>() as f32 / paying.len() as f32
    }

    pub fn stats(&self) -> Stats {
        let alive: Vec<&Agent> = self.agents.iter().filter(|a| a.is_alive()).collect();
        let count = alive.len().max(1) as f32;
        let mut holdings: Vec<Coins> = alive.iter().map(|a| a.money).collect();
        let money_sum: Coins = holdings.iter().sum();
        Stats {
            tick: self.tick,
            alive: alive.len(),
            starved: self
                .agents
                .iter()
                .filter(|a| a.death == Some(Death::Starvation))
                .count(),
            died_old: self
                .agents
                .iter()
                .filter(|a| a.death == Some(Death::OldAge))
                .count(),
            mean_valence: alive.iter().map(|a| a.mood.valence).sum::<f32>() / count,
            mean_hunger: alive.iter().map(|a| a.needs.hunger).sum::<f32>() / count,
            mean_money: money_sum as f32 / count,
            gini: gini(&mut holdings),
            employed: alive.iter().filter(|a| a.job.is_some()).count(),
            homeless: alive.iter().filter(|a| a.home.is_none()).count(),
            homes: self.economy.realty.homes.len(),
            vacant: self.economy.realty.vacancies(),
            mean_rent: self.mean_rent(),
            food_price: self.economy.market.price,
            food_stock: self.economy.market.stock,
            children: alive.iter().filter(|a| !a.is_adult()).count(),
            couples: alive.iter().filter(|a| a.partner.is_some()).count() / 2,
            births: self.births,
            max_generation: self.agents.iter().map(|a| a.generation).max().unwrap_or(0),
        }
    }

    /// A fingerprint of the whole world, used to prove determinism.
    pub fn state_hash(&self) -> u64 {
        let mut hash: u64 = 0xCBF2_9CE4_8422_2325;
        let mut mix = |value: u64| {
            hash ^= value;
            hash = hash.wrapping_mul(0x0000_0100_0000_01B3);
        };
        mix(self.tick);
        for agent in &self.agents {
            mix(u64::from(agent.id));
            mix(agent.pos.0 as u64);
            mix(agent.pos.1 as u64);
            mix(u64::from(agent.age));
            mix(agent.needs.hunger.to_bits() as u64);
            mix(agent.mood.valence.to_bits() as u64);
            mix(agent.money as u64);
            mix(agent.job.map_or(9, |j| j.index() as u64));
            mix(agent.home.map_or(u64::MAX, |h| h as u64));
            mix(agent.partner.map_or(u64::MAX, u64::from));
            mix(u64::from(agent.generation));
        }
        for home in &self.economy.realty.homes {
            mix(home.rent as u64);
            mix(home.condition.to_bits() as u64);
        }
        mix(self.economy.market.cash as u64);
        mix(self.economy.realty.cash as u64);
        hash
    }
}

trait BestSoFar {
    fn is_none_or_worse(&self, score: f32) -> bool;
}

impl BestSoFar for Option<((i32, i32), f32)> {
    fn is_none_or_worse(&self, score: f32) -> bool {
        match self {
            None => true,
            Some((_, best)) => score > *best,
        }
    }
}

#[cfg(test)]
mod tests;
