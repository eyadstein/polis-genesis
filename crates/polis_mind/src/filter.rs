//! Keeps the people's world sealed. Nothing that names the outside, such as
//! machines, games, or code, may reach a person or come out of their mouth.

const FORBIDDEN_WORDS: [&str; 30] = [
    "game",
    "games",
    "simulation",
    "simulated",
    "simulate",
    "player",
    "players",
    "npc",
    "npcs",
    "ai",
    "llm",
    "chatbot",
    "bot",
    "program",
    "programmed",
    "programming",
    "algorithm",
    "genome",
    "tick",
    "ticks",
    "prompt",
    "assistant",
    "model",
    "models",
    "code",
    "software",
    "virtual",
    "artificial",
    "server",
    "computer",
];

/// True if the text mentions anything from outside the world.
pub fn leaks(text: &str) -> bool {
    let lower = text.to_lowercase();
    if lower.contains("language model") {
        return true;
    }
    lower
        .split(|c: char| !c.is_alphanumeric())
        .any(|word| FORBIDDEN_WORDS.contains(&word))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outside_words_are_caught() {
        for text in [
            "I am just a program.",
            "This is a GAME, you know.",
            "As an AI language model I cannot say.",
            "We live in a simulation",
            "Another player joined.",
        ] {
            assert!(leaks(text), "{text}");
        }
    }

    #[test]
    fn ordinary_speech_passes() {
        for text in [
            "Good morning, Mara. How is the bread today?",
            "I heard Tamir has been unkind lately.",
            "My feet hurt and I am hungry.",
            "Plain words about a plain day, with a main street and an airy room.",
        ] {
            assert!(!leaks(text), "{text}");
        }
    }

    #[test]
    fn whole_words_only() {
        assert!(!leaks("The gamekeeper waved."));
        assert!(!leaks("A barbot of a name"));
        assert!(leaks("a bot"));
    }
}
