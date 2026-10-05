"""Reads a town exported by polis_cli and prints a plain report.

Usage:  python tools/analyze.py town.json

Needs nothing beyond the Python standard library.
"""

import json
import statistics
import sys
from collections import Counter


def load(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def living(town):
    return [p for p in town["people"] if p["alive"]]


def gini(values):
    """0 means everyone holds the same, 1 means one person holds everything."""
    values = sorted(values)
    total = sum(values)
    n = len(values)
    if n == 0 or total <= 0:
        return 0.0
    weighted = sum((i + 1) * v for i, v in enumerate(values))
    return 2 * weighted / (n * total) - (n + 1) / n


def wealth_shares(town):
    """Share of all savings held by the poorest half, the next 40 percent,
    and the richest 10 percent."""
    money = sorted(p["money"] for p in living(town))
    total = sum(money)
    if not money or total <= 0:
        return (0.0, 0.0, 0.0)
    n = len(money)
    low, high = n // 2, n - max(1, n // 10)
    return (
        sum(money[:low]) / total,
        sum(money[low:high]) / total,
        sum(money[high:]) / total,
    )


def pay_by_job(town):
    groups = {}
    for p in living(town):
        if p["job"]:
            groups.setdefault(p["job"], []).append(p["money"])
    return {job: statistics.mean(v) for job, v in sorted(groups.items())}


def rent_by_kind(town):
    groups = {}
    for p in living(town):
        if p["home_kind"] and p["rent"] is not None:
            groups.setdefault(p["home_kind"], []).append(p["rent"])
    return {kind: statistics.mean(v) for kind, v in sorted(groups.items())}


def family_sizes(town):
    """How many living children each living parent has."""
    kids = Counter()
    for p in living(town):
        for parent in p["parents"] or []:
            kids[parent] += 1
    return Counter(kids.values())


def generations(town):
    return Counter(p["generation"] for p in living(town))


def crime_by_record(town):
    people = living(town)
    return {
        "with a record": sum(1 for p in people if p["record"] > 0),
        "in prison": sum(1 for p in people if p["jailed"]),
        "of": len(people),
    }


def report(town):
    people = living(town)
    stats = town["stats"]
    low, mid, top = wealth_shares(town)
    lines = [
        f"Town at tick {town['tick']}: {len(people)} living people",
        f"Inequality (Gini): {gini([p['money'] for p in people]):.2f}",
        f"Savings held by the poorest half {low:.0%}, "
        f"the next 40 percent {mid:.0%}, the richest 10 percent {top:.0%}",
        f"Employed {stats['employed']}, homeless {stats['homeless']}, "
        f"vacant homes {stats['vacant']}",
        "",
        "Average savings by job:",
    ]
    for job, mean in pay_by_job(town).items():
        lines.append(f"  {job:<11} {mean:8.1f}")
    lines += ["", "Average rent by kind of home:"]
    for kind, mean in rent_by_kind(town).items():
        lines.append(f"  {kind:<6} {mean:6.1f}")
    lines += ["", "Generations alive:"]
    for generation, count in sorted(generations(town).items()):
        lines.append(f"  generation {generation}: {count}")
    sizes = family_sizes(town)
    lines += ["", "Living children per parent:"]
    for size, count in sorted(sizes.items()):
        lines.append(f"  {size} child(ren): {count} parents")
    crime = crime_by_record(town)
    lines += [
        "",
        f"Justice: {stats['crimes']} crimes, {stats['convictions']} convictions, "
        f"{crime['in prison']} in prison, {crime['with a record']} of "
        f"{crime['of']} living people have a record",
    ]
    return "\n".join(lines)


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    print(report(load(argv[1])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
