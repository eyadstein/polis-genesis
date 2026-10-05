import unittest

import analyze


def person(**fields):
    base = {
        "id": 0, "name": "A", "alive": True, "age": 5000, "adult": True,
        "generation": 0, "money": 100, "job": None, "home": None,
        "home_kind": None, "home_district": None, "rent": None,
        "partner": None, "parents": None, "record": 0, "jailed": False,
        "friends": 0, "mood": 0.0, "hunger": 0.8,
    }
    base.update(fields)
    return base


def town(people):
    return {
        "tick": 100,
        "stats": {
            "employed": 1, "homeless": 1, "vacant": 2,
            "crimes": 3, "convictions": 1,
        },
        "people": people,
    }


class AnalyzeTests(unittest.TestCase):
    def test_gini_of_equal_and_unequal(self):
        self.assertAlmostEqual(analyze.gini([10, 10, 10, 10]), 0.0)
        self.assertGreater(analyze.gini([0, 0, 0, 100]), 0.7)
        self.assertEqual(analyze.gini([]), 0.0)

    def test_the_dead_are_left_out(self):
        t = town([person(id=1), person(id=2, alive=False, money=9999)])
        self.assertEqual(len(analyze.living(t)), 1)

    def test_wealth_shares_add_up(self):
        t = town([person(id=i, money=m) for i, m in enumerate([1, 1, 2, 6, 90])])
        shares = analyze.wealth_shares(t)
        self.assertAlmostEqual(sum(shares), 1.0)
        self.assertGreater(shares[2], shares[0])

    def test_pay_and_rent_are_grouped(self):
        t = town([
            person(id=1, job="Farmer", money=10, home_kind="Flat", rent=4),
            person(id=2, job="Farmer", money=30, home_kind="Flat", rent=6),
            person(id=3, job="Judge", money=100, home_kind="Villa", rent=20),
        ])
        self.assertEqual(analyze.pay_by_job(t), {"Farmer": 20, "Judge": 100})
        self.assertEqual(analyze.rent_by_kind(t), {"Flat": 5, "Villa": 20})

    def test_family_sizes_and_generations(self):
        t = town([
            person(id=1), person(id=2),
            person(id=3, parents=[1, 2], generation=1),
            person(id=4, parents=[1, 2], generation=1),
        ])
        self.assertEqual(dict(analyze.family_sizes(t)), {2: 2})
        self.assertEqual(dict(analyze.generations(t)), {0: 2, 1: 2})

    def test_crime_counts(self):
        t = town([person(id=1, record=2, jailed=True), person(id=2)])
        self.assertEqual(
            analyze.crime_by_record(t),
            {"with a record": 1, "in prison": 1, "of": 2},
        )

    def test_report_mentions_the_main_sections(self):
        t = town([person(id=1, job="Farmer", home_kind="Flat", rent=3)])
        text = analyze.report(t)
        for needle in ("Inequality", "Average rent", "Justice", "Generations alive"):
            self.assertIn(needle, text)


if __name__ == "__main__":
    unittest.main()
