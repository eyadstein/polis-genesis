//! Run a world from the terminal and print a summary.
//!
//! Usage: polis_cli [seed] [ticks] [population]

use polis_core::{World, WorldConfig};

fn arg(index: usize, default: u64) -> u64 {
    std::env::args()
        .nth(index)
        .and_then(|text| text.parse().ok())
        .unwrap_or(default)
}

fn main() {
    let config = WorldConfig {
        seed: arg(1, 1),
        population: arg(3, 200) as u32,
        ..WorldConfig::default()
    };
    let ticks = arg(2, 3000);
    let mut world = World::new(config);

    println!("tick   alive  starved  valence  money  gini  jobs  homeless  homes  price");
    let report_every = (ticks / 10).max(1);
    let mut until_report = report_every;
    for _ in 0..ticks {
        world.step();
        until_report -= 1;
        if until_report == 0 {
            until_report = report_every;
            let s = world.stats();
            println!(
                "{:<6} {:<6} {:<8} {:<8.2} {:<6.0} {:<5.2} {:<5} {:<9} {:<6} {}",
                s.tick,
                s.alive,
                s.starved,
                s.mean_valence,
                s.mean_money,
                s.gini,
                s.employed,
                s.homeless,
                s.homes,
                s.food_price
            );
        }
    }

    println!("\nA few of the living:");
    for agent in world.agents.iter().filter(|a| a.is_alive()).take(3) {
        let (gene, value) = agent.genome.standout();
        println!(
            "{} is doing {:?}, job {:?}, {} coins, standout trait {:?} ({:.2})",
            agent.name, agent.action, agent.job, agent.money, gene, value
        );
    }
    println!("\nstate hash {:016x}", world.state_hash());
}
