"""Repeatable release-mode wall-time benchmark for representative simulations.

Run from any directory with ``python tools/benchmark_simulation.py``. The
measurement includes process startup and CLI reporting, but excludes the one
warm-up run and release compilation. A fixed seed and state hash check make
the workloads comparable across revisions. ``--repetitions`` controls the
number of timed runs per workload.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / "target" / "release" / ("polis_cli.exe" if sys.platform == "win32" else "polis_cli")
SEED = 17
WORKLOADS = ((120, 1_000), (120, 5_000), (500, 1_000), (500, 3_000), (1_000, 1_000), (1_000, 3_000))
HASH = re.compile(r"^state hash ([0-9a-f]+)$", re.MULTILINE)


def run(population: int, ticks: int, export: Path | None = None) -> tuple[float, str]:
    args = [str(EXE), str(SEED), str(ticks), str(population)]
    if export is not None:
        args.append(str(export))
    start = time.perf_counter()
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, check=True)
    elapsed_ms = (time.perf_counter() - start) * 1_000
    match = HASH.search(result.stdout)
    if match is None:
        raise RuntimeError("polis_cli output did not include its state hash")
    return elapsed_ms, match.group(1)


def measure(population: int, ticks: int, repetitions: int, export: Path | None = None) -> dict[str, object]:
    run(population, ticks, export)  # warm-up, excluded from timings
    samples: list[float] = []
    hashes: set[str] = set()
    for _ in range(repetitions):
        elapsed, state_hash = run(population, ticks, export)
        samples.append(elapsed)
        hashes.add(state_hash)
    if len(hashes) != 1:
        raise RuntimeError(f"seed {SEED} was not repeatable for {population} residents / {ticks} ticks")
    return {
        "population": population,
        "ticks": ticks,
        "median_ms": round(statistics.median(samples), 2),
        "samples_ms": [round(sample, 2) for sample in samples],
        "state_hash": next(iter(hashes)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repetitions", type=int, default=3, help="timed runs per workload (default: 3)")
    parser.add_argument("--build", action="store_true", help="build the locked release CLI before measuring")
    args = parser.parse_args()
    if args.repetitions < 1:
        parser.error("--repetitions must be at least 1")
    if args.build or not EXE.exists():
        subprocess.run(
            ["cargo", "build", "--release", "--locked", "-p", "polis_cli"],
            cwd=ROOT,
            check=True,
        )

    workloads = [measure(population, ticks, args.repetitions) for population, ticks in WORKLOADS]
    with tempfile.TemporaryDirectory(prefix="polis-bench-") as temp:
        export_path = Path(temp) / "town.json"
        without_export = measure(1_000, 1_000, args.repetitions)
        with_export = measure(1_000, 1_000, args.repetitions, export_path)
        if without_export["state_hash"] != with_export["state_hash"]:
            raise RuntimeError("exporting changed the simulated world state")

    rustc = subprocess.run(["rustc", "--version"], capture_output=True, text=True, check=True).stdout.strip()
    print(
        json.dumps(
            {
                "environment": {
                    "platform": platform.platform(),
                    "processor": platform.processor(),
                    "logical_cpus": os.cpu_count(),
                    "rustc": rustc,
                    "seed": SEED,
                    "repetitions": args.repetitions,
                    "timing": "release CLI process wall time; one warm-up excluded; includes startup and reporting",
                },
                "workloads": workloads,
                "export_comparison": {
                    "without_export": without_export,
                    "with_export": with_export,
                    "extra_median_ms": round(with_export["median_ms"] - without_export["median_ms"], 2),
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
