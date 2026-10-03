//! Genomes: the inherited starting point of every person.
//!
//! Each gene is a value in [0, 1]. Children mix both parents' genes and
//! occasionally mutate, so families resemble each other but nobody is a copy.

use crate::rng::Rng;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Gene {
    Openness,
    Conscientiousness,
    Extraversion,
    Agreeableness,
    Neuroticism,
    RiskAppetite,
    Empathy,
    FaithTendency,
    Music,
    Athletics,
    Intellect,
    Craft,
    Charisma,
    Metabolism,
    Longevity,
}

pub const GENE_COUNT: usize = 15;

impl Gene {
    pub const ALL: [Gene; GENE_COUNT] = [
        Gene::Openness,
        Gene::Conscientiousness,
        Gene::Extraversion,
        Gene::Agreeableness,
        Gene::Neuroticism,
        Gene::RiskAppetite,
        Gene::Empathy,
        Gene::FaithTendency,
        Gene::Music,
        Gene::Athletics,
        Gene::Intellect,
        Gene::Craft,
        Gene::Charisma,
        Gene::Metabolism,
        Gene::Longevity,
    ];

    fn index(self) -> usize {
        self as usize
    }
}

fn clamp01(value: f32) -> f32 {
    value.clamp(0.0, 1.0)
}

#[derive(Clone, Debug, PartialEq)]
pub struct Genome {
    genes: [f32; GENE_COUNT],
}

impl Genome {
    /// A founder genome: every gene centred on 0.5 with natural spread.
    pub fn random(rng: &mut Rng) -> Self {
        let mut genes = [0.0; GENE_COUNT];
        for gene in genes.iter_mut() {
            *gene = clamp01(0.5 + 0.2 * rng.gaussian());
        }
        Self { genes }
    }

    pub fn from_genes(genes: [f32; GENE_COUNT]) -> Self {
        Self {
            genes: genes.map(clamp01),
        }
    }

    pub fn get(&self, gene: Gene) -> f32 {
        self.genes[gene.index()]
    }

    /// Mix two parents. Each gene comes from one parent at random, then
    /// mutates with probability `mutation_rate` by up to `mutation_size`.
    pub fn crossbreed(
        a: &Genome,
        b: &Genome,
        rng: &mut Rng,
        mutation_rate: f32,
        mutation_size: f32,
    ) -> Genome {
        let mut genes = [0.0; GENE_COUNT];
        for (i, gene) in genes.iter_mut().enumerate() {
            let parent = if rng.chance(0.5) { a } else { b };
            let mut value = parent.genes[i];
            if rng.chance(mutation_rate) {
                value += rng.gaussian() * mutation_size;
            }
            *gene = clamp01(value);
        }
        Genome { genes }
    }

    /// Root mean square difference between two genomes, in [0, 1].
    pub fn distance(&self, other: &Genome) -> f32 {
        let total: f32 = self
            .genes
            .iter()
            .zip(other.genes.iter())
            .map(|(x, y)| (x - y) * (x - y))
            .sum();
        (total / GENE_COUNT as f32).sqrt()
    }

    /// The gene this person is strongest in, with its value.
    pub fn standout(&self) -> (Gene, f32) {
        let mut best = (Gene::ALL[0], self.genes[0]);
        for gene in Gene::ALL {
            if self.get(gene) > best.1 {
                best = (gene, self.get(gene));
            }
        }
        best
    }
}
