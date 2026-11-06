"""dotmesh request-worktree.patch: a request (encargo) is a branch with its own worktree that
several tasks branch from and merge into (`add --base request/<slug>`), so their work comes
together away from the main folder, which is left as it is.

    herdr-task request open <slug> [--from <branch>]   its branch and worktree
    herdr-task request list                            this folder's requests
    herdr-task request close <slug> [--remove]         marks it closed; --remove also takes the
                                                       worktree and branch, once nothing is lost
"""
import os
import re

from .base import Fail, git, now, WORKTREES
from .github import remote_of
from .launch import base_ref, current_base
from .output import counts_line, counts_of, request_of, say
from .store import open_store

SLUG = re.compile(r"[a-z0-9][a-z0-9-]{0,39}")


def checked_out_at(main, branch, allowed):
    """The worktree that has `branch` checked out when it is one of `allowed` (realpaths), else
    None. A task's or the user's other worktree is never merged into."""
    ok, out, _ = git(main, "worktree", "list", "--porcelain")
    path = None
    for line in out.split("\n") if ok else []:
        if line.startswith("worktree "):
            path = line[len("worktree "):]
        elif line == f"branch refs/heads/{branch}" and path and os.path.realpath(path) in allowed:
            return path
    return None


def merge_targets(s):
    """Where ff_merge may merge: the main folder and this folder's open requests' worktrees."""
    reqs = (s.data.get("requests") or {}).values()
    return {os.path.realpath(s.loc["folder"])} | {os.path.realpath(r["worktree"]) for r in reqs
                                                   if r.get("state") == "open" and r.get("worktree")}


def default_branch(main):
    """The remote's default branch when it is also here, else the folder's current one."""
    ok, ref, _ = git(main, "symbolic-ref", "--short", f"refs/remotes/{remote_of(main)}/HEAD")
    name = ref.split("/", 1)[1] if ok and "/" in ref else None
    if name and git(main, "show-ref", "--verify", "--quiet", f"refs/heads/{name}")[0]:
        return name
    return current_base(main)


def published(main, tip, into):
    """Every commit up to `tip` is in `into` or on a remote-tracking branch (as last fetched)."""
    if into and git(main, "merge-base", "--is-ancestor", tip, into)[0]:
        return True
    return bool(git(main, "for-each-ref", "--contains", tip, "--format=%(refname)", "refs/remotes")[1])


def open_request(s, base):
    """The base of work that starts with nobody watching (an automation, a scheduled task) in a
    repo: an open request's branch, or Fail. So that work never falls back to the main folder's
    branch (auto-request.patch)."""
    base = (base or "").strip()
    slug = base[len("request/"):] if base.startswith("request/") else None
    r = (s.data.get("requests") or {}).get(slug) if slug else None
    if not r or r.get("state") != "open":
        raise Fail(f"Work that starts by itself goes into an open request: --base request/<slug> "
                   f"(herdr-task request list). {base or 'No --base'} isn't one.")
    return base


def unattended_problem(s, mode, base):
    """Why work with this mode and base can't start by itself here, or None."""
    if s.loc["kind"] != "repo":
        return None
    if mode != "worktree":
        return "It would work in the folder itself (--here); work that starts by itself goes into a request."
    try:
        open_request(s, base)
    except Fail as e:
        return str(e)
    return None


def cmd_request(args):
    verb = args.request
    with open_store(args, write=verb != "list") as s:
        if s.loc["kind"] != "repo":
            raise Fail("Requests need a git repo.")
        main, reqs = s.loc["folder"], s.data.setdefault("requests", {})
        if verb == "list":
            # dotmesh interface.patch: how many of its tasks are in each state (done ones aside).
            from .commands import task_views
            views = task_views(s)
            shown = {k: {**r, "counts": counts_of([v for v in views if request_of(v) == k])} for k, r in reqs.items()}
            return say(args, {"requests": shown},
                       "\n".join(f"{k}  {r['state']}  {counts_line(r['counts'])}  {r['branch']}  {r['worktree']}"
                                 for k, r in sorted(shown.items()))
                       or "No requests.")
        slug = args.slug
        if not SLUG.fullmatch(slug or ""):
            raise Fail(f"{slug!r} isn't a request name: lowercase letters, digits and -, up to 40.")
        branch = f"request/{slug}"
        if verb == "open":
            if slug in reqs and not reqs[slug].get("removed"):
                raise Fail(f"Request {slug} exists ({reqs[slug]['state']}).")
            if git(main, "show-ref", "--verify", "--quiet", f"refs/heads/{branch}")[0]:
                raise Fail(f"Branch {branch} already exists.")
            src = base_ref(main, args.from_) if args.from_ else default_branch(main)
            path = os.path.join(WORKTREES, os.path.basename(main), f"request-{slug}")
            if os.path.exists(path):
                raise Fail(f"{path} already exists.")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            ok, _, err = git(main, "worktree", "add", "-b", branch, path, src)
            if not ok:
                raise Fail(err or "git worktree add failed")
            reqs[slug] = {"branch": branch, "worktree": path, "from": src, "state": "open", "created": now()}
            s.dirty = True
            return say(args, reqs[slug], f"Request {slug}: {branch} at {path}. Tasks join it with --base {branch}.")
        if slug not in reqs:
            raise Fail(f"There is no request {slug}.")
        r = reqs[slug]
        if args.remove:
            busy = [s.ref(t) for t in s.data["tasks"] if t.get("base") == branch and t.get("state") != "done"]
            if busy:
                raise Fail(f"Tasks still work on {branch}: {', '.join(busy)}.")
            wt = r["worktree"]
            git(main, "worktree", "prune")
            if os.path.isdir(wt):
                # --ignored too: `worktree remove` deletes ignored files (.env, builds) unasked.
                ok, dirty, err = git(wt, "status", "--porcelain", "--ignored")
                if not ok or dirty:
                    raise Fail(f"{wt} has uncommitted, untracked or ignored files; nothing removed." if ok else err)
            ok, tip, _ = git(main, "rev-parse", "--verify", f"refs/heads/{branch}")
            if ok and not published(main, tip, r.get("from")):
                raise Fail(f"{branch} has commits that are neither in {r.get('from')} nor on a remote; nothing removed.")
            if os.path.isdir(wt):
                ok, _, err = git(main, "worktree", "remove", wt)
                if not ok:
                    raise Fail(err or "git worktree remove failed")
            # Deleted only if it still points where `published` looked: a commit added since stays.
            if tip:
                ok, _, err = git(main, "update-ref", "-d", f"refs/heads/{branch}", tip)
                if not ok:
                    raise Fail(f"{branch} wasn't deleted: {err or 'git update-ref failed'}")
            r["removed"] = now()
        r["state"], r["closed"] = "closed", r.get("closed") or now()
        s.dirty = True
        return say(args, r, f"Request {slug} closed" + (", worktree and branch removed." if args.remove else "."))
