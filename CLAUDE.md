# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hearth is a Home Assistant dashboard (SvelteKit 2 + Svelte 5, TypeScript, `adapter-node`) for wall tablets, phones and desktops. It is a rework of ha-fusion. Package manager is pnpm (Node >= 22). The CI branch is `master`.

## Commands

```sh
pnpm dev                 # vite dev server; needs HASS_URL in .env (see .env.example)
pnpm check               # svelte-kit sync + svelte-check (type check)
pnpm lint                # prettier --check + eslint (warning cap: --max-warnings 59)
pnpm format              # prettier --write
pnpm check:boundaries    # import layer rules (scripts/check-boundaries.mjs)
pnpm check:style         # --h-* token guard for CSS (scripts/check-style-tokens.mjs)
pnpm check:hearth-a11y   # fails on any Svelte a11y compiler warning
pnpm test                # vitest with coverage thresholds
pnpm build               # production build into build/
pnpm check:bundle        # gzipped eager-JS/CSS budget per route; run after build
pnpm test:e2e            # Playwright against the production build; run `pnpm build` first
pnpm matrix              # screenshot matrix -> matrix-output/index.html
pnpm readme:image        # rebuilds docs/images/devices.png from the matrix fixture
```

Single unit test: `pnpm exec vitest run src/lib/Hearth/store.test.ts` (add `-t "name"` to filter). Unit tests are `src/**/*.test.ts` (components use `*.svelte.test.ts`) in jsdom. Coverage thresholds in `vitest.config.ts` are a floor: raise, never lower.

Single e2e spec: `pnpm exec playwright test e2e/edit-mode.spec.ts`. E2E runs `node server.js` from `e2e/fixture/` (its own `data/`) against a scripted fake Home Assistant (`e2e/fake-hass.mjs`). The matrix uses `e2e/fixture-matrix/` and `playwright.matrix.config.ts`.

CI (`.github/workflows/ci.yml`) runs, in order: check, check:boundaries, check:style, check:hearth-a11y, test, lint, build, check:bundle, test:e2e.

Docker: `docker compose --env-file .env.docker up -d --build` (port 5050, data at `/app/data`); `just up` uses the dev compose file.

## Runtime shape

- `server.js` (production) is Express: proxies `/api/` and `/local/` to `HASS_URL`, then serves the SvelteKit handler. `vite.config.ts` has the same proxy for dev. `HASS_PUBLIC_URL` is the browser-facing HA URL when `HASS_URL` is internal.
- The browser talks to Home Assistant directly over websocket (`home-assistant-js-websocket`); the Hearth server only loads/saves YAML under `data/`.
- `src/routes/+page.server.ts` loads `data/configuration.yaml`, `data/hearth.yaml` and translations, validating with `hearthConfigIssues`. Save/aux endpoints live under `src/routes/_api/*/+server.ts`.
- All writes go through `src/lib/server/persistence.ts`: per-file lock, atomic replace, backup to `data/backups/<file>/` (keeps 10), and a server-managed `revision` the client must echo back; mismatches are conflicts the editor resolves explicitly.
- Persisted documents declare `version: 5` (`CONFIG_VERSION` in `src/lib/Hearth/format.ts`). Other versions are rejected, not migrated, and a failed load locks editing.

## Architecture and enforced layers

`scripts/check-boundaries.mjs` enforces which layers may import which (static, dynamic, re-exports, `vi.mock`, CSS `@import`):

| Layer  | Paths                                                                                                                                              | May import       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| core   | `src/lib/core/` (HA connection/commands/history, domain helpers, i18n, theme, app config)                                                          | nothing          |
| ui     | `src/lib/ui/` (generic actions, layers/overlay stack, code editor)                                                                                 | core             |
| server | `src/lib/server/`                                                                                                                                  | core             |
| model  | `src/lib/Hearth/model/`, plus `config.ts`, `types.ts`, `schema.ts`, `normalize.ts`, `normalizers.ts`, `format.ts`, `clock.ts` in `src/lib/Hearth/` | core             |
| hearth | rest of `src/lib/Hearth/`                                                                                                                          | model, core, ui  |
| routes | `src/routes/`                                                                                                                                      | all of the above |

The model layer is pure: no renderers, stores, browser APIs or server code. The save endpoint and the YAML editor both call `hearthConfigIssues`, so persistence never accepts data the editor rejects.

### Cards and rail widgets (two-registry pattern)

Each card/widget type has:

1. A discriminated type in `src/lib/Hearth/types.ts` (shared field schemas in `schema.ts`).
2. A pure definition in `model/cards/<type>.ts` or `model/widgets/<type>.ts` supplying `normalize`, a Valibot `schema`, translation keys, icon, `entityIds` (cards also `needsConfiguration`), registered in `model/registry.ts`.
3. A render folder `cards/<type>/` or `widgets/<type>/` with the component (`Card.svelte`/`Widget.svelte`), `Editor.svelte` (lazy-loaded) and `descriptor.ts`, registered in `cards/index.ts` / `widgets/index.ts`.

Both registries have compile-time exhaustiveness checks against the union in `types.ts`, so a missing registration fails `pnpm check`. New types also need an example in the matrix fixture and editor coverage in browser tests. `details/` holds per-domain detail sheets for entities without specialized tiles.

### State and interaction

- `src/lib/Hearth/store.ts` owns dashboard drafts, undo/redo, navigation and overlays. Don't add a second state system.
- HA state comes from `core/ha`; device calls go through `core/ha/commands` or a domain wrapper in `core/domains`. Edit mode closes the command gate.
- Sheets/popups use the shared focus/escape layer manager (`src/lib/ui/layers.ts`, which has its own strict coverage threshold).
- Components must release subscriptions, timers and media resources on teardown.
- `Card`, `Widget`, `Tile`, `Popup` and `Popover` are distinct presentation roles. Editors sit next to their type's renderer; shared editor controls live in `edit/`.

## Conventions enforced by tooling

- **Copy:** all user-facing text uses `$lang()` (with `fill()` for placeholders). The custom ESLint rule `eslint/no-bare-text.js` flags bare copy; a genuine exception needs a same-line `// copy ok: <reason>`. Keys live in `static/translations/en.json`; a test fails if source references a key missing from `en.json`, and dead keys are pruned.
- **Styling:** use `--h-*` tokens (defined in `core/theme`). `check:style` rejects literal colors, font sizes, radii, z-index, durations and elevation shadows, and spacing off the even-pixel scale (0–24 by 2, then 28, 32, 40). Exempt a single declaration with `/* literal ok: <reason> */`.
- **Accessibility:** every control needs keyboard support; any Svelte a11y warning fails CI.
- **Bundle:** heavy optional code (editors, embeds, modals) must stay behind dynamic `import()` to fit the eager budget in `scripts/check-bundle-budget.mjs`. Raise the budget deliberately, never just to get CI green.

## Commits, changelog and releases

- Conventional-style commits with the `hearth` scope, e.g. `fix(hearth): ...`, `test(hearth): ...`, `chore(hearth): release 0.3.0`.
- `CHANGELOG.md` follows Common Changelog (see `docs/release.md`): an entry per release and no Unreleased section. Groups in order Changed/Added/Removed/Fixed, imperative items with commit or PR links, `**Breaking:**` first (includes config/format changes during 0.x). User-invisible changes are left out.
- Versions have no `v` prefix. Releases need explicit confirmation before pushing or publishing (`docs/release.md`).

Upstream's own reference lives in `docs/` (`architecture.md` for layers, ownership and known limits, `development.md` for setup and checks, `configuration.md`, `alerts.md`). Every file under `src/` must belong to a layer in `scripts/check-boundaries.mjs`, so a new top-level directory needs an entry there. The dashboard renders only in the browser (`ssr = false` in `src/routes/+layout.ts`); `src/hooks.server.ts` belongs to the routes layer.

## This repository is a fork

`rubenj06/ha-hearth-rubenj06-fork` is a personal fork of `knowald/ha-hearth` (upstream), which is actively maintained. Every change must keep upstream merges cheap: the fork should always be able to take a new upstream release with few or no conflicts. Some sections above describe upstream's own process (its changelog, release tags, `hearth` commit scope); in this fork they apply only where they do not conflict with the rules below.

### Keeping upstream mergeable

- **Add, don't rewrite.** Put fork features in new files and folders (a new card or widget type in its own `cards/<type>/` and `model/cards/<type>.ts`, a new domain module, a new theme). Touch upstream files only where there is no other way, such as the one-line registrations in `types.ts`, `model/registry.ts`, `cards/index.ts` and `widgets/index.ts`, and keep those edits as small as possible.
- **Try settings before code.** Purely visual changes often fit in custom CSS (application settings, `--h-*` tokens) or opt-in custom JavaScript, which need no code change at all.
- **Mark fork edits in upstream files** with a `fork:` comment on or above the changed lines (`// fork: ...`, `<!-- fork: ... -->`, `/* fork: ... */`) so they are easy to find when resolving conflicts.
- **Never reformat, rename, move or clean up upstream code** as a side effect. Unrelated diffs in upstream files turn into conflicts later.
- **Leave upstream's own files alone:** `CHANGELOG.md`, `README.md`, `package.json` `version`, `docs/`, `.github/workflows/`, `Dockerfile`. Fork changes are recorded in `addon/CHANGELOG.md` instead.
- **Keep the upstream checks green.** The tooling above (boundaries, style tokens, a11y, `$lang()` copy, translations in `static/translations/en.json`, bundle budget) also applies to fork code, so upstream code and fork code stay consistent.

### Merging an upstream update

```sh
git remote add upstream https://github.com/knowald/ha-hearth   # once per clone
git fetch upstream master
git checkout -b merge-upstream-<version> master
git merge upstream/master          # merge, never rebase: master is shared with the add-on build
```

Resolve conflicts by keeping upstream's version and re-applying the `fork:` edit on top. Then run `pnpm install`, `pnpm check`, `pnpm check:boundaries`, `pnpm check:style`, `pnpm check:hearth-a11y`, `pnpm test`, `pnpm lint` and `pnpm build` before merging into `master`. Afterwards bump the add-on version to the new upstream version with `.1` (for example `0.4.0.1`) and note the upstream release in `addon/CHANGELOG.md`.

### Home Assistant add-on

`repository.yaml` and `addon/` make this repository a Home Assistant add-on repository (installed on a Proxmox mini-PC, amd64). The Supervisor builds `addon/Dockerfile` on the host with `addon/` as build context, cloning `master` of `rubenj06/ha-hearth-rubenj06-fork`; there is no prebuilt image. So `master` is what gets deployed and must always build. Work happens on branches and reaches `master` only after the checks pass.

Home Assistant only offers an update when `version` in `addon/config.yaml` goes up. The format is `<upstream version>.<fork release>`, for example `0.3.0.2`. Bump it and add an entry to `addon/CHANGELOG.md` whenever a change on `master` should reach Home Assistant.
