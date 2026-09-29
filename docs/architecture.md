# Architecture

Hearth is a standalone SvelteKit application. This page describes how the source is split into layers, which module owns which state, and the known limits. See [development](development.md) for setup and checks, and the [component conventions](../src/lib/Hearth/README.md) for adding cards and widgets.

## Layers

| Layer     | Path                                               | Responsibility                                           | May import                                |
| --------- | -------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| Routes    | `src/routes/`, `src/hooks.server.ts`               | Loading, HTTP endpoints and page composition             | Hearth UI, model, shared UI, core, server |
| Hearth UI | `src/lib/Hearth/` (except model files)             | Dashboard, editing, navigation, device presentation      | Model, shared UI, core                    |
| Model     | `src/lib/Hearth/model/` and the files listed below | Types, schemas, defaults, normalization and definitions  | Core                                      |
| Shared UI | `src/lib/ui/`                                      | Reusable controls, gestures, focus and layer management  | Core                                      |
| Core      | `src/lib/core/`                                    | HA connection, commands, domains, theme and localization | Nothing                                   |
| Server    | `src/lib/server/`                                  | Document and image storage                               | Core                                      |

The model layer also includes these files in `src/lib/Hearth/`: `config.ts`, `types.ts`, `schema.ts`, `normalizers.ts`, `normalize.ts`, `format.ts` and `clock.ts`.

`pnpm check:boundaries` (`scripts/check-boundaries.mjs`) enforces this table for static and dynamic imports, re-exports, `vi.mock` paths and CSS `@import`. Each file under `src/` must belong to a layer, so a new directory needs an entry in the script.

## Ownership

- `core/ha/connection.ts` owns authentication and subscriptions. Device calls go through `core/ha/commands.ts`, which reports failures, applies optimistic state and refuses calls while edit mode is on.
- `Hearth/store.ts` owns drafts, undo and redo, navigation and popups. `ui/layers.ts` owns focus trapping and Escape handling.
- The dashboard renders only in the browser (`ssr = false` in `src/routes/+layout.ts`). Server loads return validated data and never touch UI stores.
- Each card and widget type has one definition in `model/cards/` or `model/widgets/` with its schema and normalization. The pure registry and the rendering registries fail type checking when a type is missing.
- Initial load, the save endpoint and the YAML editor all validate with `hearthConfigIssues`. Hearth rejects unsupported document versions. Normalization only fills gaps in current documents and drafts.
- `server/persistence.ts` saves each document one write at a time. It checks the revision, backs up the previous file and replaces it atomically.
- `core/ha/camera.ts` runs one playback session per camera. It tries WebRTC first, falls back to HLS and can be cancelled.

## Limits

- Persistence locking is process-local. Run one server per data directory. Running several processes against one directory needs storage with transactional writes or a cross-process lock.
- The configuration API has no authorization. See [Security](../README.md#security).
- Some registry and normalization code in `src/lib/Hearth/` still uses `any`. ESLint warns there and caps warnings with `--max-warnings` in `package.json`; lower the cap when you remove one. Core and shared UI treat `any` as an error.
- Automated tests cover camera cancellation and cleanup. Real HLS and WebRTC cameras, browser permissions and tablet sleep and reconnect need testing on a real device.
- New features such as calendar or todo editing need their own typed model and must send device calls through `core/ha/commands.ts`.

Open an issue before adding a plugin system, a second configuration format or a compatibility layer.
