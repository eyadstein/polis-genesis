//! A small local web server around the living town.
//!
//! Routes, all on 127.0.0.1 so only this computer can reach them:
//!   GET  /api/town                  the whole town, like the town file
//!   GET  /api/frames?after=N&talk=M what is new since frame N and speech line M
//!   POST /api/clock                 {"paused": bool, "speed": ticks per second}
//!   POST /api/people                {"count": 1 to 100}

use crate::live::Engine;
use polis_core::WorldConfig;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

pub const DEFAULT_PORT: u16 = 8787;

fn lock(engine: &Mutex<Engine>) -> MutexGuard<'_, Engine> {
    engine.lock().unwrap_or_else(PoisonError::into_inner)
}

fn query(url: &str, key: &str) -> Option<String> {
    let (_, q) = url.split_once('?')?;
    q.split('&')
        .filter_map(|pair| pair.split_once('='))
        .find(|(k, _)| *k == key)
        .map(|(_, v)| v.to_string())
}

fn number(url: &str, key: &str, default: u64) -> u64 {
    query(url, key)
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn fail(code: u16, message: &str) -> (u16, String) {
    (code, json!({ "error": message }).to_string())
}

fn parse(body: &str) -> Result<Value, (u16, String)> {
    serde_json::from_str(body).map_err(|_| fail(400, "the body must be JSON"))
}

/// Answers one request. No sockets in here, so tests can call it directly.
pub fn handle(engine: &Mutex<Engine>, method: &str, url: &str, body: &str) -> (u16, String) {
    let path = url.split('?').next().unwrap_or(url);
    match (method, path) {
        ("GET", "/api/town") => (200, lock(engine).town().to_string()),
        ("GET", "/api/frames") => {
            let after = number(url, "after", 0);
            let talk = number(url, "talk", 0);
            let limit = number(url, "limit", 500) as usize;
            (200, lock(engine).since(after, talk, limit).to_string())
        }
        ("POST", "/api/clock") => {
            let value = match parse(body) {
                Ok(v) => v,
                Err(e) => return e,
            };
            let paused = value.get("paused").and_then(Value::as_bool);
            let speed = value.get("speed").and_then(Value::as_f64);
            if paused.is_none() && speed.is_none() {
                return fail(400, "send paused, speed, or both");
            }
            let mut e = lock(engine);
            match e.set_clock(paused, speed) {
                Ok(()) => (
                    200,
                    json!({ "paused": e.paused, "speed": e.speed }).to_string(),
                ),
                Err(message) => fail(400, &message),
            }
        }
        ("POST", "/api/people") => {
            let value = match parse(body) {
                Ok(v) => v,
                Err(e) => return e,
            };
            let Some(count) = value.get("count").and_then(Value::as_u64) else {
                return fail(400, "send a whole number as count");
            };
            let count = u32::try_from(count).unwrap_or(u32::MAX);
            match lock(engine).add_people(count) {
                Ok(ids) => (200, json!({ "ids": ids }).to_string()),
                Err(message) => fail(400, &message),
            }
        }
        (_, "/api/town" | "/api/frames" | "/api/clock" | "/api/people") => {
            fail(405, "wrong method")
        }
        _ => fail(404, "no such route"),
    }
}

/// How many steps to take at once, and how long to rest after them, for a speed in ticks per second.
pub fn pace(speed: f64) -> (u32, Duration) {
    let batch = (speed * 0.02).floor().max(1.0);
    (batch as u32, Duration::from_secs_f64(batch / speed))
}

fn run_clock(engine: Arc<Mutex<Engine>>) {
    loop {
        let (paused, speed) = {
            let e = lock(&engine);
            (e.paused, e.speed)
        };
        if paused {
            std::thread::sleep(Duration::from_millis(50));
            continue;
        }
        let (steps, rest) = pace(speed);
        {
            let mut e = lock(&engine);
            for _ in 0..steps {
                e.step();
            }
        }
        std::thread::sleep(rest);
    }
}

pub fn run(config: WorldConfig, port: u16) -> Result<(), String> {
    let server = tiny_http::Server::http(("127.0.0.1", port))
        .map_err(|e| format!("could not listen on port {port}: {e}"))?;
    let engine = Arc::new(Mutex::new(Engine::new(config)));
    {
        let engine = Arc::clone(&engine);
        std::thread::spawn(move || run_clock(engine));
    }
    println!("The town is alive at http://127.0.0.1:{port}  (press Ctrl+C to stop)");
    for mut request in server.incoming_requests() {
        let mut body = String::new();
        let _ = std::io::Read::read_to_string(request.as_reader(), &mut body);
        let method = request.method().as_str().to_string();
        let url = request.url().to_string();
        let (code, text) = handle(&engine, &method, &url, &body);
        let header = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
            .expect("static header");
        let response = tiny_http::Response::from_string(text)
            .with_status_code(code)
            .with_header(header);
        let _ = request.respond(response);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engine() -> Mutex<Engine> {
        Mutex::new(Engine::new(WorldConfig {
            seed: 2,
            population: 30,
            ..WorldConfig::default()
        }))
    }

    fn json_of(reply: &(u16, String)) -> Value {
        serde_json::from_str(&reply.1).expect("json reply")
    }

    #[test]
    fn it_serves_the_town() {
        let e = engine();
        let reply = handle(&e, "GET", "/api/town", "");
        assert_eq!(reply.0, 200);
        assert_eq!(json_of(&reply)["people"].as_array().unwrap().len(), 30);
    }

    #[test]
    fn it_serves_frames_after_a_point() {
        let e = engine();
        lock(&e).step();
        lock(&e).step();
        let all = json_of(&handle(&e, "GET", "/api/frames?after=0&talk=0", ""));
        assert_eq!(all["frames"].as_array().unwrap().len(), 3);
        let seq = all["seq"].as_u64().unwrap();
        let none = json_of(&handle(
            &e,
            "GET",
            &format!("/api/frames?after={seq}&talk=0"),
            "",
        ));
        assert!(none["frames"].as_array().unwrap().is_empty());
        let one = json_of(&handle(&e, "GET", "/api/frames?after=0&limit=1", ""));
        assert_eq!(one["frames"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn the_clock_can_be_changed() {
        let e = engine();
        let reply = handle(&e, "POST", "/api/clock", r#"{"paused":true,"speed":8}"#);
        assert_eq!(reply.0, 200);
        assert_eq!(json_of(&reply)["speed"], 8.0);
        assert!(lock(&e).paused);
        assert_eq!(
            handle(&e, "POST", "/api/clock", r#"{"speed":99999}"#).0,
            400
        );
        assert_eq!(handle(&e, "POST", "/api/clock", "{}").0, 400);
        assert_eq!(handle(&e, "POST", "/api/clock", "not json").0, 400);
    }

    #[test]
    fn people_can_arrive() {
        let e = engine();
        let reply = handle(&e, "POST", "/api/people", r#"{"count":4}"#);
        assert_eq!(reply.0, 200);
        assert_eq!(json_of(&reply)["ids"], json!([30, 31, 32, 33]));
        assert_eq!(lock(&e).alive(), 34);
        assert_eq!(handle(&e, "POST", "/api/people", r#"{"count":0}"#).0, 400);
        assert_eq!(handle(&e, "POST", "/api/people", r#"{"count":-1}"#).0, 400);
        assert_eq!(
            handle(&e, "POST", "/api/people", r#"{"count":"many"}"#).0,
            400
        );
        assert_eq!(
            handle(&e, "POST", "/api/people", r#"{"count":99999999999}"#).0,
            400
        );
    }

    #[test]
    fn strange_requests_get_clear_answers() {
        let e = engine();
        assert_eq!(handle(&e, "GET", "/nothing", "").0, 404);
        assert_eq!(handle(&e, "DELETE", "/api/town", "").0, 405);
        assert_eq!(handle(&e, "GET", "/api/clock", "").0, 405);
    }

    #[test]
    fn pace_batches_fast_speeds() {
        assert_eq!(pace(2.0).0, 1);
        assert!((pace(2.0).1.as_secs_f64() - 0.5).abs() < 1e-9);
        let (steps, rest) = pace(200.0);
        assert_eq!(steps, 4);
        assert!((rest.as_secs_f64() - 0.02).abs() < 1e-9);
        assert_eq!(pace(0.05).0, 1);
    }
}
