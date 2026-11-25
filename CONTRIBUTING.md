# Contributing to drop

Thanks for helping this grow. Small, focused pull requests are the easiest to review.

## Getting started

```sh
npm install
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply drop-db --local
npm run dev
```

The Node.js version (`src/node/`) runs the same Worker with local stand-ins for the bindings. Try it with `cp .env.example .env` and `npm run dev:node`. If you use a new binding method in the Worker, add it to `src/node/bindings.ts` too, with a test in `test/node.test.ts`.

## Before you open a PR

- `npm run check` passes (typecheck, tests, Worker and Node builds).
- New behaviour has a test in `test/` where that's practical. Pure helpers live in `src/util.ts`.
- Schema changes go in a new file in `migrations/` (`0002_….sql`). Never edit an applied migration.
- No account IDs, tokens or personal domains in code or config. Use placeholders.
- Keep the UI within the brand rules in the README "Design" section, or open an issue first.

## Commit messages

Use short, imperative subjects ("Add paste expiry header"), with a body when the *why* isn't obvious.

## Reporting bugs and ideas

Use the issue templates. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

By contributing, you agree that your contributions are licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later).
