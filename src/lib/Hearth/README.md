# Hearth application

This directory owns dashboard layout, navigation, editing and device presentation. Its data model is independent of Svelte rendering. See [architecture](../../../docs/architecture.md) for the enforced boundaries and current limitations.

## Adding a card or widget

1. Add the type to the `OverviewCard` or `RailWidget` union in `types.ts`. Put field schemas that several types share in `schema.ts`.
2. Add its pure definition under `model/cards/` or `model/widgets/`. Every definition supplies `label`, `name` and `sub` translation keys, an `icon`, `normalize`, a Valibot `schema` and `entityIds`. Cards also require `needsConfiguration`.
3. Register the definition in `model/registry.ts`. `pnpm check` fails if a type in `types.ts` has no definition, or a definition has no type.
4. Add a renderer, descriptor and optional editor under `cards/<type>/` or `widgets/<type>/`. The descriptor combines the definition with its Svelte component and lazy editor loader. Register it in the corresponding rendering registry.
5. Add a configured example to `e2e/fixture-matrix`, add unit tests for its normalization and component, and add a browser test that opens its editor.

Definitions, schemas and normalization must not import renderers, stores, browser APIs or server code. Page load, the save endpoint and the YAML editor all validate with `hearthConfigIssues`, so the server never stores a document the editor rejects.

## State and interaction

`store.ts` owns dashboard drafts, undo/redo, navigation and overlays. Home Assistant state comes from `core/ha`; device calls use `core/ha/commands` or a domain wrapper. Device commands are refused while edit mode is on. Components must release subscriptions, timers and media resources on teardown.

Use `$lang()` for interface copy and `fill()` for placeholders. Styling uses `--h-*` tokens. Sheets and popups use the `layer` action from `$lib/ui/layers`, which traps focus and closes on Escape. Every control must work with the keyboard. `pnpm check:style` and `pnpm check:hearth-a11y` must pass.

A `Card` sits on a page and a `Widget` in the sidebar (called the rail in code, hence `RailWidget`). A `Tile` shows one entity inside a card, a `Popup` is a full sheet and a `Popover` is anchored to its trigger. Editors sit next to their type's renderer; shared editor controls live in `edit/`. Add a new component or a module under `core/domains/` rather than a generic configurable container. Keep dashboard state in `store.ts`.
