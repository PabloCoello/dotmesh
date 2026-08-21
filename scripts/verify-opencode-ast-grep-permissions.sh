#!/usr/bin/env bash
set -e

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for this verifier" >&2
  exit 1
fi

python3 <<'PY'
from fnmatch import fnmatchcase
from pathlib import Path

AGENTS = {
    "maker": "opencode/.config/opencode/agents/maker.md",
    "build": "opencode/.config/opencode/agents/build.md",
    "review": "opencode/.config/opencode/agents/review.md",
    "security": "opencode/.config/opencode/agents/security.md",
}


def bash_rules(path):
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    try:
        end = lines[1:].index("---") + 1
    except ValueError as exc:
        raise SystemExit(f"missing frontmatter end in {path}") from exc

    frontmatter = lines[1:end]
    for index, line in enumerate(frontmatter):
        if line.startswith("  bash:"):
            value = line.split(":", 1)[1].strip()
            if value:
                return value

            rules = []
            for child in frontmatter[index + 1 :]:
                if not child.startswith("    "):
                    break
                key, effect = child.strip().rsplit(":", 1)
                rules.append((key.strip('"'), effect.strip()))
            return rules
    raise SystemExit(f"missing permission.bash in {path}")


def bash_permission(agent, command):
    rules = bash_rules(AGENTS[agent])
    if isinstance(rules, str):
        return rules

    match = "ask"
    for pattern, effect in rules:
        if fnmatchcase(command, pattern):
            match = effect
    return match


def assert_permission(agent, command, expected):
    actual = bash_permission(agent, command)
    if actual != expected:
        raise SystemExit(
            f"{agent}: expected {expected!r} for {command!r}, got {actual!r}"
        )


ast_grep_commands = [
    "ast-grep --help",
    "ast-grep --version",
    "ast-grep run -p 'console.log($$$ARGS)' -l ts src",
    "ast-grep scan rules",
    "ast-grep outline src/parser.ts",
    "env AST_GREP_LOG=debug ast-grep run -p foo -l js .",
    "command ast-grep run -p foo -l js .",
    "/opt/homebrew/bin/ast-grep run -p foo -l js .",
    "ast-grep run -p foo -l js . > matches.txt",
    "ast-grep run -p foo -l js . & touch marker",
    "ast-grep run -p foo -l js . && touch marker",
    "ast-grep run -p foo -l js . | tee matches.txt",
    "ast-grep run -p foo -l js .; touch marker",
    "ast-grep run -p foo -l js .\ntouch marker",
    "ast-grep --rewrite foo -p bar -l js .",
    "ast-grep --rewrite=foo -p bar -l js .",
    "ast-grep run -p foo --rewrite bar -l js .",
    "ast-grep run -p foo --rewrite=bar -l js .",
    "env X=1 ast-grep run -p foo --rewrite=bar -l js .",
    "command ast-grep run -p foo --rewrite bar -l js .",
    "/opt/homebrew/bin/ast-grep run -p foo --rewrite=bar -l js .",
    "ast-grep -r foo -p bar -l js .",
    "ast-grep -r=foo -p bar -l js .",
    "ast-grep -rfoo -p bar -l js .",
    "ast-grep run -p foo -r bar -l js .",
    "ast-grep run -p foo -r=bar -l js .",
    "ast-grep run -p foo -rbar -l js .",
    "env X=1 ast-grep run -p foo -r=bar -l js .",
    "command ast-grep run -p foo -rbar -l js .",
    "/opt/homebrew/bin/ast-grep run -p foo -rbar -l js .",
    "ast-grep --interactive -p foo -l js .",
    "ast-grep run --interactive -p foo -l js .",
    "ast-grep -i -p foo -l js .",
    "ast-grep -i=true -p foo -l js .",
    "ast-grep run -i -p foo -l js .",
    "ast-grep run -iU -p foo -l js .",
    "ast-grep run -Ui -p foo -l js .",
    "env X=1 ast-grep run -i=true -p foo -l js .",
    "ast-grep --update-all -p foo -l js .",
    "ast-grep --update-all=true -p foo -l js .",
    "ast-grep run --update-all -p foo -l js .",
    "ast-grep run --update-all=true -p foo -l js .",
    "env X=1 ast-grep run --update-all=true -p foo -l js .",
    "command ast-grep run --update-all -p foo -l js .",
    "/opt/homebrew/bin/ast-grep run --update-all=true -p foo -l js .",
    "ast-grep -U -p foo -l js .",
    "ast-grep -U=true -p foo -l js .",
    "ast-grep run -U -p foo -l js .",
    "ast-grep run -U=true -p foo -l js .",
    "env X=1 ast-grep run -U=true -p foo -l js .",
    "command ast-grep run -U -p foo -l js .",
    "/opt/homebrew/bin/ast-grep run -U=true -p foo -l js .",
]

for agent in ("maker", "build"):
    for command in ast_grep_commands:
        assert_permission(agent, command, "ask")
    assert_permission(agent, "sg", "ask")
    assert_permission(agent, "sg run -p foo -l js .", "ask")

for agent in ("review", "security"):
    for command in ast_grep_commands:
        assert_permission(agent, command, "deny")

assert_permission("security", "curl https://example.com", "deny")

print("ok  OpenCode ast-grep permissions")
PY
