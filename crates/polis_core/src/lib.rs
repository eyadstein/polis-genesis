//! Polis Genesis simulation core.
//!
//! Everything here is deterministic: the same seed always produces the same
//! world, on every machine. Nothing about an agent's behaviour is scripted.
//! Agents are born from genomes, feel needs and moods, and choose actions
//! from their own state and what they perceive.

pub mod agent;
pub mod economy;
pub mod family;
pub mod genome;
pub mod housing;
pub mod memory;
pub mod mood;
pub mod names;
pub mod needs;
pub mod report;
pub mod rng;
pub mod talk;
pub mod world;

pub use agent::{Action, Agent, AgentId, Death};
pub use economy::{Coins, Job};
pub use genome::{Gene, Genome};
pub use housing::Kind;
pub use memory::{Event, Memory, Mind};
pub use talk::{Act, Utterance};
pub use world::{Stats, World, WorldConfig};
