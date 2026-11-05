"""news-guard.patch: herdr-task types text into a terminal only while claude is in front.

`hc send` types its text and presses Enter. Into a shell (a coordinator whose claude exited, or
a worker's `exec zsh -i` after claude) it would run as a command, and news carries a worker's
words (measured 05-11-2026: a news line landed in a shell coordinator). hc names a native claude
by its version ("2.1.318"); its foreground argv[0] is "claude".

Run: python3 -m unittest discover -s assistant/tests
"""
import os
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "vendor", "herdr-task"))

import herdr_task.agents as agents  # noqa: E402
import herdr_task.news as news  # noqa: E402

CLAUDE = {"state": "live", "foreground": {"name": "2.1.318", "argv": ["claude", "--settings", "{}"]},
          "labels": {"herdr.agent": "claude"}}
SHELL = {"state": "live", "foreground": {"name": "zsh", "argv": ["-zsh"]}, "labels": {"herdr.agent": "claude"}}
FAKE = {"state": "live", "foreground": {"name": "x", "argv": ["/tmp/evil/claude-not"]}}


class Guard(unittest.TestCase):
    def test_claude_in_front(self):
        for k, want in ((CLAUDE, True), (SHELL, False), (FAKE, False), ({}, False),
                        (dict(CLAUDE, state="exited"), False)):
            with mock.patch.object(agents, "hc_json", lambda *a, k=k: k):
                self.assertIs(agents.claude_in_front("t1"), want, k)

    def sends(self, k, call):
        sent = []
        fake_run = lambda args, **kw: sent.append(args) or mock.Mock(returncode=0, stdout="")
        with mock.patch.object(agents, "hc_json", lambda *a: k), \
             mock.patch.object(news, "hc_json", lambda *a: k), \
             mock.patch.object(news, "run", fake_run), \
             mock.patch.object(news.subprocess, "run", fake_run), \
             mock.patch.object(news, "typing", lambda *a, **kw: False), \
             mock.patch.object(news, "guard", lambda *a: None):
            out = call()
        return out, [a for a in sent if a[:2] == ["hc", "send"]]

    def test_news_never_reaches_a_shell(self):
        out, sent = self.sends(SHELL, lambda: news.news_send("t1", "x; touch ~/pwn"))
        self.assertFalse(out)
        self.assertEqual(sent, [])
        out, sent = self.sends(SHELL, lambda: news.send_or_hold("t1", "x; touch ~/pwn"))
        self.assertIsNone(out)
        self.assertEqual(sent, [])

    def test_news_reaches_claude(self):
        out, sent = self.sends(CLAUDE, lambda: news.news_send("t1", "hola"))
        self.assertTrue(out)
        self.assertEqual(len(sent), 1)
        out, sent = self.sends(CLAUDE, lambda: news.send_or_hold("t1", "hola"))
        self.assertEqual(out, "sent")
        self.assertEqual(len(sent), 1)

    def test_every_hc_send_is_guarded(self):
        """Each `"hc", "send"` in the package sits behind claude_in_front, except revive's, which
        types a shell line into a shell on purpose."""
        base = os.path.dirname(agents.__file__)
        unguarded = []
        for name in sorted(os.listdir(base)):
            if not name.endswith(".py") or name in ("revive.py", "machines.py"):
                continue
            with open(os.path.join(base, name)) as f:
                lines = f.read().split("\n")
            for i, l in enumerate(lines):
                if '"hc", "send"' in l and not any("claude_in_front" in x for x in lines[max(0, i - 5):i + 1]):
                    unguarded.append(f"{name}:{i + 1}")
        self.assertEqual(unguarded, [])


if __name__ == "__main__":
    unittest.main()
