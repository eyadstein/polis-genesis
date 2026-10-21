"""
Command line interface for Polis Genesis.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import webbrowser


def _run_cli(command: list[str]) -> None:
    result = subprocess.run(command)
    if result.returncode:
        raise SystemExit(result.returncode)

def find_cli_binary() -> str | None:
    # Look in cargo target directories
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "..", "target", "release", "polis_cli.exe"),
        os.path.join(os.path.dirname(__file__), "..", "..", "target", "debug", "polis_cli.exe"),
        os.path.join(os.path.dirname(__file__), "..", "..", "target", "release", "polis_cli"),
        os.path.join(os.path.dirname(__file__), "..", "..", "target", "debug", "polis_cli"),
        shutil.which("polis_cli"),
        shutil.which("polis_cli.exe"),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return os.path.abspath(c)
    return None

def cmd_console(args: argparse.Namespace) -> None:
    bin_path = find_cli_binary()
    if bin_path:
        _run_cli([bin_path, "console", str(args.seed), str(args.population), str(args.ticks), str(args.delay)])
    else:
        # Fall back to cargo run
        cmd = ["cargo", "run", "--release", "-p", "polis_cli", "--", "console", str(args.seed), str(args.population), str(args.ticks), str(args.delay)]
        try:
            _run_cli(cmd)
        except FileNotFoundError:
            print("cargo was not found. Please install Rust from https://rustup.rs to compile polis_cli.")
            sys.exit(1)

def cmd_serve(args: argparse.Namespace) -> None:
    bin_path = find_cli_binary()
    cmd = [bin_path or "cargo", "serve" if bin_path else "run", *(["--release", "-p", "polis_cli", "--", "serve"] if not bin_path else []), str(args.seed), str(args.population), str(args.port)]
    try:
        _run_cli(cmd)
    except KeyboardInterrupt:
        print("\nTown server stopped.")

def cmd_web(args: argparse.Namespace) -> None:
    url = args.url or "https://eyadstein.github.io/polis-genesis/world.html"
    print(f"Opening Polis Genesis in browser: {url}")
    webbrowser.open(url)

def cmd_info(_args: argparse.Namespace) -> None:
    print("==================================================")
    print("  Polis Genesis: Society & Mind Simulator")
    print("  Version: 0.2.0")
    print("  Repository: https://github.com/eyadstein/polis-genesis")
    print("  Website: https://eyadstein.github.io/polis-genesis/world.html")
    print("==================================================")
    print("  Districts: 16 districts with central water fountains")
    print("  Needs: Hunger, Thirst, Energy, Social, Purpose")
    print("  Actions: Eat, Drink, Rest, Work, Socialize, Wander")
    print("  Economics: Real estate, rents, progressive taxes")
    print("==================================================")

def main() -> None:
    parser = argparse.ArgumentParser(prog="polis-genesis", description="Polis Genesis Autonomous Simulation")
    subparsers = parser.add_subparsers(dest="command", help="Subcommand to execute")

    p_console = subparsers.add_parser("console", help="Run interactive terminal world")
    p_console.add_argument("--seed", type=int, default=1, help="World RNG seed")
    p_console.add_argument("--population", type=int, default=120, help="Initial population")
    p_console.add_argument("--ticks", type=int, default=500, help="Total simulation ticks")
    p_console.add_argument("--delay", type=int, default=70, help="Milliseconds between ticks")
    p_console.set_defaults(func=cmd_console)

    p_serve = subparsers.add_parser("serve", help="Run live town server")
    p_serve.add_argument("--seed", type=int, default=1, help="World RNG seed")
    p_serve.add_argument("--population", type=int, default=200, help="Initial population")
    p_serve.add_argument("--port", type=int, default=8787, help="Server port")
    p_serve.set_defaults(func=cmd_serve)

    p_web = subparsers.add_parser("web", help="Open the 3D visualizer website")
    p_web.add_argument("--url", type=str, default=None, help="Target URL")
    p_web.set_defaults(func=cmd_web)

    p_info = subparsers.add_parser("info", help="Show system and simulation information")
    p_info.set_defaults(func=cmd_info)

    args = parser.parse_args()
    if hasattr(args, "func"):
        args.func(args)
    else:
        cmd_info(args)

if __name__ == "__main__":
    main()
