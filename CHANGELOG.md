# Changelog

## [0.5.1] - 2026-09-29

### Fixed

- Stack the media popup's queue under the player on phones, so the title, progress bar and playback buttons get the full width ([#19](https://github.com/knowald/ha-hearth/pull/19))
- Keep a card's column count to at most two on phones, and show one tile per row while editing there ([#19](https://github.com/knowald/ha-hearth/pull/19))
- Stop a vertical drag or a second finger on a light or blind tile from toggling it or opening its popup ([#19](https://github.com/knowald/ha-hearth/pull/19))
- Set the value where you tap on a popup slider, and ignore right and middle clicks on sliders ([#19](https://github.com/knowald/ha-hearth/pull/19))
- Allow pinch zoom to start on light and blind tiles ([#19](https://github.com/knowald/ha-hearth/pull/19))
- Keep edit sheets, the entity picker, toasts, the edit button and the wide layout clear of the notch and the home indicator ([#19](https://github.com/knowald/ha-hearth/pull/19))
- Stop iOS zooming in when a text field in the editor or search gets focus ([#19](https://github.com/knowald/ha-hearth/pull/19))
- Truncate long edit sheet titles instead of pushing the close button off screen ([#19](https://github.com/knowald/ha-hearth/pull/19))
- Keep toasts and the last widget clear of the edit bar when it wraps onto two rows ([#19](https://github.com/knowald/ha-hearth/pull/19))
- Give drag handles, progress bars and volume bars a finger-sized touch area ([#19](https://github.com/knowald/ha-hearth/pull/19))
- Shrink search and edit sheets with the on-screen keyboard on Android ([#19](https://github.com/knowald/ha-hearth/pull/19))

## [0.5.0] - 2026-09-28

### Changed

- Show the notifications widget as one button with a count badge and the newest title, opening a list of alerts and Home Assistant notifications ([`2f6f489`](https://github.com/knowald/ha-hearth/commit/2f6f489))
- Group the screensaver settings in their own Sleep screen section, with a button to preview it ([`2a5d6dd`](https://github.com/knowald/ha-hearth/commit/2a5d6dd))
- Stop showing the https note under touch feedback in App settings ([`bbf9636`](https://github.com/knowald/ha-hearth/commit/bbf9636))

### Added

- Place the sidebar on the left, on the right, on both sides or hide it, and pick a side for each widget when there are two ([`80deda2`](https://github.com/knowald/ha-hearth/commit/80deda2))
- Swipe sideways between pages, on phones and on wider screens where a mouse drag works like a finger, each with its own setting ([`9c54527`](https://github.com/knowald/ha-hearth/commit/9c54527))
- Raise alerts from dashboard rules, such as a fridge door left open for two minutes, and close them again when the condition clears ([`2f6f489`](https://github.com/knowald/ha-hearth/commit/2f6f489))
- Raise, dismiss and target alerts from Home Assistant automations through the `HEARTH` event, and open or close an entity popup the same way ([`2f6f489`](https://github.com/knowald/ha-hearth/commit/2f6f489))
- Name each screen in App settings or with `?device=`, so an automation can send an alert to one screen ([`2f6f489`](https://github.com/knowald/ha-hearth/commit/2f6f489))
- Wake the sleep screen when an alert pops up, and keep it awake while the alert shows ([`2f6f489`](https://github.com/knowald/ha-hearth/commit/2f6f489))
- Show an image or a live weather radar map of the home location, or any other location, behind the sleep screen clock ([`2a5d6dd`](https://github.com/knowald/ha-hearth/commit/2a5d6dd))
- Set the sleep screen clock size, show or hide the date, and show the current weather under the clock ([`2a5d6dd`](https://github.com/knowald/ha-hearth/commit/2a5d6dd))

### Fixed

- Stop the browser's own grey tap highlight, long-press menu and hover state that stayed on after a tap on touch screens, leaving only Hearth's press feedback ([`4ed7ae9`](https://github.com/knowald/ha-hearth/commit/4ed7ae9))

## [0.4.0] - 2026-09-26

### Added

- Embed a web page as a card on any page, such as the Music Assistant interface, filling its column unless a height is set ([`e2b1748`](https://github.com/knowald/ha-hearth/commit/e2b1748))
- Set a background image on header cards and the theme, from a URL or an image uploaded to Hearth, and manage uploaded images from the image field ([`6324403`](https://github.com/knowald/ha-hearth/commit/6324403))

### Fixed

- Play WebRTC-only cameras, such as Ring live view, instead of requesting an HLS stream they reject; Hearth now asks Home Assistant which stream types a camera supports and falls back to HLS when WebRTC fails on a camera that offers both ([`19b4bd7`](https://github.com/knowald/ha-hearth/commit/19b4bd7), [`756c09d`](https://github.com/knowald/ha-hearth/commit/756c09d))
- Keep showing the snapshot of a camera that has no live stream instead of offering a Retry that cannot work ([`75799d8`](https://github.com/knowald/ha-hearth/commit/75799d8))
- Load behind an nginx reverse proxy in front of Home Assistant, which rejected the page with a 502 because its preload `Link` header exceeded the default 4k proxy buffer ([`c9eee00`](https://github.com/knowald/ha-hearth/commit/c9eee00))

## [0.3.0] - 2026-09-23

### Changed

- Show why the connection fails on the boot screen after a few attempts, with a hint for the cause and a Retry button, instead of spinning forever ([`23f870f`](https://github.com/knowald/ha-hearth/commit/23f870f))
- Keep the sign-in sheet open until Home Assistant accepts the token, say so when it rejects one, and call the action "Sign in" everywhere ([`23f870f`](https://github.com/knowald/ha-hearth/commit/23f870f))
- Explain an unreadable, invalid or unsupported `hearth.yaml` and an unreadable `configuration.yaml` in the load-error banner, with a Reload button ([`f205c5b`](https://github.com/knowald/ha-hearth/commit/f205c5b))
- Tell a degraded Home Assistant connection, where some data may be stale, apart from a lost one ([`f205c5b`](https://github.com/knowald/ha-hearth/commit/f205c5b))
- Keep the first-run area import open on a stray backdrop tap and offer Skip for now ([`f205c5b`](https://github.com/knowald/ha-hearth/commit/f205c5b))
- Move the area import from the edit bar to the Settings sheet, and offer it on an empty home page until the dashboard is set up ([`f205c5b`](https://github.com/knowald/ha-hearth/commit/f205c5b), [`153a411`](https://github.com/knowald/ha-hearth/commit/153a411))
- Open the same detail sheet for an entity from every tile, search result and widget, headed by its translated domain name and configured icon ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Send a cleaning or returning vacuum home from every surface, and offer the same actions in its detail sheet and popover ([`15a5e62`](https://github.com/knowald/ha-hearth/commit/15a5e62), [`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Ask before unlocking or opening a lock but not before locking it, on the tile and in the detail sheet alike ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Label each editor sheet's header action by what it does: Close, Done, Apply or Save ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Confirm destructive editor actions with the same dialog everywhere, including leaving edit mode with unsaved changes, and stop asking before a stack is unwrapped ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Share one visibility section and one live preview between the card and widget editors ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Show whole readings without a decimal ("21" rather than "21.0") and use the Home Assistant temperature unit on every surface ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Build a page list into a wide rail that has no visible navigation widget, so pages can always be changed ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4), [`bea0e74`](https://github.com/knowald/ha-hearth/commit/bea0e74))
- Close the top popup, sheet or search with the browser or Android back button, and keep the current page in `?room=` ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Show search as a full-width sheet on phones ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Let only the edit chip react on rail widgets while editing ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Hide rail widgets with nothing to show, show "-" for an unavailable entity instead of a made-up reading, and keep a dimmed placeholder while editing ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Stop all motion, including the pending pulse and the press scale, when reduced motion is set in Hearth or the operating system ([`ede2b06`](https://github.com/knowald/ha-hearth/commit/ede2b06))
- Draw shadows, card surfaces, spacing and faint fills from theme tokens, so light themes keep their tints and cards share one shape ([`ede2b06`](https://github.com/knowald/ha-hearth/commit/ede2b06))
- Store interface copy in sentence case, call dashboard pages "pages" throughout, and translate option labels, theme names and placeholders that were English only ([`7d403bf`](https://github.com/knowald/ha-hearth/commit/7d403bf))

### Added

- Drag a cover tile sideways to set its position, like a light tile sets brightness ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Control popup sliders from the keyboard ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Add move up and move down to the card, widget and stack editors ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Add hints and inline errors to editor fields ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Offer Overwrite and Reload when application settings were changed in another tab ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Open entity detail from weather, chart, status, energy and calendar widgets ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))

### Fixed

- Show the sign-in button on the boot screen only when a long-lived token is needed ([`5f99973`](https://github.com/knowald/ha-hearth/commit/5f99973))
- Keep a tap that closes search or wakes the screensaver from reaching the tile underneath ([`70c21a8`](https://github.com/knowald/ha-hearth/commit/70c21a8))
- Show command errors and the connection banner above open popups and sheets ([`5235598`](https://github.com/knowald/ha-hearth/commit/5235598))
- Accept taps on scenes, buttons and scripts that have not run yet and report `unknown` ([`5b3af77`](https://github.com/knowald/ha-hearth/commit/5b3af77))
- Confirm every garage door and gate move, from the tile, popup, slider and group actions, and send the direction that was confirmed ([`5b3af77`](https://github.com/knowald/ha-hearth/commit/5b3af77), [`6cda91b`](https://github.com/knowald/ha-hearth/commit/6cda91b))
- Open the media popup for media players from tiles and search ([`38d52ca`](https://github.com/knowald/ha-hearth/commit/38d52ca))
- Apply custom CSS without reloading the page, which dropped unsaved dashboard edits ([`e58f5d2`](https://github.com/knowald/ha-hearth/commit/e58f5d2))
- Keep Ctrl-S in an open editor sheet from opening the browser's save dialog ([`e58f5d2`](https://github.com/knowald/ha-hearth/commit/e58f5d2))
- Ask before dropping staged application settings ([`5581ef1`](https://github.com/knowald/ha-hearth/commit/5581ef1))
- Leave no empty stack behind when adding one is cancelled ([`b68bbb0`](https://github.com/knowald/ha-hearth/commit/b68bbb0))
- Apply the theme sheet's day/night switch fields as they change, like its other fields ([`e571b87`](https://github.com/knowald/ha-hearth/commit/e571b87))
- Keep read-only tiles from opening controls ([`b4b39dc`](https://github.com/knowald/ha-hearth/commit/b4b39dc))
- Let detail sliders reach every step of the entity ([`a5bafa2`](https://github.com/knowald/ha-hearth/commit/a5bafa2))
- Show climate and fan changes at once and pulse the control that was pressed until Home Assistant confirms ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Restore a `?theme=` preset once editing ends ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Copy edits as YAML, with Copied or Copy failed feedback instead of reporting a failed save ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Return from Versions to the configuration editor and from there to Settings ([`06d51f4`](https://github.com/knowald/ha-hearth/commit/06d51f4))
- Trap and restore keyboard focus in every popup, sheet and dialog ([`ede2b06`](https://github.com/knowald/ha-hearth/commit/ede2b06))

## [0.2.0] - 2026-09-22

### Changed

- Overhaul the import from Home Assistant: pages carry the area's own icon, floor grouping and registered temperature and humidity sensors, and split into Lighting, Covers, Devices, thermostat, media and camera cards instead of one Lighting and one Devices grid
- Place imported rail suggestions above the flexible spacer instead of below it, skip the ones the rail already covers, and propose a weather widget
- Write the template widget's Jinja in a code editor with highlighting; the plain box it replaces validated the template as YAML and reported a correct template as broken
- Rework the phone layout: the clock and weather ride above the page and the other widgets follow it, `mobile: top | bottom | hidden` on a widget overrides that, and a rail with a flexible gap in the middle is split there; `hide_mobile` still reads as `mobile: hidden`
- Fold every overlay to full width at the same place the rail folds; control popups and the edit bar changed shape at 700px and edit sheets at 820px
- Shed the page labels from all but the current page when a phone is held sideways, and keep the whole rail below the page there

### Added

- Export the dashboard to a YAML file and import one back from the configuration editor
- Add Versions to the Settings sheet: the snapshots every save keeps are listed, shown as a diff against the open dashboard, and can be downloaded or restored as an ordinary, undoable edit
- Apply the configuration editor with Ctrl-S
- Choose between adding the areas Hearth has no page for and replacing the existing pages when importing, with a confirmation before anything is removed

### Fixed

- Draw the keyboard focus ring around a framed text field (the search box, the padding steppers, the icon filter) instead of around the bare input inside it
- Keep text pushed into the configuration editor, such as an imported file, while the editor is still loading
- Skip config and diagnostic entities, and entities left behind by a removed integration, when importing an area
- Include camera-only areas when importing from Home Assistant
- Save the import when it runs outside edit mode; it was kept in memory only, so a reload dropped it
- Open a page at its own top rather than at the scroll offset left behind by the page before it
- Make the phone page switcher opaque, so the page no longer shows through the pills, and stop content landing underneath it
- Give the phone layout the side padding the wide one has
- Reach under device cutouts by adding `viewport-fit=cover`, without which every safe-area inset resolved to zero; landscape notches now inset the sides too
- Give the timer widget's buttons a thumb-sized hit area, and stop the dashboard scrolling sideways on a phone
- Keep a widget where it was dropped when it is dragged from one side of the phone layout to the other, and keep a widget hidden on mobile hidden when the widgets around it move
- Keep an unapplied YAML edit when Versions is opened from the configuration editor, and add a way back to it

## [0.1.3] - 2026-09-21

### Fixed

- Reuse the Home Assistant panel's login when Hearth is opened as an app (`/app/...`) instead of starting OAuth inside the iframe

## [0.1.2] - 2026-09-21

### Fixed

- Log in through Nabu Casa Ingress by using the forwarded Home Assistant origin and an explicit Ingress OAuth redirect URL

## [0.1.1] - 2026-09-21

### Added

- Add `HASS_PUBLIC_URL` for direct access when the server uses an internal Home Assistant address

### Fixed

- Log in through HTTPS Ingress and Nabu Casa by using the browser's Home Assistant origin
- Recover from expired or consumed login codes, and keep room, theme and kiosk settings after login
- Pin the CodeMirror dependency to the editor API the configuration editor and type checks use

## [0.1.0] - 2026-09-20

### Changed

- **Breaking:** require revisioned configuration saves and reject unsupported persisted document formats
- Establish Hearth as an independent dashboard with its own package, assets and Docker publishing target
- Float the theme editor over the dashboard as a draggable window, so edits preview live against the real layout
- Replace the browser's native colour input with an in-app picker: saturation square, hue strip, theme swatches and a hex field
- Replace camera playback and token login with Hearth components
- Separate configuration definitions from rendering components, so server and editor validation share the same schemas
- Establish semantic versioning from `0.1.0`

### Added

- Add frosted glass surfaces: a backdrop blur setting for every card, tile and widget, a scrim over the background image and an inherited text shadow
- Blur the edges where a scroll container cuts content off, on the page column, the editor sheet and the media shortcut row, with an off switch in Settings for slower screens
- Make the text ladder adjustable with contrast and shadow scales, plus muted-text and icon colours that no longer derive from the ink
- Add a Void (OLED) theme preset with a true-black background

### Removed

- Remove the retired dashboard, embedded objects, picture-elements tooling, alternate routes and cross-repository release automation

### Fixed

- Keep the standard `backdrop-filter` in the built stylesheet; writing the `-webkit-` prefix by hand made the minifier drop it, so no blur in the application took effect

[0.5.1]: https://github.com/knowald/ha-hearth/releases/tag/0.5.1
[0.5.0]: https://github.com/knowald/ha-hearth/releases/tag/0.5.0
[0.4.0]: https://github.com/knowald/ha-hearth/releases/tag/0.4.0
[0.3.0]: https://github.com/knowald/ha-hearth/releases/tag/0.3.0
[0.2.0]: https://github.com/knowald/ha-hearth/releases/tag/0.2.0
[0.1.3]: https://github.com/knowald/ha-hearth/releases/tag/0.1.3
[0.1.2]: https://github.com/knowald/ha-hearth/releases/tag/0.1.2
[0.1.1]: https://github.com/knowald/ha-hearth/releases/tag/0.1.1
[0.1.0]: https://github.com/knowald/ha-hearth/tree/0.1.0
