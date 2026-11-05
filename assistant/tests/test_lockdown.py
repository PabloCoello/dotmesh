"""lockdown.patch: herdr-task only ever starts a confined `claude` (ADR 0004, amendment).

hc and herdr-task run outside the Bash sandbox in the sessions that exclude them, and every
agent herdr-task starts is spawned by the herdr-core daemon, outside the sandbox too. So the
argv it starts is the boundary: only `claude` with flags that cannot loosen its own sandbox.
And a worker's --settings excludes only herdr-task, with every verb that starts, edits or
merges tasks denied.

Run: python3 -m unittest discover -s assistant/tests
"""
import json
import re
import subprocess
import os
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(os.path.dirname(HERE), "vendor", "herdr-task")
sys.path.insert(0, BIN)

import herdr_task.launch as launch  # noqa: E402
import herdr_task.settings as settings  # noqa: E402
from herdr_task.base import Fail  # noqa: E402

OK = [
    ["claude"],
    ["claude", "--model", "opus", "--effort", "high"],
    ["claude", "--settings", json.dumps({"fastMode": False})],
    ["claude", "--permission-mode", "default"],
    ["claude", "--resume", "abc-123"],
]
REFUSED = [
    ["sh", "-c", "touch /tmp/x"],
    ["/bin/claude"],
    ["codex", "--no-daemon"],
    ["env", "claude"],
    ["claude", "--dangerously-skip-permissions"],
    ["claude", "--allow-dangerously-skip-permissions"],
    ["claude", "--permission-mode", "bypassPermissions"],
    ["claude", "--settings", json.dumps({"sandbox": {"enabled": False}})],
    ["claude", "--settings", json.dumps({"fastMode": False, "permissions": {"allow": ["Bash"]}})],
    ["claude", "--settings", "~/evil.json"],
    ["claude", "--setting-sources", "project"],
    ["claude", "--add-dir", "/"],
    ["claude", "--plugin-dir", "/x"],
    ["claude", "--mcp-config", "/x"],
    ["claude", "--model"],
    ["claude", "--model=opus"],
]


class Vet(unittest.TestCase):
    def test_a_plain_claude_passes(self):
        for argv in OK:
            self.assertEqual(settings.vet_argv(argv), argv, argv)

    def test_anything_else_is_refused(self):
        for argv in REFUSED:
            with self.assertRaises(Fail, msg=argv):
                settings.vet_argv(argv)

    def test_argv_flag_is_refused(self):
        with self.assertRaises(Fail):
            settings.agent_argv("claude", json.dumps(["sh", "-c", "id"]))

    def test_other_agents_are_refused(self):
        with self.assertRaises(Fail):
            settings.agent_argv("codex")
        self.assertEqual(settings.agent_argv("claude"), ["claude"])

    def test_launch_never_reaches_hc_with_a_refused_argv(self):
        ran = []
        with mock.patch.object(launch, "run", lambda *a, **k: ran.append(a)):
            for argv in (["sh", "-c", "id"], ["claude", "--dangerously-skip-permissions"]):
                with self.assertRaises(Fail):
                    launch.launch(None, {}, argv, "sp1")
                with self.assertRaises(Fail):
                    launch.launch(None, {}, ["claude"], "sp1", resume=argv)
        self.assertEqual(ran, [])


class Cli(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run([sys.executable, os.path.join(BIN, "herdr-task"), *args],
                              capture_output=True, text=True, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})

    def test_a_leading_double_dash_is_refused(self):
        r = self.run_cli("--", "tick", "--help")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("lockdown", r.stderr)

    def test_test_hooks_in_the_environment_are_ignored(self):
        env = {"HERDR_TASK_STORE": "/x", "HERDR_TASK_SETTINGS": "/y", "HERDR_TASK_TEMPLATES": "/z",
               "HERDR_AUTOPILOT_HOME": "/w", "HERDR_TASK_HOOK_LOG": "/v"}
        code = ("import sys; sys.path.insert(0, sys.argv[1]); import herdr_task.base as b, herdr_task.settings as s;"
                "import herdr_task.autopilot as a, herdr_task.launch as l, inspect;"
                "print(b.STORE.startswith('/x'), s.SETTINGS.startswith('/y'), s.TEMPLATES.startswith('/z'),"
                " a.HEARTBEATS.startswith('/w'), 'HERDR_TASK_HOOK_LOG' in inspect.getsource(l.cmd_allow))")
        r = subprocess.run([sys.executable, "-c", code, BIN], capture_output=True, text=True,
                           env={**os.environ, **env, "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual(r.stdout.split(), ["False"] * 5, r.stderr)


class GitAndEnv(unittest.TestCase):
    def test_git_runs_no_repo_supplied_program(self):
        import herdr_task.base as base
        seen = []
        with mock.patch.object(base, "run", lambda args, **k: seen.append(args) or mock.Mock(returncode=0, stdout="", stderr="")):
            base.git("/w", "status")
        args = seen[0]
        for c in ("core.fsmonitor=false", "core.hooksPath=/dev/null", "diff.external=", "core.pager=cat"):
            self.assertIn(c, args)
        self.assertEqual(args[-1], "status")

    def test_the_environment_is_scrubbed_at_start(self):
        code = ("import sys, os; sys.path.insert(0, sys.argv[1]); import herdr_task.cli as c; c.scrub_env();"
                "print(any(k.startswith('GIT_') for k in os.environ), os.environ['PATH'].startswith('/evil'),"
                " 'HERDR_TASK_GH' in os.environ)")
        env = {**os.environ, "GIT_CONFIG_COUNT": "1", "GIT_DIR": "/x", "PATH": "/evil:" + os.environ["PATH"],
               "HERDR_TASK_GH": "/x", "PYTHONDONTWRITEBYTECODE": "1"}
        r = subprocess.run([sys.executable, "-c", code, BIN], capture_output=True, text=True, env=env)
        self.assertEqual(r.stdout.split(), ["False", "False", "False"], r.stderr)


class WorkerSettings(unittest.TestCase):
    def worker(self, argv):
        with mock.patch.object(launch, "own_path", lambda: "herdr-task"):
            out = launch.own_argv(argv)
        i = out.index("--settings")
        return json.loads(out[i + 1])

    def test_only_the_workers_own_verbs_are_excluded(self):
        """Per verb, so any other form (`herdr-task -- start`, `herdr-task tell-assistant`) stays
        in the sandbox, where herdr-core's socket is unreachable."""
        for argv in (["claude"], ["claude", "--settings", json.dumps({"fastMode": True})]):
            cfg = self.worker(argv)
            self.assertEqual(sorted(cfg["sandbox"]["excludedCommands"]),
                             sorted(f"herdr-task {v} *" for v in launch.OWN))
            self.assertNotIn("hc *", json.dumps(cfg))
            self.assertNotIn("herdr-task *", cfg["sandbox"]["excludedCommands"])

    def test_every_other_verb_is_denied(self):
        """Every verb cli.py defines, read from its source, is either the worker's own or denied."""
        with open(os.path.join(BIN, "herdr_task", "cli.py")) as f:
            src = f.read()
        verbs = set(re.findall(r'(?:\bcmd|sub\.add_parser)\(\s*"([\w-]+)"', src))
        self.assertTrue({"tell-assistant", "review", "machines", "home", "start", "ready"} <= verbs, verbs)
        deny = self.worker(["claude"])["permissions"]["deny"]
        missing = {v for v in verbs - set(launch.OWN) if f"Bash(herdr-task {v}:*)" not in deny}
        self.assertEqual(missing, set(), "verbs neither the worker's own nor denied")
        for verb in launch.OWN:
            self.assertNotIn(f"Bash(herdr-task {verb}:*)", deny, verb)

    def test_a_worker_without_settings_is_refused(self):
        with mock.patch.object(launch, "own_path", lambda: "/a path/herdr-task"):
            with self.assertRaises(Fail):
                launch.own_argv(["claude"])

    def test_a_saved_settings_file_is_replaced(self):
        cfg = self.worker(["claude", "--settings", "~/old.json"])
        self.assertIn("sandbox", cfg)

    def test_agents_write_the_bare_name_when_it_is_on_path(self):
        here = os.path.realpath(launch.ENTRY)
        with mock.patch.object(launch.shutil, "which", lambda n: here):
            self.assertEqual(launch.own_path(), "herdr-task")
        with mock.patch.object(launch.shutil, "which", lambda n: None):
            self.assertEqual(launch.own_path(), launch.ENTRY)

    def test_fast_mode_is_kept(self):
        self.assertIs(self.worker(["claude", "--settings", json.dumps({"fastMode": True})])["fastMode"], True)


if __name__ == "__main__":
    unittest.main()
