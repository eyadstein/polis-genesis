//! Run a world from the terminal and print a summary.
//!
//! Usage: polis_cli [seed] [ticks] [population] [export.json] [replay.json] [frame_every]

mod export;
mod files;
mod replay;

use polis_core::{report, World, WorldConfig};
use polis_mind::speaker::{RuleSpeaker, Speaker};

/// Free local speech from Ollama when built with the `ollama` feature and
/// `POLIS_OLLAMA_MODEL` is set. Otherwise the rule based voice.
#[cfg(feature = "ollama")]
fn pick_speaker() -> Box<dyn Speaker> {
    match std::env::var("POLIS_OLLAMA_MODEL") {
        Ok(model) => Box::new(polis_mind::ollama::OllamaSpeaker::new(
            "http://127.0.0.1:11434",
            &model,
        )),
        Err(_) => Box::new(RuleSpeaker::new()),
    }
}

#[cfg(not(feature = "ollama"))]
fn pick_speaker() -> Box<dyn Speaker> {
    Box::new(RuleSpeaker::new())
}

fn print_social_life(world: &World) {
    let s = world.stats();
    println!(
        "\nSocial life: {} conversations, {} pieces of gossip, {:.1} friends per person",
        s.conversations, s.gossips, s.friends
    );
    let mut voice = pick_speaker();
    println!("\nRecent conversations:");
    for u in world.utterances.iter().rev().take(6).rev() {
        let speaker = &world.agents[u.speaker as usize].name;
        let listener = &world.agents[u.listener as usize].name;
        println!("  {speaker} to {listener}: {}", voice.say(world, u));
    }
}

fn print_justice(world: &World) {
    let s = world.stats();
    println!(
        "\nJustice: {} crimes, {} convictions, {} acquittals, {} in prison, treasury {} coins",
        s.crimes, s.convictions, world.justice.acquittals, s.jailed, s.treasury
    );
}

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
    let mut history = vec![export::history_point(&world)];
    let mut recorder = replay::Recorder::new(arg(6, 10));

    println!(
        "tick   alive  kids  pairs  births  gen  starved  money  gini  jobs  homeless  vacant  rent"
    );
    let report_every = (ticks / 10).max(1);
    let mut until_report = report_every;
    for _ in 0..ticks {
        world.step();
        recorder.observe(&world);
        until_report -= 1;
        if until_report == 0 {
            until_report = report_every;
            history.push(export::history_point(&world));
            let s = world.stats();
            println!(
                "{:<6} {:<6} {:<5} {:<6} {:<7} {:<4} {:<8} {:<6.0} {:<5.2} {:<5} {:<9} {:<7} {:<5.1}",
                s.tick,
                s.alive,
                s.children,
                s.couples,
                s.births,
                s.max_generation,
                s.starved,
                s.mean_money,
                s.gini,
                s.employed,
                s.homeless,
                s.vacant,
                s.mean_rent
            );
        }
    }

    print_social_life(&world);
    print_justice(&world);

    println!("\nPay by job (average coins per paid tick of work):");
    for row in report::wages(&world) {
        println!(
            "  {:<11} {:>5.1}   ({} paid ticks)",
            format!("{:?}", row.job),
            row.mean_wage,
            row.paid_ticks
        );
    }

    println!("\nRent by kind of home:");
    for row in report::rents_by_kind(&world) {
        println!(
            "  {:<6} {:>3} homes, {:.1} rooms, rent {:>5.1}",
            format!("{:?}", row.kind),
            row.homes,
            row.mean_rooms,
            row.mean_rent
        );
    }

    println!("\nDistricts (appeal, occupancy, neighbor wealth, rent):");
    for row in report::districts(&world) {
        println!(
            "  #{:<2} {:>3} homes  appeal {:.2}  full {:>3.0}%  wealth {:.2}  rent {:>5.1}",
            row.district,
            row.homes,
            row.appeal,
            row.occupancy * 100.0,
            row.neighbor_wealth,
            row.mean_rent
        );
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

    if let Some(path) = std::env::args().nth(4) {
        let text = export::snapshot(&world, &history).to_string();
        match files::write_file(&path, &text) {
            Ok(()) => println!("town written to {path}"),
            Err(error) => eprintln!("could not write {path}: {error}"),
        }
    }

    if let Some(path) = std::env::args().nth(5) {
        let frames = recorder.frame_count();
        let text = recorder.finish(&world).to_string();
        match files::write_file(&path, &text) {
            Ok(()) => println!("replay of {frames} frames written to {path}"),
            Err(error) => eprintln!("could not write {path}: {error}"),
        }
    }
}
