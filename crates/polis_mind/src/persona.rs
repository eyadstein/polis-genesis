//! Describes a person's nature in plain words.

use polis_core::{Gene, Genome};

const HIGH_AT: f32 = 0.68;
const LOW_AT: f32 = 0.32;

/// (gene, word when high, word when low)
const TRAITS: [(Gene, &str, Option<&str>); 14] = [
    (Gene::Openness, "curious", Some("set in your ways")),
    (
        Gene::Conscientiousness,
        "careful and orderly",
        Some("easygoing about rules"),
    ),
    (Gene::Extraversion, "outgoing", Some("reserved")),
    (Gene::Agreeableness, "kind", Some("blunt")),
    (Gene::Neuroticism, "quick to worry", Some("calm")),
    (Gene::RiskAppetite, "bold", Some("cautious")),
    (Gene::Empathy, "tender hearted", Some("hard to move")),
    (
        Gene::FaithTendency,
        "deeply spiritual",
        Some("doubtful about faith"),
    ),
    (Gene::Music, "musical", None),
    (Gene::Athletics, "athletic", None),
    (Gene::Intellect, "sharp minded", None),
    (Gene::Craft, "good with your hands", None),
    (Gene::Charisma, "magnetic", None),
    (Gene::Longevity, "full of stamina", Some("easily worn out")),
];

/// The few traits that stand out most, as a short phrase such as
/// "curious, kind, and quick to worry".
pub fn describe(genome: &Genome) -> String {
    let mut standing: Vec<(f32, &str)> = TRAITS
        .iter()
        .filter_map(|&(gene, high, low)| {
            let value = genome.get(gene);
            if value >= HIGH_AT {
                Some((value - 0.5, high))
            } else if value <= LOW_AT {
                low.map(|word| (0.5 - value, word))
            } else {
                None
            }
        })
        .collect();
    standing.sort_by(|a, b| b.0.total_cmp(&a.0));
    let words: Vec<&str> = standing.iter().take(4).map(|(_, word)| *word).collect();
    match words.as_slice() {
        [] => "an ordinary sort of person".to_string(),
        [one] => (*one).to_string(),
        [first, last] => format!("{first} and {last}"),
        [init @ .., last] => format!("{}, and {last}", init.join(", ")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use polis_core::genome::GENE_COUNT;

    #[test]
    fn extremes_are_named() {
        let mut genes = [0.5; GENE_COUNT];
        genes[Gene::Neuroticism as usize] = 0.95;
        genes[Gene::Agreeableness as usize] = 0.9;
        genes[Gene::Openness as usize] = 0.1;
        let text = describe(&Genome::from_genes(genes));
        assert!(text.contains("quick to worry"));
        assert!(text.contains("kind"));
        assert!(text.contains("set in your ways"));
    }

    #[test]
    fn ordinary_people_get_an_ordinary_description() {
        assert_eq!(
            describe(&Genome::from_genes([0.5; GENE_COUNT])),
            "an ordinary sort of person"
        );
    }

    #[test]
    fn descriptions_are_short() {
        let text = describe(&Genome::from_genes([1.0; GENE_COUNT]));
        assert!(text.matches(',').count() <= 3);
    }
}
