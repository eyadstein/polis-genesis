//! Name generation. Names are built from syllables and kept unique.

use crate::rng::Rng;
use std::collections::BTreeSet;

const STARTS: [&str; 16] = [
    "Ka", "Ma", "Ni", "Za", "Ta", "Re", "Sa", "Lu", "Om", "Ha", "Yu", "Da", "Fa", "Li", "Mo", "Ra",
];
const MIDDLES: [&str; 8] = ["", "la", "ri", "na", "mi", "ta", "ze", "so"];
const ENDS: [&str; 14] = [
    "r", "n", "m", "l", "d", "s", "a", "e", "o", "ya", "an", "ir", "im", "el",
];

#[derive(Default)]
pub struct NameBook {
    used: BTreeSet<String>,
}

impl NameBook {
    pub fn new() -> Self {
        Self::default()
    }

    /// A name no one else in this world has, guaranteed.
    pub fn fresh(&mut self, rng: &mut Rng) -> String {
        for _ in 0..32 {
            let name = format!(
                "{}{}{}",
                rng.pick(&STARTS),
                rng.pick(&MIDDLES),
                rng.pick(&ENDS)
            );
            if self.used.insert(name.clone()) {
                return name;
            }
        }
        let mut counter = self.used.len() as u32;
        loop {
            let name = format!("{}{} {}", rng.pick(&STARTS), rng.pick(&ENDS), counter);
            if self.used.insert(name.clone()) {
                return name;
            }
            counter += 1;
        }
    }
}
