# Configuration

Most configuration happens in the editor. This page covers the files behind it, the server environment, URL options and a few browser-specific notes.

## Data directory

Hearth stores everything in one data directory. The Node server uses `./data` under the directory it starts from. The container uses `/app/data`, which Docker Compose mounts from `DATA_PATH` (default `./data`). The Home Assistant app uses its own volume.

| Path                   | Contents                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `hearth.yaml`          | Pages, cards, sidebar widgets, themes, sleep screen and layout settings, and alert rules.                                   |
| `configuration.yaml`   | Application settings: language, reduce motion, touch feedback, long-lived access token and the custom JavaScript switch.    |
| `custom_css.css`       | Custom CSS, edited under Settings > Application settings > Custom CSS.                                                      |
| `custom_javascript.js` | Custom JavaScript. Edit the file directly; it runs on every page load when Custom JavaScript is on in Application settings. |
| `hearth-themes/`       | Saved theme presets.                                                                                                        |
| `hearth-images/`       | Images uploaded for header cards, theme backgrounds and the sleep screen.                                                   |
| `backups/`             | Earlier versions of `hearth.yaml` and `configuration.yaml`, the ten most recent of each.                                    |

Keep this directory private. `configuration.yaml` may hold a Home Assistant access token.

### Document version

`hearth.yaml` must declare `version: 5`. A file with another version is not converted: Hearth shows a load error and locks editing so the file is not overwritten. Update Hearth, or restore a matching copy from `backups/`, then reload.

### Saving

Every save carries the revision the browser loaded. If another browser saved in the meantime, the edit bar reports the conflict and offers to copy your edits, overwrite the newer version or reload. The previous content goes to `backups/` before the file is replaced.

To go back, open Settings > Versions, compare an earlier version with the open dashboard and restore it as an edit you can still undo.

### Images

Hearth scales uploaded images to at most 2560 px on the long edge and re-encodes them in the browser, which also removes photo location data. GIFs are stored unchanged. Files go to `hearth-images/` and are referenced as `hearth-images/<file>`. The server accepts PNG, JPEG, GIF, WebP and AVIF up to 15 MB.

## Environment variables

| Variable          | Default | Purpose                                                                                         |
| ----------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `HASS_URL`        | none    | Home Assistant URL the server proxies to. Required.                                             |
| `HASS_PUBLIC_URL` | unset   | Home Assistant URL the browser uses for sign-in and the WebSocket, when `HASS_URL` is internal. |
| `PORT`            | `5050`  | Port the Node server listens on.                                                                |
| `BODY_SIZE_LIMIT` | `16M`   | Maximum request size, which bounds image uploads.                                               |

The browser connects to Home Assistant directly. Which URL it uses depends on how Hearth is reached:

- Through Ingress: the Home Assistant address the browser is already on.
- Directly: `HASS_PUBLIC_URL` when set, otherwise `HASS_URL`.

When Hearth is served over HTTPS, `HASS_PUBLIC_URL` must be HTTPS too. Browsers block plain HTTP connections from an HTTPS page.

Docker Compose passes `HASS_URL`, `HASS_PUBLIC_URL` and `TZ` from `.env.docker` to the container. `EXPOSED_PORT` sets the host port and `DATA_PATH` the data folder. See `.env.docker.example`.

The Home Assistant app sets `HASS_URL` itself. For direct-port access, set its Home Assistant URL for direct access option (`hass_public_url`) instead of `HASS_PUBLIC_URL`.

## URL options

| Option            | Effect                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `?room=<id>`      | Open the page with this id. Hearth keeps the current page in the address, so copy it from there.                                          |
| `?theme=<preset>` | Show a built-in theme without saving it: `hearth`, `paper`, `slate`, `void`, `glass`, `forest`, `plum` or `muted`. Ignored while editing. |
| `?menu=false`     | Hide the Edit Hearth configuration button, for wall tablets.                                                                              |
| `?device=<name>`  | Name this screen, so [alerts](alerts.md#home-assistant-events) can target it.                                                             |

These change presentation only. They are not access controls.

## Sleep screen

Settings > Sleep screen turns it on after a set number of minutes and sets its background. The weather radar background loads radar images from RainViewer and map tiles from OpenStreetMap in the browser, so the screen needs internet access for it. Set Map tiles to use another tile server.

## Custom CSS and JavaScript

Edit custom CSS under Settings > Application settings > Custom CSS. Style against the `--h-*` tokens, not internal class names, which can change between releases.

For custom JavaScript, edit `custom_javascript.js` in the data directory and turn on Custom JavaScript in Application settings. It runs on every page load.

## Touch feedback

Touch feedback is off by default. When on, the device vibrates on presses, long presses, slider steps, saves and failed commands.

It needs the Vibration API and a secure origin:

- Chrome on Android works over HTTPS or `localhost`. Over plain HTTP, the setting reports no vibration support.
- Firefox for Android does not provide the API.
- iOS Safari has no Vibration API. On iOS 18 and newer, Hearth toggles a hidden switch control, which makes Safari play its haptic tick. Safari only honors it during the tap itself, so feedback that arrives later, such as a failed command, may stay silent.
