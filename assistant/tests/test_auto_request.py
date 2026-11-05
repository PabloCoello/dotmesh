"""auto-request.patch: an automation in a repo adds its tasks into an open request, never into the
main folder, because it fires later with nobody watching (spec R5, R7).

Run: python3 -m unittest discover -s assistant/tests
"""
import argparse
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "vendor", "herdr-task"))
sys.path.insert(0, HERE)

import herdr_task.automations as automations  # noqa: E402
import herdr_task.commands as commands  # noqa: E402
import herdr_task.tick as tick  # noqa: E402
from herdr_task.request import unattended_problem  # noqa: E402
from herdr_task.base import Fail  # noqa: E402
from test_requests import git, new_repo, state  # noqa: E402


def fields(**kw):
    d = dict(prompt=None, prompt_file=None, every=None, on=None, match=None, from_=None, agent=None,
             here=False, worktree=False, space=None, parent=None, base=None)
    d.update(kw)
    return argparse.Namespace(**d)


class FakeStore:
    def __init__(self, repo, requests):
        self.loc, self.data, self.dirty, self.tasks = {"folder": repo, "kind": "repo"}, {"requests": requests}, False, []

    def new(self, title, prompt="", mode="here"):
        t = {"id": len(self.tasks) + 1, "title": title, "prompt": prompt, "mode": mode, "state": "todo"}
        self.tasks.append(t)
        return t

    def ref(self, t):
        return f"T-{t['id']}"


class InRepo:
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root)
        self.repo = new_repo(self.root)
        self.req = os.path.join(self.root, "req")
        git(self.repo, "worktree", "add", "-q", "-b", "request/pagos", self.req, "main")
        self.reqs = {"pagos": {"branch": "request/pagos", "worktree": self.req, "state": "open"}}
        self.s = FakeStore(self.repo, self.reqs)


class AutoInRequest(InRepo, unittest.TestCase):
    def new_auto(self, **kw):
        a = {"id": 1, "title": "nightly", "prompt": "", "mode": "worktree", "runs": []}
        automations.set_auto_fields(self.s, a, fields(every="daily 9:00", **kw), adding=True)
        return a

    def test_needs_an_open_request(self):
        for kw in ({}, {"base": "main"}, {"base": "request/nada"}, {"base": "request/pagos", "here": True}):
            with self.assertRaises(Fail, msg=kw) as e:
                self.new_auto(**kw)
            self.assertIn("request", str(e.exception).lower(), kw)
        self.reqs["pagos"]["state"] = "closed"
        with self.assertRaises(Fail):
            self.new_auto(base="request/pagos")

    def test_keeps_the_request(self):
        self.assertEqual(self.new_auto(base="request/pagos")["base"], "request/pagos")

    def test_edit_cannot_drop_it(self):
        a = self.new_auto(base="request/pagos")
        for kw in ({"base": "main"}, {"base": ""}, {"here": True}):
            with self.assertRaises(Fail, msg=kw):
                automations.set_auto_fields(self.s, dict(a), fields(**kw))
        automations.set_auto_fields(self.s, a, fields(prompt="y"))
        self.assertEqual(a["base"], "request/pagos")

    def fire(self, a):
        before, started = state(self.repo), []
        with mock.patch.object(automations, "begin", lambda s, t, *x: started.append(dict(t))), \
                mock.patch.object(automations, "queue_reason", lambda s, t: None), \
                mock.patch.object(automations, "worktrees_on", lambda s: True), \
                mock.patch.object(automations, "worker_argv", lambda s, t, sp: ["claude"]):
            t = automations.fire(self.s, a, "time")
        self.assertEqual(state(self.repo), before)
        return t, started

    def test_fire_adds_the_task_into_its_request(self):
        a = dict(self.new_auto(base="request/pagos"), space="sp1")
        t, started = self.fire(a)
        self.assertEqual((t["base"], t["base_set"], t["mode"]), ("request/pagos", True, "worktree"))
        self.assertEqual(len(started), 1)
        self.assertFalse(a.get("paused"))

    def test_fire_without_an_open_request_adds_nothing_and_pauses(self):
        a = self.new_auto(base="request/pagos")
        old = {"id": 2, "title": "old", "every": a["every"], "space": "sp1", "runs": []}  # stored before this patch
        cases = (("closed", dict(a, space="sp1")), ("removed", dict(a, space="sp1")),
                 ("no base", dict(old)), ("here", dict(old, mode="here", base="request/pagos")))
        for name, x in cases:
            self.reqs["pagos"]["state"] = "open"
            if name == "closed":
                self.reqs["pagos"]["state"] = "closed"
            if name == "removed":
                self.reqs["pagos"].update(state="closed", removed=True)
            t, started = self.fire(x)
            self.assertIsNone(t, name)
            self.assertEqual((started, self.s.tasks), ([], []), name)
            self.assertTrue(x["paused"], name)
            self.assertIn("request", x["last_error"]["message"].lower(), name)

    def test_outside_git_nothing_changes(self):
        self.s.loc["kind"] = "folder"
        a = {"id": 1, "title": "x", "prompt": "", "mode": "here", "runs": []}
        automations.set_auto_fields(self.s, a, fields(every="daily 9:00"), adding=True)
        self.assertIsNone(unattended_problem(self.s, "here", None))


class ScheduledInRequest(InRepo, unittest.TestCase):
    """add/start/edit --at, --in: a task that starts by itself later goes into a request too."""

    def task(self, **kw):
        t = {"id": 1, "title": "x", "state": "todo", "mode": "worktree"}
        t.update(kw)
        return t

    def test_schedule_needs_an_open_request(self):
        for t in (self.task(), self.task(base="main"), self.task(mode="here", base="request/pagos")):
            with self.assertRaises(Fail, msg=t):
                commands.schedule(self.s, t, 1)
            self.assertEqual(t["state"], "todo")
        t = self.task(base="request/pagos")
        commands.schedule(self.s, t, 1)
        self.assertEqual(t["state"], "scheduled")

    def test_due_pass_holds_a_task_changed_since(self):
        good, bad = self.task(id=1, base="request/pagos"), self.task(id=2, base="request/pagos")
        for t in (good, bad):
            commands.schedule(self.s, t, 1)
        bad.pop("base")  # edit --base "" after it was scheduled
        self.s.data["tasks"] = [good, bad]
        report = {}
        tick.due_pass(self.s, report)
        self.assertEqual(good["state"], "queued")
        self.assertEqual(bad["state"], "todo")
        self.assertNotIn("scheduled_for", bad)
        self.assertIn("request", bad["attention"].lower())
        self.assertEqual(report["not_started"], ["T-2"])
        self.assertNotIn("queue", bad)
        self.assertTrue(good["unattended"])

    def test_queue_rechecks_work_that_came_due(self):
        t = self.task(base="request/pagos", state="queued", unattended=True, queue={"space": "sp1"})
        report = {}
        self.assertFalse(tick.not_started(self.s, t, report))
        t.pop("base")  # edit --base "" while it waited
        self.assertTrue(tick.not_started(self.s, t, report))
        self.assertEqual((t["state"], report["not_started"]), ("todo", ["T-1"]))
        self.assertFalse(set(t) & {"queue", "queued_at", "unattended"})
        mine = self.task(id=2, state="queued")  # queued by hand: upstream as is
        self.assertFalse(tick.not_started(self.s, mine, report))
        self.assertIn("not_started(s, t, report)", open(tick.__file__).read().split("def tick_store")[1])

if __name__ == "__main__":
    unittest.main()
