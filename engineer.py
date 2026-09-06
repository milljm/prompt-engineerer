#!/usr/bin/env python3
"""Launch Prompt Engineerer without remembering npm.

The UI is a Vite / TanStack app. This script is the front door: it installs
Node dependencies when needed and then runs the matching npm script.

Examples
--------
./engineer.py              # start the dev server (default)
./engineer.py test         # Node unit tests
./engineer.py lint         # ESLint
./engineer.py ci           # test + lint + typecheck
./engineer.py build
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

COMMANDS: dict[str, list[str]] = {
    "dev": ["npm", "run", "dev"],
    "test": ["npm", "test"],
    "lint": ["npm", "run", "lint"],
    "typecheck": ["npm", "run", "typecheck"],
    "build": ["npm", "run", "build"],
    "install": ["npm", "install"],
    "format": ["npm", "run", "format"],
}

CI_STEPS: tuple[str, ...] = ("test", "lint", "typecheck")


def which_node() -> str | None:
    """Return the path to ``node`` or ``None`` if it is not on PATH."""
    return shutil.which("node")


def need_install(root: Path | None = None) -> bool:
    """True when ``node_modules`` is missing under *root*."""
    base = ROOT if root is None else root
    return not (base / "node_modules").is_dir()


def commands_for(name: str) -> list[list[str]]:
    """Expand a user-facing command into one or more npm argv lists.

    Args:
        name: A key of :data:`COMMANDS`, or ``ci``.

    Returns:
        Ordered npm commands to run.

    Raises:
        KeyError: If *name* is not a known command.
    """
    if name == "ci":
        return [COMMANDS[step] for step in CI_STEPS]
    return [COMMANDS[name]]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments.

    Args:
        argv: Tokens to parse. ``None`` reads ``sys.argv``.
    """
    parser = argparse.ArgumentParser(
        prog="engineer.py",
        description="Launch Prompt Engineerer (wraps npm so you don't have to).",
    )
    parser.add_argument(
        "command",
        nargs="?",
        default="dev",
        choices=[*COMMANDS, "ci"],
        help="dev (default), test, lint, typecheck, build, install, format, ci",
    )
    parser.add_argument(
        "extra",
        nargs=argparse.REMAINDER,
        help="Passed through to the underlying npm script",
    )
    return parser.parse_args(argv)


def stop_child(proc: subprocess.Popen[bytes] | None) -> None:
    """Send SIGINT (or terminate on Windows), then kill if the child hangs.

    Args:
        proc: The running child, or ``None`` if it never started.
    """
    if proc is None or proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            proc.terminate()
        else:
            proc.send_signal(signal.SIGINT)
        proc.wait(timeout=8)
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        proc.kill()
        try:
            proc.wait(timeout=3)
        except (subprocess.TimeoutExpired, KeyboardInterrupt, OSError):
            pass
    except OSError:
        pass


def run_command(cmd: list[str], extra: list[str] | None = None, cwd: Path | None = None) -> int:
    """Run *cmd* in *cwd* and return its exit code.

    Ctrl-C stops the child and returns 130 instead of dumping a traceback.

    Args:
        cmd: Executable plus arguments.
        extra: Optional trailing arguments (ignored when empty).
        cwd: Working directory. Defaults to the repo root.
    """
    full = list(cmd)
    if extra:
        full.extend(extra)
    proc: subprocess.Popen[bytes] | None = None
    try:
        # Own process group so Ctrl-C hits us first; we then stop the child.
        proc = subprocess.Popen(  # pylint: disable=consider-using-with
            full,
            cwd=ROOT if cwd is None else cwd,
            env=os.environ.copy(),
            start_new_session=True,
        )
        return int(proc.wait())
    except KeyboardInterrupt:
        stop_child(proc)
        print("\nStopped.", file=sys.stderr)
        return 130


def main(argv: list[str] | None = None) -> int:
    """CLI entry point.

    Args:
        argv: Optional argument vector for tests.

    Returns:
        Process exit code.
    """
    args = parse_args(argv)
    if which_node() is None:
        print("Node.js 22+ is required. Install it, then retry.", file=sys.stderr)
        return 1
    if args.command != "install" and need_install():
        print("Installing npm dependencies…")
        code = run_command(COMMANDS["install"])
        if code:
            return code
    extras = args.extra if args.command != "ci" else None
    try:
        for cmd in commands_for(args.command):
            print(f"→ {' '.join(cmd)}")
            code = run_command(cmd, extras)
            if code:
                return code
    except KeyboardInterrupt:
        print("\nStopped.", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
