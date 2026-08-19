#!/usr/bin/env bash
set -e

ruby <<'RUBY'
require "yaml"

AGENTS = {
  "maker" => "opencode/.config/opencode/agents/maker.md",
  "build" => "opencode/.config/opencode/agents/build.md",
  "review" => "opencode/.config/opencode/agents/review.md",
  "security" => "opencode/.config/opencode/agents/security.md",
}.freeze

def frontmatter(path)
  content = File.read(path)
  YAML.safe_load(content.split(/^---\s*$/)[1])
end

def bash_permission(agent, command)
  rules = frontmatter(AGENTS.fetch(agent)).fetch("permission").fetch("bash")
  return rules if rules.is_a?(String)

  match = nil
  rules.each do |pattern, effect|
    match = effect if File.fnmatch?(pattern, command)
  end
  match || "ask"
end

def assert_permission(agent, command, expected)
  actual = bash_permission(agent, command)
  return if actual == expected

  abort "#{agent}: expected #{expected.inspect} for #{command.inspect}, got #{actual.inspect}"
end

safe_search = [
  "ast-grep --help",
  "ast-grep --version",
  "ast-grep run -p 'console.log($$$ARGS)' -l ts src",
  "ast-grep scan rules",
  "ast-grep outline src/parser.ts",
]

rewrite_or_interactive = [
  "ast-grep --rewrite foo -p bar -l js .",
  "ast-grep --rewrite=foo -p bar -l js .",
  "ast-grep run -p foo --rewrite bar -l js .",
  "ast-grep run -p foo --rewrite=bar -l js .",
  "ast-grep -r foo -p bar -l js .",
  "ast-grep -r=foo -p bar -l js .",
  "ast-grep -rfoo -p bar -l js .",
  "ast-grep run -p foo -r bar -l js .",
  "ast-grep run -p foo -r=bar -l js .",
  "ast-grep run -p foo -rbar -l js .",
  "ast-grep --interactive -p foo -l js .",
  "ast-grep run --interactive -p foo -l js .",
  "ast-grep -i -p foo -l js .",
  "ast-grep -i=true -p foo -l js .",
  "ast-grep run -i -p foo -l js .",
]

mass_update = [
  "ast-grep --update-all -p foo -l js .",
  "ast-grep --update-all=true -p foo -l js .",
  "ast-grep run --update-all -p foo -l js .",
  "ast-grep run --update-all=true -p foo -l js .",
  "ast-grep -U -p foo -l js .",
  "ast-grep -U=true -p foo -l js .",
  "ast-grep run -U -p foo -l js .",
  "ast-grep run -U=true -p foo -l js .",
]

%w[maker build].each do |agent|
  safe_search.each { |command| assert_permission(agent, command, "allow") }
  rewrite_or_interactive.each { |command| assert_permission(agent, command, "ask") }
  mass_update.each { |command| assert_permission(agent, command, "deny") }
end

%w[review security].each do |agent|
  (safe_search + rewrite_or_interactive + mass_update).each do |command|
    assert_permission(agent, command, "deny")
  end
  assert_permission(agent, "ast-grep run -p foo -l js . > out.txt", "deny")
  assert_permission(agent, "ast-grep run -p foo -l js . && touch out.txt", "deny")
end

assert_permission("security", "git diff --cached", "allow")
assert_permission("security", "npm audit --production", "allow")
assert_permission("security", "curl https://example.com", "deny")

puts "ok  OpenCode ast-grep permissions"
RUBY
