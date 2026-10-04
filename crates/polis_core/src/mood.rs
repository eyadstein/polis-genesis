//! Mood: a slow moving feeling shaped by how well needs are met.
//!
//! Valence runs from -1 (miserable) to 1 (content). Arousal runs from 0
//! (calm) to 1 (agitated). Neurotic people react more strongly.

use crate::genome::{Gene, Genome};
use crate::needs::Needs;

#[derive(Clone, Debug, PartialEq)]
pub struct Mood {
    pub valence: f32,
    pub arousal: f32,
}

impl Mood {
    pub fn new() -> Self {
        Self {
            valence: 0.2,
            arousal: 0.2,
        }
    }

    pub fn update(&mut self, needs: &Needs, genome: &Genome, afterglow: f32) {
        let neuroticism = genome.get(Gene::Neuroticism);
        let sensitivity = 0.6 + 0.8 * neuroticism;
        let target_valence =
            ((needs.average() - 0.5) * 2.0 * sensitivity + 0.4 * afterglow).clamp(-1.0, 1.0);
        let target_arousal = ((1.0 - needs.lowest()) * (0.5 + 0.5 * neuroticism)).clamp(0.0, 1.0);
        self.valence += (target_valence - self.valence) * 0.1;
        self.arousal += (target_arousal - self.arousal) * 0.1;
    }
}

impl Default for Mood {
    fn default() -> Self {
        Self::new()
    }
}
