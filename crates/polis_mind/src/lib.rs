//! Words for the world.
//!
//! The simulation core never calls a language model, so it stays fast and
//! exactly repeatable. This crate reads what happened and finds words for
//! it. A person's mind only ever receives first person perception, and every
//! reply is checked so nothing from outside their world leaks in.

pub mod filter;
pub mod persona;
pub mod prompt;
pub mod speaker;

#[cfg(feature = "ollama")]
pub mod ollama;
