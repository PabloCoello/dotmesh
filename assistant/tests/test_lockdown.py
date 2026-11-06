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
            self.assertIs(cfg["sandbox"]["allowUnsandboxedCommands"], False)  # no escape hatch

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


def sh(*args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True)


class CommonGit(unittest.TestCase):
    """Measured 2026-11-06: inside the sandbox a worker wrote the common .git (its commits do),
    so `git update-ref` moved main and request/* around accept. Its --settings deny every write
    there but objects, reflogs, its own worktree dir and its own branch's path."""

    def setUp(self):
        import tempfile
        self.tmp = os.path.realpath(tempfile.mkdtemp())
        self.main = os.path.join(self.tmp, "main")
        sh("git", "init", "-q", "--template=", "-b", "main", self.main)
        sh("git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "b", cwd=self.main)
        for b in ("request/x", "feature", "release/1"):
            sh("git", "branch", b, cwd=self.main)
        self.wt = os.path.join(self.tmp, "wt")
        self.other = os.path.join(self.tmp, "other")
        sh("git", "worktree", "add", "-q", "-b", "task/1-a", self.wt, cwd=self.main)
        sh("git", "worktree", "add", "-q", "-b", "task/2-b", self.other, cwd=self.main)
        sh("git", "pack-refs", "--all", cwd=self.main)  # main, feature, request/x: packed only
        self.c = os.path.join(self.main, ".git")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def denies(self, darwin=True):
        with mock.patch.object(launch.sys, "platform", "darwin" if darwin else "linux"):
            return launch.git_denies(self.main, self.wt, "task/1-a")

    def test_everything_but_the_workers_own_is_denied(self):
        deny, c = self.denies(), self.c
        for p in ("HEAD", "index", "packed-refs", "config", "hooks", "info", "modules", "MERGE_HEAD",
                  "refs/heads/main", "refs/heads/feature", "refs/heads/release", "refs/heads/request",
                  "refs/heads/task/2-b", "refs/tags", "refs/replace", "refs/stash", "refs/remotes",
                  "worktrees/other"):
            self.assertIn(os.path.join(c, p), deny, p)
        self.assertIn(os.path.join(c, "worktrees", "wt", "config.worktree"), deny)
        for p in ("objects", "logs", "refs", "refs/heads", "refs/heads/task", "refs/heads/task/1-a",
                  "worktrees", "worktrees/wt"):
            self.assertNotIn(os.path.join(c, p), deny, p)
        self.assertTrue(all(os.path.isabs(p) for p in deny))

    def test_packed_branches_are_denied_even_without_a_file(self):
        self.assertFalse(os.path.exists(os.path.join(self.c, "refs", "heads", "main")))
        self.assertIn(os.path.join(self.c, "refs", "heads", "main"), self.denies())
        # Measured: the sandbox won't create a dir holding a denied path, so herdr-task makes it.
        self.assertTrue(os.path.isdir(os.path.join(self.c, "refs", "heads", "task")))

    def test_linux_makes_what_it_denies_exist(self):
        """Its sandbox may plant a placeholder file for a missing path (an empty MERGE_HEAD), so
        it gets only existing paths, and packed branches get their loose file first."""
        main_oid = subprocess.run(["git", "rev-parse", "main"], cwd=self.main, capture_output=True, text=True).stdout.strip()
        deny = self.denies(darwin=False)
        self.assertTrue(deny and all(os.path.lexists(p) for p in deny))
        self.assertNotIn(os.path.join(self.c, "MERGE_HEAD"), deny)
        for p in ("refs/heads/main", "refs/heads/request", "refs/heads/request/x", "refs/heads/task/2-b",
                  "refs/tags", "refs/replace"):
            self.assertTrue(os.path.lexists(os.path.join(self.c, p)), p)
        for p in ("refs/heads/main", "refs/heads/request", "refs/heads/task/2-b", "refs/replace"):
            self.assertIn(os.path.join(self.c, p), deny, p)
        self.assertFalse(os.path.isdir(os.path.join(self.c, "refs", "stash")))  # a file ref
        self.assertEqual([n for n in os.listdir(os.path.join(self.c, "refs", "heads")) if ".herdr-" in n], [])
        with open(os.path.join(self.c, "refs", "heads", "main")) as f:
            self.assertEqual(f.read().strip(), main_oid)  # same value: nothing moved
        r = subprocess.run(["git", "rev-parse", "main", "request/x"], cwd=self.main, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_the_workers_own_gitdir_does_not_decide(self):
        """A detached HEAD or a rewritten commondir in its worktree changes nothing."""
        before = self.denies()
        sh("git", "checkout", "-q", "--detach", cwd=self.wt)
        with open(os.path.join(self.c, "worktrees", "wt", "commondir"), "w") as f:
            f.write("/nowhere\n")
        self.assertEqual(self.denies(), before)

    def test_a_planted_symlink_is_refused(self):
        import shutil
        shutil.rmtree(os.path.join(self.c, "refs", "heads", "task"), ignore_errors=True)
        os.symlink(self.tmp, os.path.join(self.c, "refs", "heads", "task"))
        with self.assertRaises(Fail):
            self.denies()

    def test_a_planted_branch_is_not_reused(self):
        """A worker can create refs/heads/task/<next> under its own namespace; the next task
        must not start from it unless the task names that branch itself."""
        s = mock.Mock(loc={"folder": self.main, "kind": "repo"})
        with mock.patch.object(launch, "WORKTREES", os.path.join(self.tmp, "wts")):
            sh("git", "branch", "task/7-next", cwd=self.main)
            with self.assertRaises(Fail):
                launch.folder_for(s, {"id": 7, "title": "next", "mode": "worktree"})
            self.assertTrue(launch.folder_for(s, {"id": 7, "title": "next", "mode": "worktree", "branch": "task/7-next"}))

    def test_it_refuses_rather_than_return_less(self):
        for main, wt, br in ((self.tmp, self.wt, "task/1-a"), (self.main, self.tmp, "task/1-a"),
                             (self.main, self.wt, None), (self.main, self.wt, "request/y"),
                             (self.main, self.wt, "task/../main"), (self.main, self.wt, "task/a\0b")):
            with self.assertRaises(Fail, msg=(main, wt, br)):
                launch.git_denies(main, wt, br)

    def test_own_argv_carries_them(self):
        deny = self.denies()
        with mock.patch.object(launch, "own_path", lambda: "herdr-task"):
            out = launch.own_argv(["claude"], deny)
            plain = launch.own_argv(["claude"])
        self.assertEqual(json.loads(out[out.index("--settings") + 1])["sandbox"]["filesystem"]["denyWrite"], deny)
        self.assertNotIn("filesystem", json.loads(plain[plain.index("--settings") + 1])["sandbox"])

    def test_revive_restarts_with_the_recorded_list_or_not_at_all(self):
        import herdr_task.revive as revive
        k = {"address": "t1", "labels": {}, "cwd": "/anywhere"}
        a = {"address": "t1", "session": None, "argv": ["claude"]}
        deny = self.denies()
        with mock.patch.object(launch, "own_path", lambda: "herdr-task"):
            rec = revive.task_record(k, {"state": "running", "mode": "worktree", "git_deny": deny, "agents": [a]})
            self.assertIn(json.dumps(deny), json.dumps(rec["argv"]).replace("\\", ""))
            self.assertIsNone(revive.task_record(k, {"state": "running", "mode": "worktree", "agents": [a]}))
            out = launch.own_argv(["claude"], deny)
            self.assertTrue(revive.sane_argv(out))
            cfg = json.loads(out[out.index("--settings") + 1])
            cfg["sandbox"]["filesystem"]["allowWrite"] = ["/"]
            self.assertFalse(revive.sane_argv(["claude", "--settings", json.dumps(cfg)]))
            del cfg["sandbox"]["filesystem"]["allowWrite"]
            cfg["sandbox"]["filesystem"]["denyWrite"] = [1]
            self.assertFalse(revive.sane_argv(["claude", "--settings", json.dumps(cfg)]))


if __name__ == "__main__":
    unittest.main()
