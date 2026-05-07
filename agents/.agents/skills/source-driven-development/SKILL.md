---
name: source-driven-development
description: Grounds implementation in current sources. Use when code, config, commands, APIs, SDKs, frameworks, CLIs, or best practices depend on versioned or external documentation.
---

# Source-Driven Development

## Overview

Do not rely on memory for version-sensitive behaviour. Check primary sources, identify the version in use, implement the documented pattern and cite the source when the decision matters.

## When to Use

- Working with frameworks, SDKs, CLIs, APIs or config formats.
- Adding boilerplate that will be reused.
- Updating dependencies, commands or tool settings.
- The user asks for current, official or documented behaviour.
- Existing code and documentation appear to disagree.

## When Not to Use

- Pure local logic that does not depend on a specific external API.
- Typos, renames or formatting-only changes.
- Tasks where the user explicitly prioritises speed and accepts unverified assumptions.

## Source hierarchy

Prefer sources in this order:

1. Official docs for the detected version.
2. Official changelog, migration guide or release notes.
3. Standards documents or runtime docs, such as MDN for web platform behaviour.
4. Repository source or tests for the exact tool or library.

Do not treat Stack Overflow, tutorials, blogs or model memory as primary sources.

## Process

### 1. Detect version and surface scope

Read dependency files, lock files, config files or command output to determine the relevant version. If the version is unclear and affects correctness, ask.

### 2. Fetch the smallest useful source

Use the specific docs page or section for the feature, not a broad homepage.

### 3. Implement the documented pattern

Follow current signatures, config keys, deprecations and migration guidance. If docs conflict with existing code, stop and present the trade-off.

### 4. Cite non-obvious decisions

When a choice depends on current docs, include the source URL in the response or documentation. In code comments, cite only when the citation prevents future confusion.

### 5. Mark unverified assumptions

If official documentation cannot be found, say what is unverified and reduce the scope of the claim.

## Red Flags

- Writing framework-specific code without checking the project version.
- Saying "I think" about an API signature.
- Using deprecated examples from memory.
- Citing a blog when official docs exist.
- Ignoring a mismatch between docs and the existing project.

## Verification

- [ ] Relevant versions were identified or ambiguity was surfaced.
- [ ] Primary sources were checked.
- [ ] Deprecated or version-incompatible patterns were avoided.
- [ ] Conflicts between docs and code were raised.
- [ ] Important source-dependent decisions include citations.
