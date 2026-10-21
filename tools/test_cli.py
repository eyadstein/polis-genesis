import argparse
import io
import sys
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from polis_genesis.cli import _run_cli, cmd_serve


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

    @patch("polis_genesis.cli._run_cli", side_effect=FileNotFoundError("cargo"))
    @patch("polis_genesis.cli.find_cli_binary", return_value=None)
    def test_serve_explains_missing_cargo_for_installed_package(self, find_binary, run_cli):
        error = io.StringIO()
        args = argparse.Namespace(seed=1, population=200, port=8787)

        with redirect_stderr(error), self.assertRaises(SystemExit) as raised:
            cmd_serve(args)

        self.assertEqual(raised.exception.code, 1)
        self.assertIn("cargo was not found", error.getvalue())
        self.assertIn("rustup.rs", error.getvalue())
        self.assertEqual(run_cli.call_args.args[0][0], "cargo")


if __name__ == "__main__":
    unittest.main()
