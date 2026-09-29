# Development

## Setup

Requires Node.js 22 or newer and pnpm 10 or newer.

```sh
git clone https://github.com/knowald/ha-hearth.git
cd ha-hearth
pnpm install --frozen-lockfile
cp .env.example .env
# Set HASS_URL in .env
pnpm dev
```

Open the address Vite prints and sign in through Home Assistant. In the Home Assistant companion app, Hearth asks for a long-lived access token instead. Create one in your Home Assistant profile under Security.

To develop in Docker, copy `.env.docker.example` to `.env.docker`, set `HASS_URL`, and run `just up` (requires [just](https://github.com/casey/just)). This starts `docker-compose.dev.yml` on port 5173 (`DEV_PORT`).

## Checks

| Command                  | What it checks                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`             | Svelte and TypeScript types.                                                                                                           |
| `pnpm lint`              | Prettier formatting and ESLint.                                                                                                        |
| `pnpm check:boundaries`  | Import direction between layers, see [architecture](architecture.md).                                                                  |
| `pnpm check:style`       | Colors, sizes, radii, z-index and durations use `--h-*` tokens. Mark a deliberate literal with `/* literal ok: reason */`.             |
| `pnpm check:hearth-a11y` | Svelte accessibility warnings in all components.                                                                                       |
| `pnpm test`              | Unit and component tests with coverage.                                                                                                |
| `pnpm build`             | Production build.                                                                                                                      |
| `pnpm check:bundle`      | Bundle size budget.                                                                                                                    |
| `pnpm test:e2e`          | Browser tests with Playwright.                                                                                                         |
| `pnpm matrix`            | Screenshots of each scene at phone, portrait and tablet sizes in day and night themes. Open `matrix-output/index.html` to review them. |
| `pnpm readme:image`      | Rebuilds the README device image, `docs/images/devices.png`, from the matrix fixture.                                                  |

`pnpm test:e2e`, `pnpm matrix`, `pnpm readme:image` and `pnpm check:bundle` use the production build. Run `pnpm build` first.

Browser tests and the matrix run against a fake Home Assistant with fixture data. Test cameras and device behavior against a real Home Assistant before a release.

## Conventions

- [Component conventions](../src/lib/Hearth/README.md) cover adding cards and widgets, state and styling.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), for example `fix: ...` or `fix(hearth): ...`.
- The [changelog](../CHANGELOG.md) follows [Common Changelog](https://common-changelog.org/).
- See [releasing](release.md) for versions and channels.

By contributing, you agree to license your work under the [MIT license](../LICENSE).
