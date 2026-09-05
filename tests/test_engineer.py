"""Unit tests for the ./engineer.py launcher."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import engineer  # pylint: disable=wrong-import-position


class CommandsForTests(unittest.TestCase):
    """``commands_for`` expands aliases into npm argv lists."""

    def test_dev_is_npm_run_dev(self) -> None:
        self.assertEqual(engineer.commands_for("dev"), [["npm", "run", "dev"]])

    def test_ci_runs_test_lint_typecheck(self) -> None:
        steps = engineer.commands_for("ci")
        self.assertEqual(
            steps,
            [
                ["npm", "test"],
                ["npm", "run", "lint"],
                ["npm", "run", "typecheck"],
            ],
        )

    def test_unknown_command_raises(self) -> None:
        with self.assertRaises(KeyError):
            engineer.commands_for("not-a-command")


class ParseArgsTests(unittest.TestCase):
    """CLI defaults to the dev server."""

    def test_default_command_is_dev(self) -> None:
        args = engineer.parse_args([])
        self.assertEqual(args.command, "dev")
        self.assertEqual(args.extra, [])

    def test_explicit_test(self) -> None:
        args = engineer.parse_args(["test"])
        self.assertEqual(args.command, "test")

    def test_rejects_unknown(self) -> None:
        with self.assertRaises(SystemExit):
            engineer.parse_args(["wat"])


class NeedInstallTests(unittest.TestCase):
    """Install is skipped once node_modules exists."""

    def test_missing_then_present(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertTrue(engineer.need_install(root))
            (root / "node_modules").mkdir()
            self.assertFalse(engineer.need_install(root))


class MainTests(unittest.TestCase):
    """``main`` refuses to start without Node and forwards exit codes."""

    def test_missing_node_is_an_error(self) -> None:
        with mock.patch.object(engineer, "which_node", return_value=None):
            code = engineer.main(["test"])
        self.assertEqual(code, 1)

    def test_ci_stops_on_first_failure(self) -> None:
        with (
            mock.patch.object(engineer, "which_node", return_value="/usr/bin/node"),
            mock.patch.object(engineer, "need_install", return_value=False),
            mock.patch.object(engineer, "run_command", return_value=7) as run,
        ):
            code = engineer.main(["ci"])
        self.assertEqual(code, 7)
        run.assert_called_once_with(["npm", "test"], None)


if __name__ == "__main__":
    unittest.main()
