"""assistant/scripts/install.sh against a throwaway $HOME (spec criteria 1, 2, 11, 13).

Run: python3 -m unittest discover -s assistant/tests
"""
import json
import os
import shutil
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INSTALL = os.path.join(ROOT, "scripts", "install.sh")
REAL_TASK = os.path.realpath(os.path.join(ROOT, "vendor", "herdr-task", "herdr-task"))


class Install(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.home)
        self.fakebin = os.path.join(self.home, "fakebin")
        os.makedirs(self.fakebin)
        # A system PATH without any shepherdr; tests add one when they need it.
        self.path = f"{self.fakebin}:/usr/bin:/bin:/usr/sbin:/sbin"
        for d in ("/opt/homebrew/bin", "/usr/local/bin"):
            if os.path.isfile(os.path.join(d, "python3")) and not os.path.isfile("/usr/bin/python3"):
                self.path += f":{d}"

    def run_install(self, *args):
        env = {"HOME": self.home, "PATH": self.path, "LANG": "C"}
        return subprocess.run(["bash", INSTALL, *args], capture_output=True, text=True, env=env)

    def h(self, *p):
        return os.path.join(self.home, *p)

    def snapshot(self):
        out = {}
        for dirpath, dirnames, filenames in os.walk(self.home):
            dirnames[:] = [d for d in dirnames if d != "fakebin"]
            for n in dirnames + filenames:
                p = os.path.join(dirpath, n)
                st = os.lstat(p)
                out[p] = (st.st_mode, st.st_mtime_ns, os.readlink(p) if os.path.islink(p) else None)
        return out

    def test_installs_links_and_seeds(self):
        r = self.run_install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(os.path.realpath(self.h(".local/bin/herdr-task")), REAL_TASK)
        self.assertEqual(os.path.realpath(self.h(".local/bin/assistant")),
                         os.path.realpath(os.path.join(ROOT, "bin", "assistant")))
        for role in ("worker", "reviewer"):
            self.assertEqual(os.path.realpath(self.h(f".config/herdr-core/templates/{role}.md")),
                             os.path.realpath(os.path.join(ROOT, "templates", f"{role}.md")))
        with open(self.h(".herdr/shepherdr.json")) as f:
            d = json.load(f)
        ev = d["everywhere"]
        self.assertEqual(ev["reviewer"], {"agent": "claude"})
        self.assertEqual(ev["tasks"]["merge"], "ask")
        self.assertIs(ev["tasks"]["proof"], False)
        self.assertNotIn("autopilot", json.dumps(d))
        self.assertTrue({"browser", "machines", "chat"} <= set(ev["off"]))

    def test_second_run_changes_nothing(self):
        self.assertEqual(self.run_install().returncode, 0)
        before = self.snapshot()
        r = self.run_install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.snapshot(), before)

    def test_existing_settings_are_kept(self):
        os.makedirs(self.h(".herdr"))
        self.assertEqual(self.run_install().returncode, 0)
        with open(self.h(".herdr/shepherdr.json"), "w") as f:
            f.write('{"everywhere": {"tasks": {"merge": "auto"}}}')
        self.assertEqual(self.run_install().returncode, 0)
        with open(self.h(".herdr/shepherdr.json")) as f:
            self.assertEqual(json.load(f)["everywhere"]["tasks"]["merge"], "auto")

    def assert_refused_without_writes(self):
        before = self.snapshot()
        r = self.run_install()
        self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
        self.assertEqual(self.snapshot(), before)

    def test_refuses_next_to_shepherdr(self):
        p = os.path.join(self.fakebin, "shepherdr")
        with open(p, "w") as f:
            f.write("#!/bin/sh\n")
        os.chmod(p, 0o755)
        self.assert_refused_without_writes()

    def test_refuses_a_store_it_did_not_create(self):
        for leftover in ("tasks", "worktrees"):
            with self.subTest(leftover=leftover):
                os.makedirs(self.h(".herdr", leftover))
                self.assert_refused_without_writes()
                shutil.rmtree(self.h(".herdr"))

    def test_refuses_a_foreign_binary(self):
        for name in ("herdr-task", "assistant"):
            with self.subTest(name=name):
                os.makedirs(self.h(".local/bin"), exist_ok=True)
                with open(self.h(".local/bin", name), "w") as f:
                    f.write("#!/bin/sh\n")
                self.assert_refused_without_writes()
                os.remove(self.h(".local/bin", name))
                os.symlink("/usr/bin/true", self.h(".local/bin", name))
                self.assert_refused_without_writes()
                os.remove(self.h(".local/bin", name))

    def test_a_moved_checkout_is_relinked(self):
        self.assertEqual(self.run_install().returncode, 0)
        old = "/old/dotmesh"
        with open(self.h(".herdr/.dotmesh-assistant"), "w") as f:
            f.write(old + "\n")
        os.remove(self.h(".local/bin/herdr-task"))
        os.symlink(old + "/assistant/vendor/herdr-task/herdr-task", self.h(".local/bin/herdr-task"))
        r = self.run_install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(os.path.realpath(self.h(".local/bin/herdr-task")), REAL_TASK)
        with open(self.h(".herdr/.dotmesh-assistant")) as f:
            self.assertEqual(f.read().strip(), os.path.dirname(ROOT))

    def test_store_is_private(self):
        self.assertEqual(self.run_install().returncode, 0)
        self.assertEqual(os.stat(self.h(".herdr")).st_mode & 0o777, 0o700)
        self.assertEqual(os.stat(self.h(".herdr/shepherdr.json")).st_mode & 0o077, 0)

    def test_a_foreign_template_is_backed_up_and_replaced(self):
        os.makedirs(self.h(".config/herdr-core/templates"))
        with open(self.h(".config/herdr-core/templates/worker.md"), "w") as f:
            f.write("old\n")
        r = self.run_install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(os.path.islink(self.h(".config/herdr-core/templates/worker.md")))
        backups = [os.path.join(d, n) for d, _, ns in os.walk(self.h("dotfiles-backup")) for n in ns]
        self.assertEqual(len(backups), 1, backups)
        with open(backups[0]) as f:
            self.assertEqual(f.read(), "old\n")

    def fake(self, name):
        p = os.path.join(self.fakebin, name)
        with open(p, "w") as f:
            f.write("#!/bin/sh\nexit 0\n")
        os.chmod(p, 0o755)

    def test_status_reports_drift(self):
        r = self.run_install("--status")
        self.assertEqual(r.returncode, 1)
        self.assertIn("  --  ", r.stdout)
        self.assertIn("falta la persona", r.stdout)
        self.assertEqual(self.run_install("--status", "extra").returncode, 1)

    def test_status_is_clean_after_install(self):
        self.fake("hc")
        self.path = f"{self.h('.local/bin')}:{self.path}"
        self.assertEqual(self.run_install().returncode, 0)
        # What `make stow` does for the persona: a link into the checkout.
        os.makedirs(self.h(".claude/output-styles"))
        os.symlink(os.path.join(os.path.dirname(ROOT), "claude", ".claude", "output-styles", "assistant.md"),
                   self.h(".claude/output-styles/assistant.md"))
        r = self.run_install("--status")
        # The checkout's own uncommitted assistant/ files are real drift while this branch is open.
        bad = [l for l in r.stdout.splitlines() if l.startswith("  --  ") and "sin confirmar" not in l]
        self.assertEqual(bad, [], r.stdout)

    def test_status_flags_a_persona_link_that_points_elsewhere(self):
        self.assertEqual(self.run_install().returncode, 0)
        os.makedirs(self.h(".claude/output-styles"))
        os.symlink(os.path.join(os.path.dirname(ROOT), "claude", ".claude", "output-styles", "maker.md"),
                   self.h(".claude/output-styles/assistant.md"))
        self.assertIn("falta la persona", self.run_install("--status").stdout)
        os.remove(self.h(".claude/output-styles/assistant.md"))
        os.symlink(self.h("nowhere/assistant.md"), self.h(".claude/output-styles/assistant.md"))
        self.assertIn("falta la persona", self.run_install("--status").stdout)

    def test_status_flags_a_task_with_a_pull_request(self):
        self.assertEqual(self.run_install().returncode, 0)
        os.makedirs(self.h(".herdr/tasks"))
        with open(self.h(".herdr/tasks/x.json"), "w") as f:
            f.write('{"tasks": [{"id": 1, "pr": 12}]}')
        self.assertIn("pull request", self.run_install("--status").stdout)

    def test_status_flags_shepherdr(self):
        self.assertEqual(self.run_install().returncode, 0)
        self.fake("shepherdr")
        self.assertIn("shepherdr instalado", self.run_install("--status").stdout)

    def test_herdr_task_reads_the_templates_without_rewriting_them(self):
        """instructions() rewrites a template that isn't head + stripped body, which would replace
        the link with a file; ours are already in that shape."""
        self.assertEqual(self.run_install().returncode, 0)
        code = ("import sys; sys.path.insert(0, sys.argv[1]); from herdr_task.templates import instructions;"
                "print(instructions('worker').splitlines()[0]); print(instructions('reviewer').splitlines()[0])")
        r = subprocess.run(["python3", "-c", code, os.path.dirname(REAL_TASK)], capture_output=True, text=True,
                           env={"HOME": self.home, "PATH": self.path, "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("dotmesh maker flow", r.stdout)
        for role in ("worker", "reviewer"):
            self.assertTrue(os.path.islink(self.h(f".config/herdr-core/templates/{role}.md")), role)

    def test_herdr_task_runs_from_the_link(self):
        """Criterion 2: the linked CLI answers from ~/.local/bin, and own_path() gives workers the
        bare name their sandbox exclusions match."""
        self.fake("hc")
        self.assertEqual(self.run_install().returncode, 0)
        env = {"HOME": self.home, "PATH": f"{self.h('.local/bin')}:{self.path}", "PYTHONDONTWRITEBYTECODE": "1"}
        r = subprocess.run(["herdr-task", "--version"], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(r.stdout.strip(), r.stdout)
        repo = os.path.join(self.home, "repo")
        subprocess.run(["git", "init", "-q", repo], check=True)
        r = subprocess.run(["herdr-task", "config", "--json", "--folder", repo], capture_output=True, text=True,
                           env=env, cwd=repo)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        json.loads(r.stdout)
        code = "import sys; sys.path.insert(0, sys.argv[1]); import herdr_task.launch as l; print(l.own_path())"
        r = subprocess.run(["python3", "-c", code, os.path.dirname(REAL_TASK)], capture_output=True, text=True, env=env)
        self.assertEqual(r.stdout.strip(), "herdr-task", r.stderr)


if __name__ == "__main__":
    unittest.main()
