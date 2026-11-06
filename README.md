# Lovelace Animated Background

[![hacs_badge](https://img.shields.io/badge/HACS-Default-orange.svg)](https://github.com/hacs/integration)

Animated video and image backgrounds for Home Assistant Lovelace dashboards, with support for entity-driven state changes, per-view configuration, transparent panels, card opacity, and a built-in visual editor.

![Example](https://raw.githubusercontent.com/Villhellm/README_images/master/Animation.gif)

---

## Attribution

This project builds on the work of several contributors:

- **[Villhellm](https://github.com/Villhellm/lovelace-animated-background)** — original author. May he rest in peace.
- **[dreimer1986](https://github.com/dreimer1986/lovelace-animated-background)** — fixes for Home Assistant 2023.04.0 and transparent card mode.
- **[rbogdanov](https://github.com/rbogdanov/lovelace-animated-background)** — added transparent panel support and card opacity mode.
- **[imonlinux](https://github.com/imonlinux/lovelace-animated-background)** — fixes for HA 2026.x, layout and CSS stacking context fixes, shadow DOM targeting corrections, group config inheritance fixes, and the visual editor.

---

## Installation

### Method 1: HACS (Recommended)

> **Note:** HACS 2.0 changed the installation process significantly. The old "overflow menu → Custom repositories" workflow no longer exists. HACS is now installed as a proper Home Assistant integration. If you don't have HACS yet, follow the [official HACS installation guide](https://www.hacs.xyz/docs/use/download/download/).

1. In HACS, select the **three-dot menu** (⋮) in the top right and choose **Custom repositories**.
2. Paste `https://github.com/imonlinux/lovelace-animated-background` as the repository URL and select **Dashboard** as the category.
3. Find **Lovelace Animated Background** in the available downloads and install it.
4. Add the resource to your dashboard.

### Method 2: Manual

1. Copy `animated-background.js` from this repository to `<config directory>/www/animated-background.js` on your Home Assistant instance.
2. Register the resource — see **Registering the resource** below.

**Registering the resource**

After installing manually, you need to register the JavaScript file as a Lovelace resource.

**Via the UI**

> Requires **Advanced Mode** to be enabled on your user profile. Go to your profile (click your name in the bottom-left sidebar) and toggle **Advanced Mode** on.

Navigate to **Settings → Dashboards**, then open the **three-dot menu (⋮)** in the top right and select **Resources**. Add a new resource with:

- **Manual install URL:** `/local/animated-background.js`
- **Resource type:** JavaScript Module

---

## Configure with the visual editor

The plugin ships a visual editor card **in the same file** — no extra install, no second resource. If the background is installed, the editor is already available. It configures the entire `animated_background:` block through a form and writes it back to the dashboard, so you never have to touch YAML unless you want to.

### Adding the editor card to an existing dashboard

1. Open the dashboard and select the **pencil icon** (Edit dashboard).
2. Select **Add card**, then search for **Animated Background Editor**. (Alternatively choose **Manual** and enter `type: custom:animated-background-editor`.)
3. Place it on an admin or private view — it is a configuration tool, not a decoration. Any view on the dashboard works; the editor configures the whole dashboard, not the view it sits on.
4. Select **Done** to leave edit mode.
5. Configure across the tabs and select **Save**. The background redraws immediately.

### Setting up a brand-new dashboard

1. Go to **Settings → Dashboards → + Add Dashboard**, choose **New dashboard from scratch**, give it a title, then **Create** and open it.
2. **Take control of the dashboard.** Select the pencil icon; a new dashboard is auto-populated by a strategy and Home Assistant will prompt you to take control. Confirm (choosing to start from the auto-generated cards or an empty dashboard — either is fine).
   > **This step is required.** Until you take control, the dashboard has no stored configuration for the editor to write to, and saving will not work. The editor detects this and tells you.
3. Add the editor card as in the steps above.
4. Configure and save.

> The resource only needs registering once for your whole Home Assistant instance, not per dashboard. If the background already works on one dashboard, the editor card is available on all of them.

### What each tab does

| Tab | What you set there |
| --- | --- |
| General | Default background URL(s), tint overlay, card opacity, transparent header, refresh behaviour |
| Entity & States | The entity that drives the background, and a URL for each of its states |
| Views | Per-view overrides — inherit, use a group, disable, or set a custom config |
| Groups | Named reusable configs you can assign to multiple views |
| Access | Limit the background to specific users or device types |
| Advanced | Debug logging, user-agent display, and the generated YAML |

### Good to know

- Entering **multiple URLs** — one per line in a URL box — means one is picked at random each refresh.
- **Saving requires admin.** Non-admin users see the generated YAML instead.
- **YAML-mode dashboards** cannot be saved from the card; the editor generates the `animated_background:` block plus the view-level assignment lines to paste in.
- **Copy YAML** always works — useful for sharing a config or keeping one in a repo.
- The editor **preserves everything else** in the dashboard config; it only touches the `animated_background:` keys.
- **Stale view entries** (referencing a view path that no longer exists) are flagged so they can be removed.
- Removing the editor card does not affect the background — the config stays.

---

## Configuration Reference

Add the `animated_background:` block at the **root** of your Lovelace dashboard configuration — not inside a view or card. If you are using UI-managed dashboards, access the raw configuration editor via the **pencil icon → three-dot menu → Edit in YAML** on your dashboard.

```yaml
animated_background:
  default_url: "https://cdn.flixel.com/flixel/ypy8bw9fgw1zv2b4htp2.hd.mp4"
  entity: "weather.home"
  state_url:
    'sunny':
      - "https://cdn.flixel.com/flixel/hlhff0h8md4ev0kju5be.hd.mp4"
      - "https://cdn.flixel.com/flixel/zjqsoc6ecqhntpl5vacs.hd.mp4"
    'rainy': "https://cdn.flixel.com/flixel/f0w23bd0enxur5ff0bxz.hd.mp4"
    'clear-night':
      - "https://cdn.flixel.com/flixel/ypy8bw9fgw1zv2b4htp2.hd.mp4"
      - "https://cdn.flixel.com/flixel/rosz2gi676xhkiw1ut6i.hd.mp4"

title: Home
views: ...
```

> Any `mp4`, `webm`, or image URL will work, including local `/local/` paths. Using locally stored videos is strongly recommended — it greatly improves loading times and avoids dependence on external CDNs. Short looping videos ("cinemagraphs") work best.

All options go under the `animated_background:` key:

| Option | Type | Description |
| --- | --- | --- |
| `default_url` | string or list | Fallback video or image URL when no entity state matches. If a list is provided, a random entry is selected. |
| `enabled` | bool | Set to `false` to disable the plugin entirely. Default: `true`. |
| `entity` | string | Home Assistant entity whose state drives background changes. |
| `state_url` | map | Map of entity states to video or image URLs. Each value can be a single URL or a list. Set a state to `'none'` to disable the background for that state. Required if `entity` is set. |
| `opacity` | number (1–99) | Makes the view element semi-transparent so the background shows through cards. Requires a theme that sets card backgrounds to transparent or semi-transparent. **Note:** this creates a CSS stacking context — see [Troubleshooting](#troubleshooting-popups-appear-behind-the-background). |
| `overlay` | map | Optional tint layer drawn over the background media. Takes `color` (any CSS color, default `#000000`) and `opacity` (0–1, default `0.3`). Darkens or tints busy backgrounds so cards and text stay readable. Can be set at the root, group, or view level. |
| `background` | string | CSS background override for the view behind the header. Defaults to `transparent` when the background is active. Set it to any CSS background value (for example a color) if you do not want the view fully see-through. |
| `transparent_panel` | bool | Makes the top navigation panel/header transparent. Default: `false`. |
| `views` | list | Per-view configuration overrides. See [View Configuration](#view-configuration). |
| `groups` | list | Named reusable configurations that views can reference. See [Group Configuration](#group-configuration). |
| `included_users` | list of strings | Only these users will see the animated background. All others are excluded. See the precedence rules below. |
| `excluded_users` | list of strings | These users will not see the animated background. Exclusions always win. |
| `included_devices` | list of strings | Only these device types will show the background. Supported values: `iphone`, `ipad`, `windows`, `macintosh`, `android`. |
| `excluded_devices` | list of strings | These device types will not show the background. Exclusions always win. |
| `debug` | bool | Enables detailed console logging. |
| `display_user_agent` | bool | Shows an alert with your current user agent string. Useful for determining the correct value to use in device include/exclude lists. |
| `refresh_on_update` | bool | Refreshes the background when the updated state of the weather entity changes even if the value does not. |
| `refresh_interval` | numeric | Number of minutes to refresh the background, it picks from the current list. |

> **Note on `opacity`:** The `opacity` setting makes the entire view container semi-transparent, which only produces a see-through card effect when combined with a theme that sets `--ha-card-background` to a transparent or semi-transparent colour (e.g. `rgba(0,0,0,0.3)`). Without a compatible theme, cards will appear faded but not transparent. Several HACS themes (such as iOS themes) provide this out of the box.

> **Note on root fallback:** `opacity`, `overlay`, `background`, `transparent_panel`, `refresh_interval` and `refresh_on_update` are read from the active view or group config first, and fall back to the root `animated_background:` config when the view or group does not set them. You do not need to repeat them inside each group definition — but you can override them per group or view.

> **Access precedence:** include/exclude lists are evaluated in a fixed order.
> 1. **Exclusions always win.** A user or device matching any `excluded_users` or `excluded_devices` list (root *or* view/group config) never sees the background, regardless of inclusion lists or `enabled: true`.
> 2. An explicit `enabled: true` or `enabled: false` on a view or group config applies next. It can override inclusion lists, never exclusions.
> 3. If any `included_users` or `included_devices` list is configured, the current user or device must match at least one of them to see the background. With no inclusion lists configured, everyone (not excluded by step 1) sees it.

---

## View Configuration

You can override the background for specific dashboard views using the `views:` key.

| Option | Type | Description |
| --- | --- | --- |
| `path` | string | The view path — whatever appears after `/lovelace/` in the URL. |
| `config` | config object | A full or partial configuration for this view. Accepts the same options as a group config. |

```yaml
animated_background:
  default_url: "https://cdn.flixel.com/flixel/ypy8bw9fgw1zv2b4htp2.hd.mp4"
  entity: "weather.home"
  state_url:
    'sunny': "https://cdn.flixel.com/flixel/hlhff0h8md4ev0kju5be.hd.mp4"
  views:
    - path: gaming
      config:
        entity: "light.game_room"
        state_url:
          'on':  "https://cdn.flixel.com/flixel/8cmeusxf3pkanai43djs.hd.mp4"
          'off': "https://cdn.flixel.com/flixel/ypy8bw9fgw1zv2b4htp2.hd.mp4"

title: Home
views: ...
```

---

## Group Configuration

Groups let you define a named background configuration that can be reused across multiple views with a single line.

| Option | Type | Description |
| --- | --- | --- |
| `name` | string | The name used to reference this group from a view. |
| `config` | config object | The background configuration for this group. |

To use a group on a view, add `animated_background: <group-name>` to the view definition. Set it to `'none'` to explicitly disable the background on a view.

```yaml
animated_background:
  default_url: "https://cdn.flixel.com/flixel/ypy8bw9fgw1zv2b4htp2.hd.mp4"
  transparent_panel: true
  groups:
    - name: weather
      config:
        entity: "weather.home"
        state_url:
          'sunny':
            - "https://cdn.flixel.com/flixel/hlhff0h8md4ev0kju5be.hd.mp4"
            - "https://cdn.flixel.com/flixel/zjqsoc6ecqhntpl5vacs.hd.mp4"
          'rainy': "https://cdn.flixel.com/flixel/f0w23bd0enxur5ff0bxz.hd.mp4"

views:
  - path: home
    title: Home
    animated_background: weather
    cards: ...
  - path: cameras
    title: Cameras
    animated_background: 'none'  # disable background on this view
    cards: ...
```

---

## Examples:

### Full weather example with locally stored videos

This is a complete real-world example using locally stored videos for all standard weather states. The filename portion of each local path is the Flixel CDN ID, so you can also use them directly as CDN URLs — see the note below the example.

```yaml
animated_background:
  default_url: /local/backgrounds/clear-night/ypy8bw9fgw1zv2b4htp2.hd.mp4
  transparent_panel: true
  groups:
    - name: weather
      config:
        entity: weather.home
        state_url:
          exceptional:
            - /local/backgrounds/sunny/hlhff0h8md4ev0kju5be.hd.mp4
            - /local/backgrounds/sunny/zjqsoc6ecqhntpl5vacs.hd.mp4
            - /local/backgrounds/sunny/8cmeusxf3pkanai43djs.hd.mp4
            - /local/backgrounds/sunny/jvw1avupguhfbo11betq.hd.mp4
            - /local/backgrounds/sunny/guwb10mfddctfvwioaex.hd.mp4
          sunny:
            - /local/backgrounds/sunny/hlhff0h8md4ev0kju5be.hd.mp4
            - /local/backgrounds/sunny/zjqsoc6ecqhntpl5vacs.hd.mp4
            - /local/backgrounds/sunny/8cmeusxf3pkanai43djs.hd.mp4
            - /local/backgrounds/sunny/jvw1avupguhfbo11betq.hd.mp4
            - /local/backgrounds/sunny/guwb10mfddctfvwioaex.hd.mp4
          partlycloudy:
            - /local/backgrounds/partlycloudy/13e0s6coh6ayapvdyqnv.hd.mp4
            - /local/backgrounds/partlycloudy/aorl3skmssy7udwopk22.hd.mp4
            - /local/backgrounds/partlycloudy/qed6wvf2igukiioykg3r.hd.mp4
            - /local/backgrounds/partlycloudy/3rd72eezaj6d23ahlo7y.hd.mp4
            - /local/backgrounds/partlycloudy/9m11gd43m6qn3y93ntzp.hd.mp4
            - /local/backgrounds/partlycloudy/hrkw2m8eofib9sk7t1v2.hd.mp4
          cloudy:
            - /local/backgrounds/cloudy/13e0s6coh6ayapvdyqnv.hd.mp4
            - /local/backgrounds/cloudy/aorl3skmssy7udwopk22.hd.mp4
            - /local/backgrounds/cloudy/qed6wvf2igukiioykg3r.hd.mp4
            - /local/backgrounds/cloudy/3rd72eezaj6d23ahlo7y.hd.mp4
            - /local/backgrounds/cloudy/9m11gd43m6qn3y93ntzp.hd.mp4
            - /local/backgrounds/cloudy/hrkw2m8eofib9sk7t1v2.hd.mp4
            - /local/backgrounds/cloudy/e95h5cqyvhnrk4ytqt4q.hd.mp4
            - /local/backgrounds/cloudy/l2bjw34wnusyf5q2qq3p.hd.mp4
            - /local/backgrounds/cloudy/rrgta099ulami3zb9fd2.hd.mp4
          mostlycloudy:
            - /local/backgrounds/mostlycloudy/l2bjw34wnusyf5q2qq3p.hd.mp4
            - /local/backgrounds/mostlycloudy/rrgta099ulami3zb9fd2.hd.mp4
          clear-night:
            - /local/backgrounds/clear-night/x9dr8caygivq5secll7i.hd.mp4
            - /local/backgrounds/clear-night/v26zyfd6yf0r33s46vpe.hd.mp4
            - /local/backgrounds/clear-night/ypy8bw9fgw1zv2b4htp2.hd.mp4
            - /local/backgrounds/clear-night/rosz2gi676xhkiw1ut6i.hd.mp4
            - /local/backgrounds/clear-night/x5rxll400y2um2xe677c.hd.mp4
          fog:
            - /local/backgrounds/fog/5363uhabodwwrzgnq6vx.hd.mp4
            - /local/backgrounds/fog/4dbfz329lqn0gzxft14l.hd.mp4
            - /local/backgrounds/fog/vabb5tnx2psqf1221ue9.hd.mp4
            - /local/backgrounds/fog/1xgcgyb68b15ysz30gw9.hd.mp4
          rainy:
            - /local/backgrounds/rainy/f0w23bd0enxur5ff0bxz.hd.mp4
            - /local/backgrounds/rainy/qti3s5st0srowd9krhcw.hd.mp4
          lightning:
            - /local/backgrounds/lightning/sbk5sc03j7vay52r3e4o.hd.mp4
            - /local/backgrounds/lightning/chrgj6raf5q3s6y2so7z.hd.mp4
            - /local/backgrounds/lightning/j6txa6307zgmk4olaykl.hd.mp4
          lightning-rainy:
            - /local/backgrounds/lightning-rainy/sbk5sc03j7vay52r3e4o.hd.mp4
            - /local/backgrounds/lightning-rainy/chrgj6raf5q3s6y2so7z.hd.mp4
          pouring:
            - /local/backgrounds/pouring/f0w23bd0enxur5ff0bxz.hd.mp4
            - /local/backgrounds/pouring/qti3s5st0srowd9krhcw.hd.mp4
          snowy:
            - /local/backgrounds/snowy/on3ysblo5hzdmrhv1kwh.hd.mp4
            - /local/backgrounds/snowy/psi1hhbsshcus8eumtr7.hd.mp4
          snowy-rainy:
            - /local/backgrounds/snowyrainy/ndza6yswd0k6vlboxyhk.hd.mp4
          windy:
            - /local/backgrounds/windy/2qmg1xgcswq79lxu09rl.hd.mp4
            - /local/backgrounds/windy/guwb10mfddctfvwioaex.hd.mp4

views:
  - path: home
    title: Home
    animated_background: weather
    cards: ...
```

> To use CDN URLs instead of local files, replace any `/local/backgrounds/<state>/<id>.hd.mp4` with `https://cdn.flixel.com/flixel/<id>.hd.mp4`. For example:

```
/local/backgrounds/sunny/hlhff0h8md4ev0kju5be.hd.mp4
→ https://cdn.flixel.com/flixel/hlhff0h8md4ev0kju5be.hd.mp4
```

---

### Multiple entities using a template sensor

The plugin tracks a single entity at a time, but you can combine multiple entity states into one value using a [Template Helper](https://www.home-assistant.io/integrations/template/). This example creates a background that changes based on both the time of day and a bedroom switch state.

**Option 1: Create a Helper in the UI (recommended)**

Go to **Settings → Devices & Services → Helpers → Create Helper → Template → Template sensor** and enter:

```
{{ states('sun.sun') + '-' + states('switch.bedroom') }}
```

Give it a name like `Sun and Bedroom`. This creates a sensor (e.g. `sensor.sun_and_bedroom`) without editing any YAML files.

**Option 2: YAML in `configuration.yaml`**

```yaml
template:
  - sensor:
      - name: "Sun and Bedroom"
        state: "{{ states('sun.sun') + '-' + states('switch.bedroom') }}"
        # Returns states like 'above_horizon-on' or 'below_horizon-off'
```

**Lovelace config (either option):**

```yaml
animated_background:
  entity: "sensor.sun_and_bedroom"
  state_url:
    'above_horizon-on':  "https://cdn.flixel.com/flixel/hlhff0h8md4ev0kju5be.hd.mp4"
    'above_horizon-off': "https://cdn.flixel.com/flixel/zjqsoc6ecqhntpl5vacs.hd.mp4"
    'below_horizon-on':  "https://cdn.flixel.com/flixel/9m11gd43m6qn3y93ntzp.hd.mp4"
    'below_horizon-off': "https://cdn.flixel.com/flixel/hrkw2m8eofib9sk7t1v2.hd.mp4"
```

> `sun.sun` has two states — `above_horizon` (daytime) and `below_horizon` (night) — giving you four possible combinations to map backgrounds to.

---

### Tinting a busy background

```yaml
animated_background:
  entity: weather.home
  overlay:
    color: "#000000"
    opacity: 0.35
  state_url:
    sunny: /local/backgrounds/sunny/hlhff0h8md4ev0kju5be.hd.mp4
```

> `overlay` tints the background media itself (a layer drawn on top of the video/image), while `opacity` makes the dashboard's cards semi-transparent. They're independent: use `overlay` to darken a bright background for readability, and `opacity` (with a compatible theme) to let the background show through cards.

---

## Troubleshooting: Popups appear behind the background

If you use **Bubble Card** or similar popup integrations and notice popups opening behind the background, this is a CSS stacking context issue caused by the `opacity` option.

When `opacity` is set (any value 1–99), the plugin applies an `opacity` CSS property to the view container element. This forces the browser to create a new stacking context, which confines the `z-index` of all child elements — including popups — preventing them from rendering above the background.

**Solutions:**

- **Remove the `opacity` option** from your config if you don't need semi-transparent cards. This is the cleanest fix.
- **Bubble Card workaround:** Add `hide_backdrop: true` to your Bubble Card configuration. This disables the Bubble Card backdrop element which is the part most affected by the stacking context. Note that this removes the dimmed backdrop visual from Bubble Card popups.

> Do not apply `filter` or `opacity` CSS directly to `hui-masonry-view`, `hui-sections-view`, or `hui-panel-view` via themes or custom CSS — this will cause the same stacking context issue.

---

## Note for mobile users

If you are using device exclusions to prevent the background loading on mobile, monitor your Home Assistant app data usage after installing. If you notice unexpectedly high data usage, please open an issue.

If you intentionally use this plugin on mobile, be aware it will consume significant mobile data, particularly with remote CDN video URLs. Using locally stored videos (`/local/`) will reduce this considerably.

---

[General Lovelace plugin troubleshooting](https://github.com/thomasloven/hass-config/wiki/Lovelace-Plugins)
