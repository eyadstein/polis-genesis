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

    println!("tick   alive  starved  old   valence  hunger");
    let report_every = (ticks / 10).max(1);
    for _ in 0..ticks {
        world.step();
        if world.tick.is_multiple_of(report_every) {
            let s = world.stats();
            println!(
                "{:<6} {:<6} {:<8} {:<5} {:<8.2} {:.2}",
                s.tick, s.alive, s.starved, s.died_old, s.mean_valence, s.mean_hunger
            );
        }
    }

    println!("\nA few of the living:");
    for agent in world.agents.iter().filter(|a| a.is_alive()).take(3) {
        let (gene, value) = agent.genome.standout();
        println!(
            "{} is doing {:?}, standout trait {:?} ({:.2})",
            agent.name, agent.action, gene, value
        );
    }
    println!("\nstate hash {:016x}", world.state_hash());
}
