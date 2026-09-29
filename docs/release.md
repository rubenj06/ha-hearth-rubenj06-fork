# Releasing Hearth

Hearth uses semantic versions without a `v` prefix. `package.json` and the release tag always match. During `0.x`, a minor release may break configuration or behavior. The document format version in `hearth.yaml` is separate from the package version.

1. Run every command in [development](development.md#checks). Review `matrix-output/index.html` and test the changed features on a real tablet and phone against a real Home Assistant.
2. Bump the version in `package.json` and add a matching entry to `CHANGELOG.md` listing the user-facing changes.
3. Commit the version bump, for example `chore(hearth): release X.Y.Z`.
4. Push the commit and create a GitHub release with the tag `X.Y.Z` and the changelog entry as notes.

## Channels

| Channel | Source            | Image tags             | Add-on                                     |
| ------- | ----------------- | ---------------------- | ------------------------------------------ |
| stable  | GitHub release    | `X.Y.Z`, `latest`      | Hearth                                     |
| beta    | GitHub prerelease | `X.Y.Z-beta.N`, `beta` | Hearth (beta)                              |
| edge    | `master`          | `edge` (every push)    | Hearth (edge), nightly, `X.Y.Z-edge.<sha>` |

A beta is a release candidate for the next version. Tag it `X.Y.Z-beta.N`, starting at `1`, set the same version in `package.json`, and publish the GitHub release with "Set as a pre-release" checked. Prereleases get no `CHANGELOG.md` entry; put their notes in the GitHub release body. The stable `X.Y.Z` entry lists every change since the previous stable release. A beta never moves `latest`.

Edge needs no release steps. Every push to `master` updates the `edge` image. The edge add-on checks `master` nightly and builds the latest commit if its CI run passed.

## Changelog

`CHANGELOG.md` follows [Common Changelog](https://common-changelog.org/). Each stable release gets an entry, written at release time. There is no Unreleased section, and betas get no entry.

- Heading: `## [VERSION] - YYYY-MM-DD`, newest first, with a reference link at the bottom of the file: `[VERSION]: https://github.com/knowald/ha-hearth/releases/tag/VERSION`.
- Groups, as third-level headings in this order and only when they have entries: `Changed`, `Added`, `Removed`, `Fixed`.
- Each change is one list item in the imperative ("Fix", "Add", "Show"), readable without its heading, followed by its commit or pull request references: ``([`53bd922`](https://github.com/knowald/ha-hearth/commit/53bd922))`` or `([#16](https://github.com/knowald/ha-hearth/pull/16))`.
- Prefix breaking changes with `**Breaking:**` and list them first in their group. During `0.x` this includes configuration and document format changes.
- Leave out changes users do not see: dotfiles, CI, dev dependencies, test-only and formatting-only changes.

## Docker image

`.github/workflows/docker-publish.yml` builds `linux/amd64` and `linux/arm64` images and pushes them to `ghcr.io/knowald/ha-hearth` with the tags listed under [Channels](#channels). A manual run from a branch tags the image with the branch name.

## Add-on

The add-on in `knowald/addon-ha-hearth` builds Hearth from the source tag, not from this image. Its publish workflow checks that the release tag equals the version in the config file and that the pre-release flag matches the tag.

1. Publish the Hearth release first.
2. In the add-on repository, set `version` in `config.yaml` (stable) or `beta/config.yaml` (beta) to the same version and add a changelog entry.
3. Publish an add-on release with the same tag. Mark it as a pre-release for a beta.
4. After a stable release, also set `beta/config.yaml` to the stable version so beta users move onto it.
5. Check that the amd64 and aarch64 add-on images published.

## After publishing

Start the new image with an empty data directory and with an existing `hearth.yaml`. Keep the previous image tag and a backup of the data directory until the release works.
