"""request-worktree.patch: a request (encargo) has its own branch and worktree, and its tasks
merge there, never in the main folder (spec R5, criteria 5, 8, 9).

Run: python3 -m unittest discover -s assistant/tests
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(os.path.dirname(HERE), "vendor", "herdr-task")
sys.path.insert(0, BIN)

import herdr_task.commands as commands  # noqa: E402
from herdr_task.base import Fail  # noqa: E402


def git(cwd, *args):
    return subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, check=True).stdout.strip()


def new_repo(root):
    repo = os.path.join(root, "app")
    os.makedirs(repo)
    git(repo, "init", "-q", "-b", "main")
    git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "inicio")
    return repo


def commit(cwd, name):
    with open(os.path.join(cwd, name), "w") as f:
        f.write(name)
    git(cwd, "add", name)
    git(cwd, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", name)


def state(repo):
    return (git(repo, "rev-parse", "HEAD"), git(repo, "symbolic-ref", "--short", "HEAD"),
            git(repo, "status", "--porcelain"))


class Cli(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.home)
        self.repo = new_repo(self.home)
        bindir = os.path.join(self.home, ".local", "bin")
        os.makedirs(bindir)
        with open(os.path.join(bindir, "hc"), "w") as f:
            f.write("#!/bin/sh\necho '{}'\n")
        os.chmod(os.path.join(bindir, "hc"), 0o755)

    def ht(self, *args, ok=True):
        r = subprocess.run([sys.executable, os.path.join(BIN, "herdr-task"), *args], capture_output=True, text=True,
                           env={"HOME": self.home, "PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"})
        if ok:
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r

    def test_open_makes_branch_and_worktree_and_leaves_the_folder_alone(self):
        before = state(self.repo)
        self.ht("request", "open", "pagos", "--folder", self.repo)
        wt = os.path.join(self.home, ".herdr", "worktrees", "app", "request-pagos")
        self.assertEqual(git(wt, "symbolic-ref", "--short", "HEAD"), "request/pagos")
        self.assertEqual(state(self.repo), before)
        out = json.loads(self.ht("request", "list", "--folder", self.repo, "--json").stdout)
        self.assertEqual(out["requests"]["pagos"]["branch"], "request/pagos")
        self.assertEqual(out["requests"]["pagos"]["worktree"], wt)
        self.assertEqual(out["requests"]["pagos"]["state"], "open")

    def test_open_twice_is_refused(self):
        self.ht("request", "open", "pagos", "--folder", self.repo)
        r = self.ht("request", "open", "pagos", "--folder", self.repo, ok=False)
        self.assertNotEqual(r.returncode, 0)

    def test_bad_names_are_refused(self):
        for slug in ("../x", "-x", "A", "a b", "a/b", ""):
            r = self.ht("request", "open", slug, "--folder", self.repo, ok=False)
            self.assertNotEqual(r.returncode, 0, slug)

    def test_from_another_branch(self):
        git(self.repo, "branch", "dev")
        self.ht("request", "open", "pagos", "--from", "dev", "--folder", self.repo)
        self.assertEqual(git(self.repo, "rev-parse", "request/pagos"), git(self.repo, "rev-parse", "dev"))

    def test_close_marks_and_keeps_everything(self):
        self.ht("request", "open", "pagos", "--folder", self.repo)
        self.ht("request", "close", "pagos", "--folder", self.repo)
        out = json.loads(self.ht("request", "list", "--folder", self.repo, "--json").stdout)
        self.assertEqual(out["requests"]["pagos"]["state"], "closed")
        self.assertTrue(os.path.isdir(out["requests"]["pagos"]["worktree"]))

    def wt(self):
        return os.path.join(self.home, ".herdr", "worktrees", "app", "request-pagos")

    def test_remove_refuses_untracked_and_ignored_files(self):
        with open(os.path.join(self.repo, ".git", "info", "exclude"), "a") as f:
            f.write(".env\n")
        self.ht("request", "open", "pagos", "--folder", self.repo)
        for name in ("loose.txt", ".env"):
            path = os.path.join(self.wt(), name)
            with open(path, "w") as f:
                f.write("x")
            r = self.ht("request", "close", "pagos", "--remove", "--folder", self.repo, ok=False)
            self.assertNotEqual(r.returncode, 0, name)
            self.assertTrue(os.path.isfile(path), name)
            os.remove(path)

    def test_remove_refuses_while_a_task_works_on_it(self):
        self.ht("request", "open", "pagos", "--folder", self.repo)
        self.ht("add", "algo", "--base", "request/pagos", "--folder", self.repo)
        r = self.ht("request", "close", "pagos", "--remove", "--folder", self.repo, ok=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertTrue(os.path.isdir(self.wt()))

    def test_remove_takes_work_that_is_on_a_remote(self):
        self.ht("request", "open", "pagos", "--folder", self.repo)
        commit(self.wt(), "a.txt")
        git(self.repo, "update-ref", "refs/remotes/origin/request/pagos", "request/pagos")
        self.ht("request", "close", "pagos", "--remove", "--folder", self.repo)
        self.assertFalse(os.path.isdir(self.wt()))

    def test_remove_with_the_folder_already_gone_still_deletes_the_branch(self):
        self.ht("request", "open", "pagos", "--folder", self.repo)
        shutil.rmtree(self.wt())
        self.ht("request", "close", "pagos", "--remove", "--folder", self.repo)
        self.assertEqual(git(self.repo, "branch", "--list", "request/pagos"), "")
        self.ht("request", "open", "pagos", "--folder", self.repo)

    def test_remove_refuses_unpublished_work_and_takes_clean_merged_work(self):
        self.ht("request", "open", "pagos", "--folder", self.repo)
        wt = os.path.join(self.home, ".herdr", "worktrees", "app", "request-pagos")
        commit(wt, "a.txt")
        r = self.ht("request", "close", "pagos", "--remove", "--folder", self.repo, ok=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertTrue(os.path.isdir(wt))
        git(self.repo, "merge", "-q", "--ff-only", "request/pagos")
        self.ht("request", "close", "pagos", "--remove", "--folder", self.repo)
        self.assertFalse(os.path.isdir(wt))
        self.assertNotIn("request/pagos", git(self.repo, "branch", "--list", "request/pagos"))


class FfMerge(unittest.TestCase):
    """accept's fast-forward lands in the worktree that has the base checked out."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root)
        self.repo = new_repo(self.root)
        self.req = os.path.join(self.root, "req")
        git(self.repo, "worktree", "add", "-q", "-b", "request/x", self.req, "main")
        self.task = os.path.join(self.root, "task")
        git(self.repo, "worktree", "add", "-q", "-b", "task/1-a", self.task, "request/x")
        commit(self.task, "a.txt")
        self.s = type("S", (), {"loc": {"folder": self.repo},
                                "data": {"requests": {"x": {"worktree": self.req, "state": "open"}}}})()
        self.t = {"branch": "task/1-a", "base": "request/x"}

    def test_merges_in_the_request_worktree(self):
        before = state(self.repo)
        self.assertTrue(commands.ff_merge(self.s, self.t))
        self.assertEqual(git(self.req, "rev-parse", "HEAD"), git(self.repo, "rev-parse", "task/1-a"))
        self.assertTrue(os.path.isfile(os.path.join(self.req, "a.txt")))
        self.assertEqual(state(self.repo), before)

    def test_uncommitted_changes_in_the_request_worktree_are_a_readable_refusal(self):
        with open(os.path.join(self.req, "x.txt"), "w") as f:
            f.write("x")
        git(self.req, "add", "x.txt")
        with self.assertRaises(Fail) as e:
            commands.ff_merge(self.s, self.t)
        self.assertIn(self.req, str(e.exception))

    def test_two_requests_do_not_interfere(self):
        req2 = os.path.join(self.root, "req2")
        git(self.repo, "worktree", "add", "-q", "-b", "request/y", req2, "main")
        self.s.data["requests"]["y"] = {"worktree": req2, "state": "open"}
        task2 = os.path.join(self.root, "task2")
        git(self.repo, "worktree", "add", "-q", "-b", "task/2-b", task2, "request/y")
        commit(task2, "b.txt")
        self.assertTrue(commands.ff_merge(self.s, self.t))
        self.assertTrue(commands.ff_merge(self.s, {"branch": "task/2-b", "base": "request/y"}))
        self.assertFalse(os.path.exists(os.path.join(self.req, "b.txt")))
        self.assertFalse(os.path.exists(os.path.join(req2, "a.txt")))

    def test_base_checked_out_in_the_main_folder_still_merges_there(self):
        t = {"branch": "task/9", "base": "main"}
        git(self.repo, "branch", "task/9", "main")
        wt = os.path.join(self.root, "t9")
        git(self.repo, "worktree", "add", "-q", wt, "task/9")
        commit(wt, "c.txt")
        self.assertTrue(commands.ff_merge(self.s, t))
        self.assertTrue(os.path.isfile(os.path.join(self.repo, "c.txt")))

    def test_unrelated_uncommitted_files_in_the_main_folder_keep_upstream_behaviour(self):
        with open(os.path.join(self.repo, "notes.txt"), "w") as f:
            f.write("mine")
        git(self.repo, "branch", "task/9", "main")
        wt = os.path.join(self.root, "t9")
        git(self.repo, "worktree", "add", "-q", wt, "task/9")
        commit(wt, "c.txt")
        self.assertTrue(commands.ff_merge(self.s, {"branch": "task/9", "base": "main"}))
        self.assertTrue(os.path.isfile(os.path.join(self.repo, "notes.txt")))

    def test_a_worktree_that_is_not_a_request_is_never_merged_into(self):
        # A task whose --base is another task's live branch: upstream refused, and so does this.
        before = git(self.task, "rev-parse", "HEAD")
        git(self.repo, "branch", "task/2", "task/1-a")
        t2 = os.path.join(self.root, "t2")
        git(self.repo, "worktree", "add", "-q", t2, "task/2")
        commit(t2, "d.txt")
        self.assertFalse(commands.ff_merge(self.s, {"branch": "task/2", "base": "task/1-a"}))
        self.assertEqual(git(self.task, "rev-parse", "HEAD"), before)

    def test_a_base_checked_out_nowhere_moves_forward(self):
        git(self.repo, "branch", "free", "main")
        git(self.repo, "branch", "task/3", "main")
        t3 = os.path.join(self.root, "t3")
        git(self.repo, "worktree", "add", "-q", t3, "task/3")
        commit(t3, "e.txt")
        self.assertTrue(commands.ff_merge(self.s, {"branch": "task/3", "base": "free"}))
        self.assertEqual(git(self.repo, "rev-parse", "free"), git(self.repo, "rev-parse", "task/3"))


if __name__ == "__main__":
    unittest.main()
