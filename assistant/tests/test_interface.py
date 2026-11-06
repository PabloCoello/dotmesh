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
        out = self.ht("board").stdout
        self.assertRegex(out, r"(?s)informe .*2 to do|pagos .*2 to do")
        lines = out.splitlines()
        heads = [x.split()[0] for x in lines if not x.startswith(" ")]
        self.assertEqual(sorted(heads), ["informe", "pagos"])
        pagos = lines.index(next(x for x in lines if x.startswith("pagos")))
        self.assertIn("cobro", lines[pagos + 1])
        self.assertIn("recibo", lines[pagos + 2])

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


if __name__ == "__main__":
    unittest.main()
