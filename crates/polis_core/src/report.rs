//! Read only summaries of a world, used to compare jobs, kinds of homes,
//! and districts.

use crate::economy::Job;
use crate::housing::{Kind, DISTRICT_COUNT};
use crate::world::World;

#[derive(Clone, Debug)]
pub struct WageRow {
    pub job: Job,
    pub mean_wage: f32,
    pub paid_ticks: u64,
}

/// Average wage per paid tick of work, for each job.
pub fn wages(world: &World) -> Vec<WageRow> {
    Job::ALL
        .iter()
        .map(|&job| {
            let ticks = world.wages.ticks[job.index()];
            let total = world.wages.total[job.index()];
            WageRow {
                job,
                mean_wage: if ticks == 0 {
                    0.0
                } else {
                    total as f32 / ticks as f32
                },
                paid_ticks: ticks,
            }
        })
        .collect()
}

#[derive(Clone, Debug)]
pub struct KindRow {
    pub kind: Kind,
    pub homes: usize,
    pub mean_rooms: f32,
    pub mean_rent: f32,
}

pub fn rents_by_kind(world: &World) -> Vec<KindRow> {
    Kind::ALL
        .iter()
        .map(|&kind| {
            let homes: Vec<_> = world
                .economy
                .realty
                .homes
                .iter()
                .filter(|h| h.kind == kind)
                .collect();
            let count = homes.len().max(1) as f32;
            KindRow {
                kind,
                homes: homes.len(),
                mean_rooms: homes.iter().map(|h| f32::from(h.rooms)).sum::<f32>() / count,
                mean_rent: homes.iter().map(|h| h.rent as f32).sum::<f32>() / count,
            }
        })
        .collect()
}

#[derive(Clone, Debug)]
pub struct DistrictRow {
    pub district: usize,
    pub homes: usize,
    pub appeal: f32,
    pub occupancy: f32,
    pub neighbor_wealth: f32,
    pub mean_rent: f32,
}

pub fn districts(world: &World) -> Vec<DistrictRow> {
    (0..DISTRICT_COUNT)
        .map(|id| {
            let district = &world.economy.realty.districts[id];
            let homes: Vec<_> = world
                .economy
                .realty
                .homes
                .iter()
                .filter(|h| h.district == id)
                .collect();
            let count = homes.len().max(1) as f32;
            DistrictRow {
                district: id,
                homes: homes.len(),
                appeal: district.appeal,
                occupancy: district.occupancy,
                neighbor_wealth: district.neighbor_wealth,
                mean_rent: homes.iter().map(|h| h.rent as f32).sum::<f32>() / count,
            }
        })
        .collect()
}
