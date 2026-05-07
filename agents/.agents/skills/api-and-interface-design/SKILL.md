---
name: api-and-interface-design
description: Designs stable interfaces. Use when defining APIs, CLIs, module boundaries, config schemas, file formats, component props, commands, or any contract other code or users depend on.
---

# API and Interface Design

## Overview

An interface is any boundary that others depend on: HTTP endpoints, function signatures, CLI flags, config files, events, data formats, component props or shell commands. Design the contract before implementation.

## When to Use

- Creating or changing public functions, modules or packages.
- Designing CLI commands, flags or exit codes.
- Defining config formats, JSON/TOML/YAML schemas or file layouts.
- Designing REST, GraphQL, RPC or webhook contracts.
- Changing behaviour that users, scripts or other modules observe.

## Principles

- Contract first: define inputs, outputs, errors and examples before code.
- Compatibility first: prefer additive changes over breaking changes.
- Predictability: similar operations should have similar names and error semantics.
- Boundary validation: validate untrusted input at the edge.
- Small surface area: expose only what you intend to support.

## Process

### 1. Identify consumers

Name who or what depends on the interface: humans, shell scripts, tests, packages, services, UI components or future agents.

### 2. Define the contract

Specify:

- inputs and defaults;
- output shape or side effects;
- error cases and exit codes;
- ordering, idempotency and retries if relevant;
- compatibility guarantees;
- examples of valid and invalid use.

### 3. Check for observable behaviour

If users can observe it, they may depend on it: field names, sorting, error messages, files created, timing, stdout/stderr, status codes and defaults.

### 4. Plan evolution

Prefer:

- optional fields over changed field types;
- new flags over changed defaults;
- deprecation windows over silent removal;
- structured errors over ad hoc strings.

### 5. Verify against usage

Before implementing, compare the contract with existing conventions and examples. If changing an existing interface, list migration impact.

## Red Flags

- Implementation starts before inputs, outputs and errors are defined.
- Different commands or endpoints report errors in incompatible formats.
- A default changes silently.
- A file format changes without migration notes.
- External input crosses the boundary without validation.

## Verification

- [ ] Consumers are identified.
- [ ] Inputs, outputs, errors and examples are defined.
- [ ] Compatibility impact is explicit.
- [ ] Validation happens at the boundary.
- [ ] Documentation or types are updated with the implementation.
