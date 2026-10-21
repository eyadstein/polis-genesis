//! Interactive console dashboard that displays a live ASCII map and telemetry.

use polis_core::{World, WorldConfig};
use polis_mind::speaker::{RuleSpeaker, Speaker};
use std::thread::sleep;
use std::time::Duration;

pub fn run(config: WorldConfig, ticks: u64, delay_ms: u64) -> Result<(), String> {
    let mut world = World::try_new(config)?;
    let mut voice = RuleSpeaker::new();
    let width = 36;
    let height = 18;

    println!("\x1B[2J\x1B[H");
    for _ in 0..ticks {
        world.step();

        // Build grid
        let mut grid = vec![vec!['.'; width]; height];

        // Draw outer river on eastern border
        for row in &mut grid {
            row[width - 1] = '~';
            row[width - 2] = '~';
        }

        // Draw district fountains
        for dy in 0..4 {
            for dx in 0..4 {
                let fx = (dx * width / 4) + (width / 8);
                let fy = (dy * height / 4) + (height / 8);
                if fy < height && fx < width {
                    grid[fy][fx] = 'o';
                }
            }
        }

        // Draw living agents
        for agent in world.agents.iter().filter(|a| a.is_alive()) {
            let gx =
                ((agent.pos.0 as usize * (width - 3)) / (world.width as usize)).clamp(0, width - 3);
            let gy =
                ((agent.pos.1 as usize * height) / (world.height as usize)).clamp(0, height - 1);
            let ch = match agent.action {
                polis_core::Action::Eat => 'E',
                polis_core::Action::Drink => 'D',
                polis_core::Action::Rest => 'Z',
                polis_core::Action::Work => 'W',
                polis_core::Action::Socialize => 'S',
                polis_core::Action::Wander => '*',
            };
            grid[gy][gx] = ch;
        }

        let s = world.stats();
        let hour = (world.tick % 24) as u32;
        let day = (world.tick / 24) as u32;

        print!("\x1B[H");
        println!("============================================================");
        println!("  POLIS GENESIS: Autonomous Multi Agent Society Simulator   ");
        println!("============================================================");
        println!(
            " Day {:<3} Hour {:02}:00 | Pop: {:<3} Alive | Treasury: {:<5} Coins",
            day, hour, s.alive, s.treasury
        );
        println!(
            " Jobs: {:<3} | Pairs: {:<3} | Crimes: {:<3} | Gini: {:.2} | Starved: {}",
            s.employed, s.couples, s.crimes, s.gini, s.starved
        );
        println!("------------------------------------------------------------");

        for row in &grid {
            let line: String = row.iter().collect();
            println!("  |{line}|");
        }

        println!("------------------------------------------------------------");
        println!(" Actions: [E]at  [D]rink  [Z]Rest  [W]ork  [S]ocialize  [*]Roam");

        if let Some(u) = world.utterances.back() {
            let speaker = &world.agents[u.speaker as usize].name;
            let listener = &world.agents[u.listener as usize].name;
            let words = voice.say(&world, u);
            println!(" Talk: {speaker} to {listener}: \"{words}\"");
        } else {
            println!(" Talk: (The town is quiet)");
        }
        println!("============================================================");

        if delay_ms > 0 {
            sleep(Duration::from_millis(delay_ms));
        }
    }
    Ok(())
}
