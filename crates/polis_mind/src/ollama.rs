//! Speech from a local language model served by Ollama, which is free and
//! runs on your own machine. If the server is down, slow, or says anything
//! that mentions the outside, the rule based voice answers instead.

use crate::filter::leaks;
use crate::prompt::conversation_prompt;
use crate::speaker::{RuleSpeaker, Speaker};
use polis_core::{Utterance, World};
use std::time::Duration;

const MAX_REPLY_CHARS: usize = 300;

pub struct OllamaSpeaker {
    url: String,
    model: String,
    fallback: RuleSpeaker,
}

impl OllamaSpeaker {
    /// `base` is the server address, such as `http://127.0.0.1:11434`.
    pub fn new(base: &str, model: &str) -> Self {
        Self {
            url: format!("{}/api/generate", base.trim_end_matches('/')),
            model: model.to_string(),
            fallback: RuleSpeaker::new(),
        }
    }

    fn ask(&self, prompt: &str) -> Option<String> {
        let body = serde_json::json!({
            "model": self.model,
            "prompt": prompt,
            "stream": false,
        });
        let response = ureq::post(&self.url)
            .timeout(Duration::from_secs(30))
            .send_json(body)
            .ok()?;
        let value: serde_json::Value = response.into_json().ok()?;
        let text = value.get("response")?.as_str()?.trim();
        Some(text.chars().take(MAX_REPLY_CHARS).collect())
    }
}

impl Speaker for OllamaSpeaker {
    fn say(&mut self, world: &World, utterance: &Utterance) -> String {
        let prompt = conversation_prompt(world, utterance);
        match self.ask(&prompt) {
            Some(text) if !text.is_empty() && !leaks(&text) => text,
            _ => self.fallback.say(world, utterance),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use polis_core::WorldConfig;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn town() -> World {
        let mut world = World::new(WorldConfig {
            seed: 13,
            width: 40,
            height: 40,
            population: 120,
        });
        world.run(4000);
        world
    }

    /// A tiny stand in for the model server that answers once.
    fn serve_once(reply: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut seen = Vec::new();
            let mut chunk = [0u8; 4096];
            let header_end = loop {
                let n = stream.read(&mut chunk).expect("read");
                seen.extend_from_slice(&chunk[..n]);
                if let Some(at) = seen.windows(4).position(|w| w == b"\r\n\r\n") {
                    break at + 4;
                }
            };
            let head = String::from_utf8_lossy(&seen[..header_end]).to_lowercase();
            let wanted: usize = head
                .lines()
                .find_map(|l| l.strip_prefix("content-length:"))
                .and_then(|v| v.trim().parse().ok())
                .unwrap_or(0);
            while seen.len() < header_end + wanted {
                let n = stream.read(&mut chunk).expect("read body");
                seen.extend_from_slice(&chunk[..n]);
            }
            let body = format!("{{\"response\": \"{reply}\"}}");
            let answer = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(answer.as_bytes()).expect("write");
        });
        format!("http://{address}")
    }

    #[test]
    fn a_clean_reply_from_the_model_is_used() {
        let world = town();
        let u = world.utterances.back().expect("someone spoke");
        let mut voice = OllamaSpeaker::new(&serve_once("Good to see you, friend."), "any");
        assert_eq!(voice.say(&world, u), "Good to see you, friend.");
    }

    #[test]
    fn a_reply_that_names_the_outside_is_replaced() {
        let world = town();
        let u = world.utterances.back().expect("someone spoke");
        let mut voice = OllamaSpeaker::new(&serve_once("As an AI language model I cannot."), "any");
        let said = voice.say(&world, u);
        assert_eq!(said, RuleSpeaker::new().say(&world, u));
    }

    #[test]
    fn a_missing_server_falls_back_to_the_rule_voice() {
        let world = town();
        let u = world.utterances.back().expect("someone spoke");
        let mut voice = OllamaSpeaker::new("http://127.0.0.1:1", "any");
        assert_eq!(voice.say(&world, u), RuleSpeaker::new().say(&world, u));
    }
}
