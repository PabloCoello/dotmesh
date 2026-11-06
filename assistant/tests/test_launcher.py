"""assistant/bin/assistant: the session's --settings exclude hc and herdr-task from the sandbox and
deny the verbs that run programs, write files or act for a worker (security gate, slice 4).

Run: python3 -m unittest discover -s assistant/tests
"""
import json
import os
import re
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
LAUNCHER = os.path.join(os.path.dirname(HERE), "bin", "assistant")


def settings():
    with open(LAUNCHER) as f:
        m = re.search(r"^SETTINGS='(.*?)'$", f.read(), re.S | re.M)
    return json.loads(m.group(1))


def denied(cmd, rules):
    """How a rule is read here, the widest reading of each form: `X:*` as a plain prefix (so
    `review:*` would also take `review-more`), `X *` and `X` as whole words, `X*` as a plain glob."""
    for r in rules:
        body = r[5:-1]
        if body.endswith(":*") and cmd.startswith(body[:-2]):
            return True
        if body.endswith(" *") and cmd.startswith(body[:-1]):
            return True
        if body.endswith("*") and not body.endswith((" *", ":*")) and cmd.startswith(body[:-1]):
            return True
        if cmd == body:
            return True
    return False


class Launcher(unittest.TestCase):
    def test_settings(self):
        s = settings()
        self.assertEqual(s["outputStyle"], "assistant")
        self.assertIs(s["sandbox"]["allowUnsandboxedCommands"], False)  # no hatch: no pty for herdr-task
        ex = s["sandbox"]["excludedCommands"]
        self.assertNotIn("hc *", ex)
        self.assertNotIn("herdr-task *", ex)
        for e in ex:  # one verb each, nothing that starts with a flag
            self.assertRegex(e, r"^(hc|herdr-task) [a-z][a-z-]*( \*)?$", e)

    def test_only_read_only_hc_verbs_leave_the_sandbox(self):
        verbs = {e.split()[1] for e in settings()["sandbox"]["excludedCommands"] if e.startswith("hc ")}
        self.assertEqual(verbs, {"get", "ls", "read", "wait"})

    def test_every_herdr_task_verb_is_excluded_or_denied(self):
        # A verb neither excluded nor denied would just fail in the sandbox; one both would be a slip.
        with open(os.path.join(os.path.dirname(HERE), "vendor", "herdr-task", "herdr_task", "cli.py")) as f:
            verbs = set(re.findall(r'(?:\bsub\.add_parser|(?<![\w.])cmd)\(\s*"([a-z_-]+)"', f.read()))
        s = settings()
        out = {e.split()[1] for e in s["sandbox"]["excludedCommands"] if e.startswith("herdr-task ")}
        rules = s["permissions"]["deny"]
        for v in verbs:
            self.assertNotEqual(v in out, denied(f"herdr-task {v} 1", rules), v)
        self.assertLessEqual(out, verbs)

    def test_no_excluded_form_is_denied(self):
        s = settings()
        rules = s["permissions"]["deny"]
        for e in s["sandbox"]["excludedCommands"]:
            self.assertFalse(denied(e.replace(" *", " 1"), rules), e)

    def test_dangerous_forms_are_denied(self):
        rules = settings()["permissions"]["deny"]
        for cmd in ("hc run true", "hc exec -- true", "hc file write x", "hc put t1 x", "hc update --from x",
                    "hc machine add x", "hc --json run true", "hc -V", "hc kill t1", "hc server stop",
                    "herdr-task ready 1", "herdr-task status 1 x", "herdr-task reviewed 1",
                    "herdr-task review --changes-file x", "herdr-task tell-assistant x y",
                    "herdr-task autopilot on", "herdr-task autopilot set --every x", "herdr-task --on m list",
                    "herdr-task -- start 1", "herdr-task machines", "herdr-task fix 1",
                    "hc interrupt t1", "herdr pane run x", "herdr", "hc send t1 x", "hc keys t1 enter",
                    "hc label t1 herdr.resume={}"):
            self.assertTrue(denied(cmd, rules), cmd)

    def test_the_persona_s_own_forms_are_not_denied(self):
        rules = settings()["permissions"]["deny"]
        for cmd in ("hc get t1 --json", "hc ls", "hc read t1 --lines 80", "herdr-task say 1 'x'",
                    "herdr-task keys 1 down enter", "hc wait t1", "herdr-task list --json", "herdr-task show 1 --json",
                    "herdr-task add 'x' --prompt 'y'", "herdr-task start 1", "herdr-task accept 1",
                    "herdr-task request open x", "herdr-task config --json", "herdr-task autopilot show",
                    "herdr-task progress 'x'", "herdr-task alert 'x'", "herdr-task review-more 1",
                    "herdr-task resume 1", "herdr-task done 1", "herdr-task reopen 1"):
            self.assertFalse(denied(cmd, rules), cmd)


if __name__ == "__main__":
    unittest.main()
