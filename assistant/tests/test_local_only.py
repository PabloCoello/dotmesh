"""local-only.patch: herdr-task never reaches GitHub (spec R4, acceptance criterion 4).

A real repo whose remote looks like GitHub, a real worktree for the task, and a `gh` that works
and logs every call. Ready on the task must not run gh and must not push: the remote is a bare
repo whose update hook logs any ref that arrives.

Run: python3 -m unittest discover -s assistant/tests
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(os.path.dirname(HERE), "vendor", "herdr-task")


def sh(*args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True)


class Store:
    """Enough of herdr_task.store.Store for finalize(), in memory."""

    def __init__(self, folder):
        self.data = {"tasks": []}
        self.loc = {"folder": folder, "kind": "repo", "name": "r"}
        self.dirty, self.write, self.prefix, self.slug = False, True, "T", "r"

    def ref(self, t):
        return f"T-{t['id']}"

    def key(self, t):
        return f"r#{t['id']}"


class LocalOnly(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.gh_log = os.path.join(self.tmp, "gh.log")
        self.push_log = os.path.join(self.tmp, "push.log")
        # a gh that would succeed at everything, and says so in its log
        gh = os.path.join(self.tmp, "gh")
        with open(gh, "w") as f:
            f.write(f'#!/bin/sh\necho "$@" >> "{self.gh_log}"\necho o/r\n')
        os.chmod(gh, 0o755)
        # the remote: a bare repo that logs every pushed ref
        remote = os.path.join(self.tmp, "remote.git")
        sh("git", "init", "-q", "--bare", remote)
        hook = os.path.join(remote, "hooks", "update")
        with open(hook, "w") as f:
            f.write(f'#!/bin/sh\necho "$1" >> "{self.push_log}"\n')
        os.chmod(hook, 0o755)
        self.main = os.path.join(self.tmp, "repo")
        sh("git", "init", "-q", "-b", "main", self.main)
        for k, v in (("user.name", "t"), ("user.email", "t@t"), ("commit.gpgsign", "false")):
            sh("git", "config", k, v, cwd=self.main)
        sh("git", "commit", "-q", "--allow-empty", "-m", "base", cwd=self.main)
        sh("git", "remote", "add", "origin", remote, cwd=self.main)
        self.wt = os.path.join(self.tmp, "wt")
        sh("git", "worktree", "add", "-q", "-b", "task-1", self.wt, cwd=self.main)
        sh("git", "commit", "-q", "--allow-empty", "-m", "work", cwd=self.wt)

        sys.path.insert(0, BIN)
        self.addCleanup(sys.path.remove, BIN)
        import herdr_task.base as base
        import herdr_task.commands as commands
        import herdr_task.github as github
        self.commands, self.github = commands, github
        for mod, name, value in ((base, "GH", gh), (github, "GH", gh),
                                 (commands, "merge_policy", lambda s, t: "ask")):
            p = mock.patch.object(mod, name, value)
            p.start()
            self.addCleanup(p.stop)

    def logged(self, path):
        return open(path).read() if os.path.exists(path) else ""

    def test_github_is_never_asked(self):
        s = Store(self.main)
        self.assertIsNone(self.github.github(s))
        self.assertEqual(self.logged(self.gh_log), "")

    def test_ready_leaves_the_branch_here(self):
        s = Store(self.main)
        t = {"id": 1, "title": "x", "state": "running", "mode": "worktree", "worktree": self.wt,
             "branch": "task-1", "base": "main", "summary": "done"}
        s.data["tasks"].append(t)
        msg = self.commands.finalize(s, t)
        self.assertEqual(t["state"], "ready")
        self.assertNotIn("pr", t)
        self.assertNotIn("attention", t)
        self.assertIn("accepts it", msg)
        self.assertEqual(self.logged(self.gh_log), "", "gh ran")
        self.assertEqual(self.logged(self.push_log), "", "something was pushed")


if __name__ == "__main__":
    unittest.main()
