"""Shared ground: paths, Fail, the clock, this herdr-task's own files, and running programs
(hc, herdr-app, git) only in the real environment."""

import io
import json
import os
import pwd
import stat
import subprocess
import time
import zipfile


VERSION = "1"
HOME = os.path.expanduser("~")
# HERDR_TASK_STORE: another task list (a test's own), as HERDR_TASK_SETTINGS for settings.
# dotmesh lockdown.patch: no test hooks from the environment. herdr-task runs outside the
# sandbox, and an inline `HERDR_TASK_STORE=... herdr-task ...` would hand it a forged store.
STORE = os.path.join(HOME, ".herdr", "tasks")
WORKTREES = os.path.join(HOME, ".herdr", "worktrees")
LEGACY = os.path.join(HOME, ".config", "herdr-app", "data", "tasks")
SHELLS = {"bash", "zsh", "fish", "sh", "dash", "ksh", "tcsh", "csh", "nu", "xonsh", "pwsh", "powershell", "elvish"}
RANK = {"blocked": 4, "done": 3, "working": 2, "idle": 1}
MAX_RUNNING = 10
GH = "gh"  # dotmesh lockdown.patch: no env hook (and local-only.patch never runs it)
# How often tick asks GitHub about a pull request (ms).
PR_EVERY = 60000


class Fail(Exception):
    pass


# Shepherdr's installer (bin/shepherdr) puts this file here while it replaces helpers or templates,
# and removes it once `shepherdr doctor` finds the install whole. Until then nothing copies a helper
# to another machine: not the sync, not a command's self-copy (cli.remote, herdr-artifact's,
# herdr-secret's install --on), so a half-done or wrong copy never reaches every machine.
SYNC_HOLD = os.path.join(HOME, ".herdr", "sync-hold")


def sync_held():
    """Why copies to other machines wait now (the hold's first line), or None."""
    try:
        with open(SYNC_HOLD) as f:
            return f.readline().strip() or "held by Shepherdr's installer"
    except OSError:
        return None


# Shepherdr's add-ons (lib/addons.json): one the person switched off in Shepherdr settings >
# Window is in Everywhere's "off" (~/.herdr/shepherdr.json, or HERDR_TASK_SETTINGS), and its
# background work here stops (autopilot, browsers, the sync to other machines).
def addon_off(name):
    path = os.path.join(HOME, ".herdr", "shepherdr.json")  # dotmesh lockdown.patch
    try:
        with open(path) as f:
            off = (json.load(f).get("everywhere") or {}).get("off")
    except (OSError, ValueError, AttributeError):
        return False
    return isinstance(off, list) and name in off


def now():
    return int(time.time() * 1000)


# ---- the real environment -------------------------------------------------------------------
# With a changed HOME, HERDR_APP_HOME or another herdr-core session (a test's), herdr-app and hc
# could still reach the person's real window and core and overwrite every machine's spaces. So
# herdr-task then refuses to run them at all, with why (HERD-55).
GUARDED = {"hc", "herdr-core", "herdr-app"}


def real_home():
    try:
        return pwd.getpwuid(os.getuid()).pw_dir
    except KeyError:
        return os.path.expanduser("~")


def not_real():
    """Why this environment isn't the account's own, or None when it is."""
    env, home = os.environ, real_home()
    same = lambda a, b: os.path.realpath(a) == os.path.realpath(b)
    if env.get("HOME") and not same(env["HOME"], home):
        return f"HOME is {env['HOME']}, not {home}"
    app = env.get("HERDR_APP_HOME")
    if app and not same(app, os.path.join(home, ".config", "herdr-app")):
        return f"HERDR_APP_HOME is {app}"
    if env.get("HC_SESSION") not in (None, "", "default"):
        return f"HC_SESSION is {env['HC_SESSION']}"
    sock = env.get("HC_SOCKET")
    if sock and not any(same(sock, s) for s in (env.get("HC_TERMINAL_SOCKET"), f"/run/user/{os.getuid()}/herdr-core/default.sock") if s):
        return f"HC_SOCKET is {sock}"
    return None


def guard(args):
    """Refuses herdr-app and hc outside the real environment (see not_real)."""
    name = os.path.basename(args[0])
    why = not_real() if name in GUARDED else None
    if why:
        raise Fail(f"refusing to run {name}: {why}. Run herdr-task with the real HOME, HERDR_APP_HOME, "
                   "HC_SESSION and HC_SOCKET: changed ones can reach the real window and wipe its spaces.")


def run(args, cwd=None, check=False):
    guard(args)
    r = subprocess.run(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
    if check and r.returncode != 0:
        raise Fail((r.stderr or r.stdout).strip() or f"{args[0]} failed")
    return r


# dotmesh lockdown.patch: herdr-task runs git outside the sandbox in a worktree its worker
# controls, so git runs no program the repo's config names (fsmonitor, hooks, external diff, pager).
GIT_SAFE = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-c", "diff.external=",
            "-c", "core.pager=cat"]


def git(cwd, *args):
    r = run(["git", *GIT_SAFE, "-C", cwd, *args])
    return r.returncode == 0, r.stdout.strip(), r.stderr.strip()


def hc_json(*args):
    r = run(["hc", *args, "--json"])
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None
APP_HOME = os.path.join(HOME, ".config", "herdr-app")
# ---- this herdr-task ------------------------------------------------------------------------
# herdr-task is a thin entry beside this package; on another machine it is one zipapp holding
# both (remote installs it as ~/.local/bin/herdr-task). ENTRY is what runs it again (agents' own
# commands, _track, the scheduler); bundle() is all of it as that one file.
PACKAGE = os.path.dirname(os.path.realpath(__file__))
_OUTER = os.path.dirname(PACKAGE)
ENTRY = _OUTER if os.path.isfile(_OUTER) else os.path.join(_OUTER, "herdr-task")


def bundle():
    """This herdr-task as one runnable file (a zipapp), the same bytes for the same code."""
    if zipfile.is_zipfile(ENTRY):
        with open(ENTRY, "rb") as f:
            return f.read()
    with open(ENTRY, "rb") as f:
        entry = f.read()
    buf = io.BytesIO()
    buf.write(b"#!/usr/bin/env python3\n")
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo("__main__.py", (1980, 1, 1, 0, 0, 0)), entry, zipfile.ZIP_DEFLATED)
        for name in sorted(os.listdir(PACKAGE)):
            if name.endswith(".py"):
                with open(os.path.join(PACKAGE, name), "rb") as f:
                    z.writestr(zipfile.ZipInfo(f"herdr_task/{name}", (1980, 1, 1, 0, 0, 0)), f.read(), zipfile.ZIP_DEFLATED)
    return buf.getvalue()


# dotmesh hardening.patch: herdr-task runs outside the sandbox in the Assistant's session, so
# --prompt-file would read any file (~/.ssh, .env) into a worker's brief. A brief comes from the
# task folder's .ai/tasks/ only (where the plan subagent writes it), as a plain file of a sane size.
PROMPT_MAX = 256 * 1024


def read_prompt_file(path, folder):
    base = os.path.realpath(folder) + os.sep + os.path.join(".ai", "tasks") + os.sep
    real = os.path.realpath(os.path.expanduser(path))
    if not real.startswith(base):
        raise Fail(f"--prompt-file reads a brief under {base} only.")
    # Read from the descriptor that was checked: no symlink at the end, a plain file with one name
    # (a hard link to ~/.aws/credentials would pass the path check), and still the same file as
    # the path names after opening.
    try:
        fd = os.open(real, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    except OSError:
        raise Fail(f"--prompt-file: can't open {path}.")
    st = os.fstat(fd)
    if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
        os.close(fd)
        raise Fail(f"--prompt-file: {path} isn't a plain file with a single name.")
    with os.fdopen(fd, "rb") as f:
        try:
            same = os.path.samestat(st, os.stat(real)) and os.path.realpath(real) == real
        except OSError:
            same = False
        if not same:
            raise Fail(f"--prompt-file: {path} changed while it was read.")
        data = f.read(PROMPT_MAX + 1)
    if len(data) > PROMPT_MAX:
        raise Fail(f"--prompt-file: {path} is over {PROMPT_MAX // 1024} KiB.")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        raise Fail(f"--prompt-file: {path} isn't UTF-8 text.")
