"""interface.patch: tasks ordered by request (encargo) in `board`, `list` and `request list`,
and each request's workers as panes of one herdr-app tab.

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

from herdr_task.output import board_groups, board_text, counts_line  # noqa: E402


def git(cwd, *args):
    return subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, check=True).stdout.strip()


class Cli(unittest.TestCase):
    """A repo in a throwaway HOME, herdr-task called without a terminal (as an agent's Bash)."""

    def setUp(self):
        self.home = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.home)
        self.repo = os.path.join(self.home, "app")
        os.makedirs(self.repo)
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "inicio")

    def ht(self, *args, ok=True):
        r = subprocess.run([sys.executable, os.path.join(BIN, "herdr-task"), *args], capture_output=True, text=True,
                           cwd=self.repo, start_new_session=True,
                           env={"HOME": self.home, "PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"})
        if ok:
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r


def v(ref, status, base=None, title="t"):
    return {"ref": ref, "status": status, "status_text": status.capitalize(), "state": "running",
            "title": title, "base": base, "prefix": "HAT"}


class Groups(unittest.TestCase):
    def test_groups_by_request_with_the_neediest_first(self):
        views = [v("HAT-1", "todo", "request/a"), v("HAT-2", "working", "request/b"),
                 v("HAT-3", "needs", "request/b"), v("HAT-4", "ready", "request/a"),
                 v("HAT-5", "queued", "request/a"), v("HAT-6", "working"),
                 v("HAT-7", "working", "request/a")]
        g = board_groups(views)
        self.assertEqual([x["request"] for x in g], ["b", "a", None])
        self.assertEqual([t["ref"] for t in g[0]["tasks"]], ["HAT-3", "HAT-2"])
        self.assertEqual([t["ref"] for t in g[1]["tasks"]], ["HAT-4", "HAT-7", "HAT-5", "HAT-1"])
        self.assertEqual(g[1]["counts"], {"ready": 1, "working": 1, "queued": 1, "todo": 1})

    def test_done_tasks_stay_off_the_board(self):
        d = v("HAT-1", "done", "request/a")
        d["state"] = "done"
        self.assertEqual(board_groups([d]), [])

    def test_a_branch_that_is_not_a_request_counts_as_none(self):
        self.assertEqual(board_groups([v("HAT-1", "todo", "main")])[0]["request"], None)

    def test_counts_line_puts_needs_you_first(self):
        self.assertEqual(counts_line({"working": 2, "needs": 1}), "1 needs you · 2 working")
        self.assertEqual(counts_line({}), "nothing active")

    def test_text_has_a_header_per_request_and_indented_tasks(self):
        out = board_text(board_groups([v("HAT-1", "needs", "request/a", "login"), v("HAT-2", "todo")]))
        lines = out.splitlines()
        self.assertTrue(lines[0].startswith("a "), out)
        self.assertIn("1 needs you", lines[0])
        self.assertTrue(lines[1].startswith("  HAT-1"), out)
        self.assertTrue(lines[2].startswith("(no request) "), out)
        self.assertEqual(board_text([]), "Nothing on the board.")


class Commands(Cli):
    def setUp(self):
        super().setUp()
        for slug in ("pagos", "informe"):
            self.ht("request", "open", slug, "--folder", self.repo)
        self.ht("add", "cobro", "--base", "request/pagos")
        self.ht("add", "tabla", "--base", "request/informe")
        self.ht("add", "recibo", "--base", "request/pagos")

    def test_board_groups_by_request(self):
        lines = self.ht("board").stdout.splitlines()
        self.assertIn("2 to do", next(x for x in lines if x.startswith("pagos ")))
        self.assertIn("1 to do", next(x for x in lines if x.startswith("informe ")))
        heads = [x.split()[0] for x in lines if not x.startswith(" ")]
        self.assertEqual(sorted(heads), ["informe", "pagos"])
        pagos = lines.index(next(x for x in lines if x.startswith("pagos")))
        self.assertIn("cobro", lines[pagos + 1])
        self.assertIn("recibo", lines[pagos + 2])

    def test_watch_wants_a_terminal(self):
        r = self.ht("board", "--watch", ok=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--watch", r.stderr)

    def test_board_json(self):
        out = json.loads(self.ht("board", "--json").stdout)
        by = {g["request"]: g for g in out["requests"]}
        self.assertEqual([t["title"] for t in by["pagos"]["tasks"]], ["cobro", "recibo"])
        self.assertEqual(by["informe"]["counts"], {"todo": 1})

    def test_list_groups_by_request(self):
        out = self.ht("list").stdout.splitlines()
        heads = [x for x in out if x and not x.startswith(" ")]
        self.assertEqual(len(heads), 2, out)
        self.assertTrue(all(x.startswith("  ") for x in out if x not in heads), out)

    def test_list_json_is_unchanged(self):
        out = json.loads(self.ht("list", "--json").stdout)
        self.assertEqual([t["title"] for t in out["tasks"]], ["cobro", "tabla", "recibo"])

    def test_request_list_counts_its_tasks(self):
        out = self.ht("request", "list").stdout
        line = next(x for x in out.splitlines() if x.startswith("pagos"))
        self.assertIn("2 to do", line)
        js = json.loads(self.ht("request", "list", "--json").stdout)
        self.assertEqual(js["requests"]["pagos"]["counts"], {"todo": 2})



# ---- the request's tab in herdr-app ------------------------------------------------------------

import contextlib  # noqa: E402
import io  # noqa: E402
from unittest import mock  # noqa: E402

import herdr_task.launch as launch  # noqa: E402

LS = {"spaces": [{"id": "sp1", "tabs": [
    {"id": "tbA", "name": "coord", "terminals": [{"terminal": "t1"}]},
    {"id": "tbP", "name": "pagos", "terminals": [{"terminal": "t2"}]},
    {"id": "tb3", "name": "3", "terminals": [{"terminal": "t9"}]}]}]}


class AppTab(unittest.TestCase):
    """A fake herdr-app on PATH: `ls` prints LS, `do` appends its argv to a log."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir)
        self.log = os.path.join(self.dir, "log")
        with open(os.path.join(self.dir, "ls.json"), "w") as f:
            json.dump(LS, f)
        with open(os.path.join(self.dir, "herdr-app"), "w") as f:
            f.write(f'#!/bin/sh\nif [ "$1" = ls ]; then cat {self.dir}/ls.json; else echo "$@" >> {self.log}; echo "{{}}"; fi\n')
        os.chmod(os.path.join(self.dir, "herdr-app"), 0o755)
        p = mock.patch.dict(os.environ, {"PATH": self.dir + ":/usr/bin:/bin"})
        p.start()
        self.addCleanup(p.stop)

    def done(self):
        return open(self.log).read() if os.path.exists(self.log) else ""

    def test_a_worker_joins_its_request_s_tab(self):
        labels, name = launch.pane_labels({"base": "request/pagos"}, "sp1")
        self.assertEqual(labels, ["--label", "herdr.space=sp1", "--label", "herdr.request=pagos", "--label", "herdr.tab=tbP"])
        self.assertIsNone(name)

    def test_the_first_worker_lets_herdr_make_the_tab_and_names_it(self):
        labels, name = launch.pane_labels({"base": "request/login-sso"}, "sp1")
        self.assertEqual(labels, ["--label", "herdr.space=sp1", "--label", "herdr.request=login-sso"])
        self.assertEqual(name, "login-sso")
        self.assertTrue(launch.name_new_tab("sp1", "t9", "login-sso"))
        self.assertEqual(self.done().split(), ["do", "tab.rename", "--id", "tb3", "--name", "login-sso"])

    def test_no_pane_without_a_request_or_for_another_machine(self):
        for task, space in (({"base": "main"}, "sp1"), ({}, "sp1"), ({"base": "request/pagos"}, "vm/sp1"),
                            ({"base": "request/pagos"}, None), ({"base": "request/Mal=x"}, "sp1")):
            self.assertEqual(launch.pane_labels(task, space), ([], None), (task, space))

    def test_an_unknown_space_stays_hidden_with_a_line_saying_so(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertEqual(launch.pane_labels({"base": "request/pagos"}, "sp9"), ([], None))
        self.assertEqual(len(err.getvalue().strip().splitlines()), 1)

    def test_without_herdr_app_nothing_changes(self):
        os.remove(os.path.join(self.dir, "herdr-app"))
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertEqual(launch.pane_labels({"base": "request/pagos"}, "sp1"), ([], None))
        self.assertEqual(err.getvalue(), "")

    def test_renaming_a_task_leaves_its_request_s_tab_alone(self):
        agents = {"t2": {"labels": {"herdr.tab": "tbP", "herdr.request": "pagos"}},
                  "t5": {"labels": {"herdr.tab": "tbX"}}}
        s = mock.Mock()
        s.key.return_value = "k"
        with mock.patch.object(launch, "live_agents", return_value=[{"address": a} for a in agents]), \
                mock.patch.object(launch, "detail", side_effect=lambda k: agents[k["address"]]):
            self.assertEqual(launch.task_tabs(s, {}), ["tbX"])

    def test_naming_gives_up_when_the_tab_never_shows(self):
        self.assertFalse(launch.name_new_tab("sp1", "t404", "pagos", tries=2))
        self.assertEqual(self.done(), "")

    def test_a_window_that_answers_garbage_is_no_window(self):
        with open(os.path.join(self.dir, "ls.json"), "w") as f:
            f.write("not json")
        self.assertIsNone(launch.app_tabs("sp1"))

    def launched(self, role=None):
        calls = []

        def run(args, **kw):
            calls.append(args)
            return subprocess.CompletedProcess(args, 0, json.dumps({"address": "t7"}), "")
        s = mock.Mock()
        s.key.return_value = "k"
        s.loc = {"folder": self.dir}
        task = {"base": "request/pagos", "agents": [], "mode": "worktree", "id": 1, "title": "x"}
        with mock.patch.dict(os.environ, {"HOME": self.dir}), mock.patch.object(launch, "run", side_effect=run), \
                mock.patch.object(launch, "low_priority", side_effect=lambda c, n: c), \
                mock.patch.object(launch, "folder_for", return_value=self.dir), \
                mock.patch.object(launch, "own_argv", side_effect=lambda c, *a: c), \
                mock.patch.object(launch, "git_denies", return_value=[]), \
                mock.patch.object(launch, "agent_name", return_value="hat-1-x"), \
                mock.patch.object(launch, "track"), mock.patch.object(launch, "vet_argv"), \
                mock.patch.object(launch, "app_tabs", return_value=LS["spaces"][0]["tabs"]):
            launch.launch(s, task, ["claude"], "sp1", role=role)
        return next(c for c in calls if c[:2] == ["hc", "run"])

    def test_a_reviewer_stays_hidden(self):
        hc = self.launched(role="reviewer")
        self.assertFalse(any(a.startswith(("herdr.space=", "herdr.tab=", "herdr.request=")) for a in hc), hc)

    def test_launch_passes_the_pane_labels_to_hc_run(self):
        hc = self.launched()
        self.assertIn("herdr.tab=tbP", hc)
        self.assertIn("herdr.space=sp1", hc)
        self.assertIn("herdr.request=pagos", hc)


if __name__ == "__main__":
    unittest.main()
