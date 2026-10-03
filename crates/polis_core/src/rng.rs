//! Small deterministic random number generator (SplitMix64).
//!
//! No external crates are used, so results never depend on a library version.

#[derive(Clone, Debug)]
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform value in [0, 1).
    pub fn next_f32(&mut self) -> f32 {
        (self.next_u64() >> 40) as f32 / (1u64 << 24) as f32
    }

    /// Uniform integer in [0, upper). Returns 0 when upper is 0.
    pub fn below(&mut self, upper: u32) -> u32 {
        if upper == 0 {
            0
        } else {
            (self.next_u64() % u64::from(upper)) as u32
        }
    }

    pub fn chance(&mut self, probability: f32) -> bool {
        self.next_f32() < probability
    }

    /// Approximate standard normal value (sum of twelve uniforms).
    pub fn gaussian(&mut self) -> f32 {
        let mut sum = 0.0;
        for _ in 0..12 {
            sum += self.next_f32();
        }
        sum - 6.0
    }

    pub fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.below(items.len() as u32) as usize]
    }
}
