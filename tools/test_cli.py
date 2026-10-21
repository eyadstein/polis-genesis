import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from polis_genesis.cli import _run_cli


class CliProcessTests(unittest.TestCase):
    @patch("polis_genesis.cli.subprocess.run")
    def test_nonzero_native_exit_status_is_returned_to_the_shell(self, run):
        run.return_value.returncode = 7
        with self.assertRaises(SystemExit) as raised:
            _run_cli(["polis_cli", "serve"])
        self.assertEqual(raised.exception.code, 7)

    @patch("polis_genesis.cli.subprocess.run")
    def test_successful_native_run_returns_normally(self, run):
        run.return_value.returncode = 0
        self.assertIsNone(_run_cli(["polis_cli", "console"]))


if __name__ == "__main__":
    unittest.main()
