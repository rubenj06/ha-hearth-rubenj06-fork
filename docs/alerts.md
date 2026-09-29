# Alerts

Alerts pop up over the dashboard, wake the sleep screen when they pop up, and are listed in the notifications widget together with Home Assistant's persistent notifications. Dismissing an alert hides it on that screen only. Dismissing a persistent notification dismisses it in Home Assistant, for every screen.

## Rules

Create rules in edit mode under Settings > Alerts. They are stored in `hearth.yaml`. Each screen checks them in the browser against live entity states. A rule raises its alert once all of its conditions have held for `for_seconds` (default 0) and clears it when they stop holding. Conditions work like card visibility (`state`, `state_not`, `above`, `below`, `or`), except that media queries are not allowed. Each rule needs a unique `id`.

Use rules for alerts that follow a state, such as a door left open:

```yaml
alerts:
  - id: fridge_door
    title: Fridge door open
    message: The fridge door has been open for 2 minutes.
    severity: warning # info (default), warning or critical
    for_seconds: 120 # 0 to 86400
    conditions:
      - entity: binary_sensor.fridge_door
        state: 'on'
```

Optional fields:

- `icon`: a Material icon name for the card.
- `popup: false`: only list the alert in the notifications widget.
- `auto_close: false`: keep the alert after the conditions stop holding, until someone dismisses it.
- `entity`: open this entity's popup instead of an alert card.

After you dismiss a rule's alert, it stays away until its conditions stop holding and then hold again.

## Home Assistant events

Automations can raise alerts and open or close popups by firing a `HEARTH` event. Event alerts live in the browser's memory only. A screen only receives events fired while it is open and connected, and a reload clears event alerts. Use events for one-shot notices and rules for anything that follows a state.

For example, in an automation:

```yaml
alias: Washer finished
triggers:
  - trigger: state
    entity_id: sensor.washer_status
    to: finished
actions:
  - event: HEARTH
    event_data:
      action: alert
      tag: washer
      title: Washer finished
      message: Move the laundry to the dryer.
```

| `action`        | Fields                                                                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alert`         | `title` (required), `tag` (defaults to the title; a new alert with the same tag replaces the old one), `message`, `icon`, `severity` (`info` default, `warning`, `critical`), `popup: false` to only list it, `entity` to add an Open button for that entity's popup. |
| `dismiss_alert` | `tag`                                                                                                                                                                                                                                                                 |
| `open_popup`    | `entity`, optional `name`. Ignored in edit mode; wakes the sleep screen.                                                                                                                                                                                              |
| `close_popup`   | `entity` (optional). Without it, the open popup closes; with it, only that entity's popup closes.                                                                                                                                                                     |

Every action accepts `device`, a name or a list of names. Without it, every screen acts on the event. With it, only screens whose device name matches exactly act on it. Set the name under Settings > Application settings > Device name, which is stored in that browser, or with `?device=<name>` in the URL.

To reload every screen, fire `HEARTH` with `event_data: { event: refresh }`. This ignores `device`.
