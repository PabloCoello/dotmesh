# CONTEXT.md format

## Structure

```md
# {Context name}

{One or two sentences on what this context is and why it exists.}

## Language

**Order**:
A customer's confirmed request for goods or services.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account
```

## Rules

- **Be opinionated.** When several words exist for the same concept, pick the best one and list the rest under `_Avoid_`.
- **Keep definitions tight.** One or two sentences. Define what it *is*, not what it does.
- **Only project-specific terms.** General programming concepts (timeouts, error types, utility patterns) don't belong, even if the project uses them heavily. Before adding a term, ask: is this unique to this context, or a general concept? Only the former belongs.
- **Group under subheadings** when natural clusters emerge; a flat list is fine if all terms belong to one cohesive area.

## Single vs multiple contexts

**Single context (most repos):** one `CONTEXT.md` at the repo root.

**Multiple contexts:** a `CONTEXT-MAP.md` at the root lists the contexts, where each lives, and how they relate:

```md
# Context map

## Contexts

- [Ordering](./src/ordering/CONTEXT.md) — receives and tracks customer orders
- [Billing](./src/billing/CONTEXT.md) — generates invoices and processes payments

## Relationships

- **Ordering → Billing**: Ordering emits `OrderPlaced`; Billing consumes it to generate invoices
- **Ordering ↔ Billing**: shared types for `CustomerId` and `Money`
```

If `CONTEXT-MAP.md` exists, read it to find the contexts. If only a root `CONTEXT.md` exists, it's a single context. If neither exists, create a root `CONTEXT.md` lazily when the first term is resolved.

---
Adapted from `domain-modeling/CONTEXT-FORMAT.md` in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
