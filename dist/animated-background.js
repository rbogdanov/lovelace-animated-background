
const Debug_Prefix = "Animated Background DEBUG: ";
const Log_Prefix = "Animated Background: "

//globals
var Root;
var Hui;
var Header;
var Lovelace;
var Animated_Config;
var Haobj = null;
var View;
var Panel_Holder;
var Debug_Mode = false;
var Loaded = false;
var View_Loaded = false;
var Meme_Remover = null;
var Meme_Count = 0;
var Refresh_Timer = null;
var Refresh_Interval_Value = null;
var Wait_Interval = null;
var Opacity = 99;

//state tracking variables
let Previous_State;
let Previous_Entity;
let Previous_Url;
let Previous_Config;
let Previous_Last_Updated;

function STATUS_MESSAGE(message, force) {
  if (!Debug_Mode) {
    console.log(Log_Prefix + message);
  }
  else {
    if (force) {
      console.log(Debug_Prefix + message);
    }
  }
}

function DEBUG_MESSAGE(message, object, only_if_view_not_loaded) {
  if (Debug_Mode) {
    if (only_if_view_not_loaded && View_Loaded) {
      return;
    }
    console.log(Debug_Prefix + message);
    if (object) {
      console.log(object);
    }
  }
}

function randomIntFromInterval(min, max) { // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

//reset all DOM variables
function getVars() {
  Root = document.querySelector("home-assistant");
  Header = Root;
  Root = Root && Root.shadowRoot;
  Root = Root && Root.querySelector("home-assistant-main");
  Root = Root && Root.shadowRoot;
  Root = Root && Root.querySelector("app-drawer-layout partial-panel-resolver, ha-drawer partial-panel-resolver");
  
  Root = (Root && Root.shadowRoot) || Root;
  Root = Root && Root.querySelector("ha-panel-lovelace");
  if (Root) {
    Panel_Holder = Root.shadowRoot;
  }
  Root = Root && Root.shadowRoot;
  Root = Root && Root.querySelector("hui-root");
  Hui = Root;

  if (Root) {
    Lovelace = Root.lovelace;
    if (Lovelace) {
      Animated_Config = Lovelace.config.animated_background;
    }
    View = Root.shadowRoot.getElementById("view");
  }
}

//Mutation observer to set the background of views to transparent each time a new tab is selected
var View_Observer = new MutationObserver(function (mutations) {
  mutations.forEach(function (mutation) {
    if (mutation.addedNodes.length > 0) {
      if (!currentConfig() && View_Loaded) {
        DEBUG_MESSAGE("No configuration found for this view");
      }
      View_Loaded = false;
      clearMemes();
      clearRefreshTimer();
      renderBackgroundHTML();
    }
  });
});

//Mutation observer to refresh video on HA refresh
var Hui_Observer = new MutationObserver(function (mutations) {
  mutations.forEach(function (mutation) {
    if (mutation.addedNodes.length > 0) {
      DEBUG_MESSAGE("Proof that this observer is not useless");
      renderBackgroundHTML();
    }
  });
});

//Mutation observer to reload on dashboard change
var Panel_Observer = new MutationObserver(function (mutations) {
  mutations.forEach(function (mutation) {
    if (mutation.removedNodes.length > 0) {
      if (mutation.removedNodes[0].nodeName.toLowerCase() == "hui-editor") {
        restart();
      }
    }
  });
});

//Current known support: iphone, ipad (if set to mobile site option), windows, macintosh, android
function deviceIncluded(element, index, array) {
  return navigator.userAgent.toLowerCase().includes(element.toLowerCase());
}

//return the currently selected lovelace view
function currentViewPath() {
  return window.location.pathname.split('/')[2];
}

//return group config by name if it exists
function getGroupConfig(name) {
  var return_config = null;
  if (name == "none") {
    return { enabled: false, reason: "current group is set to 'none'" };
  }
  if (Animated_Config.groups) {
    Animated_Config.groups.forEach(group => {
      if (group.name) {
        if (group.name == name) {
          if (group.config) {
            return_config = group.config;
          }
        }
      }
    })
  }
  return return_config;
}

//return the current view configuration or null if none is found
function currentConfig() {
  var current_view_path = currentViewPath();
  var return_config = null;
  if (current_view_path == undefined) {
    return return_config;
  }
  
  if (Animated_Config) {
    if (Animated_Config.entity || Animated_Config.default_url) {
      return_config = Animated_Config;
    }


    if (Animated_Config.views) {
      Animated_Config.views.forEach(view => {
        if (view.path == current_view_path) {
          if (view.config) {
            return_config = view.config;
          }
          else {
            STATUS_MESSAGE("Error, defined view has no config", true);
          }
        }
      });
    }

    var current_view_path = currentViewPath();
    var current_view_config = Lovelace.config.views[Lovelace.current_view];
    if (Lovelace && current_view_path) {
      for (var i = 0; Lovelace.config.views.length > i; i++) {
        if (Lovelace.config.views[i].path == current_view_path) {
          current_view_config = Lovelace.config.views[i];
        }
        else {
          if (i.toString() == current_view_path.toString()) {
            current_view_config = Lovelace.config.views[i];
          }
        }
      }

      if (current_view_config) {
        var potential_config = getGroupConfig(current_view_config.animated_background);
        if (potential_config) {
          return_config = potential_config;
        }
      }
    }

    if (return_config) {
      // state_url may be absent while entity is set (half-finished config);
      // indexing it would throw on every poll.
      if (return_config.entity && return_config.state_url) {
        var current_state = getEntityState(return_config.entity);
        var current_url = return_config.state_url[current_state];
        if (current_url) {
          if (current_url == "none") {
            return_config = { enabled: false, reason: "current state('" + current_state + "') state_url is set to 'none'", entity: return_config.entity, default_url: return_config.default_url, state_url: return_config.state_url };
          }
        }
      }

    }
  }
  return return_config;
}

//logic for checking if enabled in configuration
// Precedence (documented in the README's Access section):
//   1. Exclusions always win: a match on any excluded_users /
//      excluded_devices list (root or view/group config) disables the
//      background no matter what else is configured.
//   2. An explicit enabled: true/false on the view/group config applies
//      next - it can override inclusion lists, never exclusions.
//   3. Inclusion lists are allowlists: if any included_users /
//      included_devices list is configured, the current user or device
//      must match at least one of them.
function enabled() {
  var temp_enabled = false;
  if (Animated_Config) {
    if (Animated_Config.default_url || Animated_Config.entity || Animated_Config.views || Animated_Config.groups) {
      temp_enabled = true;
    }
  }

  if (temp_enabled == false) {
    return false;
  }

  var current_config = currentConfig();

  if (!Haobj) {
    return false;
  }

  if (!current_config) {
    return false;
  }

  // 1. Exclusions win - evaluated first, short-circuits everything below.
  if (Animated_Config.excluded_devices && Animated_Config.excluded_devices.some(deviceIncluded)) {
    DEBUG_MESSAGE("Current device is excluded", null, true);
    return false;
  }
  if (Animated_Config.excluded_users && Animated_Config.excluded_users.map(username => username.toLowerCase()).includes(Haobj.user.name.toLowerCase())) {
    DEBUG_MESSAGE("Current user: " + Haobj.user.name + " is excluded", null, true);
    return false;
  }
  if (current_config.excluded_devices && current_config.excluded_devices.some(deviceIncluded)) {
    DEBUG_MESSAGE("Current device is excluded", null, true);
    return false;
  }
  if (current_config.excluded_users && current_config.excluded_users.map(username => username.toLowerCase()).includes(Haobj.user.name.toLowerCase())) {
    DEBUG_MESSAGE("Current user: " + Haobj.user.name + " is excluded", null, true);
    return false;
  }

  // 2. Explicit per-config switch.
  if (current_config.enabled == false) {
    return false;
  }
  if (current_config.enabled == true) {
    return true;
  }

  // 3. Inclusion lists act as allowlists: if any is configured, the user
  //    or device must match at least one of them (root or per-config).
  var has_inclusions =
    (Animated_Config.included_users && Animated_Config.included_users.length) ||
    (Animated_Config.included_devices && Animated_Config.included_devices.length) ||
    (current_config.included_users && current_config.included_users.length) ||
    (current_config.included_devices && current_config.included_devices.length);
  if (has_inclusions) {
    var user_matched =
      (Animated_Config.included_users || []).map(username => username.toLowerCase()).includes(Haobj.user.name.toLowerCase()) ||
      (current_config.included_users || []).map(username => username.toLowerCase()).includes(Haobj.user.name.toLowerCase());
    var device_matched =
      (Animated_Config.included_devices || []).some(deviceIncluded) ||
      (current_config.included_devices || []).some(deviceIncluded);
    if (!user_matched && !device_matched) {
      if (Animated_Config.included_users || current_config.included_users) {
        DEBUG_MESSAGE("Current user: " + Haobj.user.name + " is not included", null, true);
      }
      if (Animated_Config.included_devices || current_config.included_devices) {
        DEBUG_MESSAGE("Current device is not included", null, true);
      }
      return false;
    }
  }

  return temp_enabled;
}


//returns selected entity's current state if it is available
function getEntityState(entity) {
  var return_state = null;
  if (Haobj) {
    if (Haobj.states[entity]) {
      return_state = Haobj.states[entity].state;
    }
  }

  return return_state;
}

//main render function
function renderBackgroundHTML() {
  Opacity = 99;
  var current_config = currentConfig();
  var resolved_opacity = current_config && current_config.opacity !== undefined ? current_config.opacity : (Animated_Config ? Animated_Config.opacity : 99);
  if (parseInt(resolved_opacity) > 0) {
    Opacity = resolved_opacity;
  }
  var state_url = "";
  var temp_enabled = true;
  //rerender background if entity has changed (to avoid no background refresh if the new entity happens to have the same state)
  if (current_config && current_config.entity && Previous_Entity != current_config.entity) {
    Previous_State = null;
  }

  if (current_config != Previous_Config) {
    Previous_State = null;
  }

  //get state of config object
  if (current_config) {
    if (current_config.entity && current_config.state_url) {
      Previous_Entity = current_config.entity;
      var current_state = getEntityState(current_config.entity);
      if (current_config.state_url[current_state]) {
        if (Previous_State != current_state) {
          View_Loaded = false;
          DEBUG_MESSAGE("Configured entity " + current_config.entity + " is now " + current_state, true);
          if (current_config.state_url) {
            var url = current_config.state_url[current_state];
            if (Array.isArray(url)) {
              state_url = url[randomIntFromInterval(0, url.length - 1)];
            }
            else {
              state_url = current_config.state_url[current_state];
            }
          }
          Previous_State = current_state;
          if (Haobj && Haobj.states[current_config.entity]) {
            Previous_Last_Updated = Haobj.states[current_config.entity].last_updated;
          }
        }
      }
      else {
        DEBUG_MESSAGE("No state_url found for the current state '" + current_state + "'. Attempting to set default_url")
        Previous_State = current_state;
        Previous_Url = null;
        var url = current_config.default_url;
        if (url) {
          if (Array.isArray(url)) {
            state_url = url[randomIntFromInterval(0, url.length - 1)];
          }
          else {
            state_url = url;
          }
        }
        else {
          if (!current_config.reason) {
            DEBUG_MESSAGE("No default_url found, restoring lovelace theme")
          }
          temp_enabled = false;
        }
      }
    }
    else {
      var url = current_config.default_url;
      if (url) {
        if (Array.isArray(url)) {
          state_url = url[randomIntFromInterval(0, url.length - 1)];
        }
        else {
          state_url = url;
        }
      }
      else {
        if (!current_config.reason) {
          DEBUG_MESSAGE("No default_url found, restoring lovelace theme")
        }
        temp_enabled = false;
      }
    }
  }
  else {
    temp_enabled = false;
  }

  if (temp_enabled) {
    temp_enabled = enabled();
  }

  processDefaultBackground(temp_enabled);

  if (!temp_enabled || !current_config) {
    return;
  }

  Previous_Config = current_config;

  // refresh keys resolve with a root fallback, same as opacity,
  // transparent_panel and overlay — a group-driven view must inherit a
  // root-level refresh_interval instead of silently getting none
  var refresh_interval = current_config.refresh_interval !== undefined
    ? current_config.refresh_interval
    : (Animated_Config ? Animated_Config.refresh_interval : undefined);
  if (refresh_interval && refresh_interval != Refresh_Interval_Value) {
    // interval edited since the timer was created - restart so the change
    // applies without waiting for a page reload
    clearRefreshTimer();
  }
  if (refresh_interval && !Refresh_Timer) {
    Refresh_Interval_Value = refresh_interval;
    Refresh_Timer = setInterval(function() {
      Previous_State = null;
      Previous_Url = null;
      renderBackgroundHTML();
    }, refresh_interval * 60 * 1000);
  } else if (!refresh_interval) {
    clearRefreshTimer();
  }

  var html_to_render;
  if (state_url != "" && Hui) {
    var bg = Hui.shadowRoot.getElementById("background-iframe");
    var video_type = urlIsVideo(state_url);
    var doc_body;
    if (video_type) {
      doc_body = `<video id='cinemagraph' autoplay='' loop='' preload='' playsinline='' muted='' poster=''><source src='${state_url}' type='video/${video_type}'></video>`
    }
    else {
      doc_body = `<img src='${state_url}'>`
    }

    // Optional tint overlay drawn above the media. Resolved from the current
    // config, falling back to the root config — same pattern as opacity and
    // transparent_panel. `color` is any CSS color; `opacity` is 0..1.
    var overlay = current_config.overlay !== undefined
      ? current_config.overlay
      : (Animated_Config ? Animated_Config.overlay : null);
    var overlay_style = "";
    var overlay_html = "";
    if (overlay && (overlay.color || overlay.opacity != null)) {
      var overlay_color = overlay.color || "#000000";
      var overlay_opacity = overlay.opacity != null ? overlay.opacity : 0.3;
      overlay_style = `
        #overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: ${overlay_color};
          opacity: ${overlay_opacity};
          pointer-events: none;
        }`;
      overlay_html = `<div id='overlay'></div>`;
    }

    var source_doc = `
    <html>
    <head>
      <style type='text/css'>
        body {
          min-height: 100vh;
          min-width: 100vw;
          max-height: 100%;
          max-width: 100%;
          overflow: hidden;
          margin: 0;
          position: relative;
        }
    
        video {
          min-width: 100%;
          min-height: 100%;
          width: auto;
          height: auto;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        
        img {
          min-width: 100%;
          min-height: 100%;
          width: auto;
          height: auto;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        ${overlay_style}
      </style>
    </head>  
    <body id='source-body'>
    ${doc_body}
    ${overlay_html}
    </body>
    </html>`;
    // Style is (re)applied on every render, not just when the iframe is
    // first created, so per-view opacity changes take effect on navigation
    // without a page reload. Replace-in-place keeps this idempotent.
    var style = Root.shadowRoot.getElementById('animated-bg-style');
    var style_rules = `
      .bg-video{
          min-width: 100vw;
          min-height: 100vh;
      }

      #view {
          position: relative !important;
          z-index: 1 !important;
          background: none !important;
        }

      .bg-wrap{
          position: fixed;
          left: 0;
          top: 0;
          min-width: 100vw;
          min-height: 100vh;
          z-index: 0 !important;
          pointer-events: none;
      }

      #background-iframe{
          pointer-events: none;
      }

      hui-view-background{
          background:none;
      }
      `;

    // Only apply opacity if configured - note this creates a CSS stacking
    // context which may cause overlays (e.g. Bubble Card) to appear behind
    // the background. Remove opacity: from your config if this affects you.
    if (Opacity < 99) {
      // Computed numerically: concatenating after "0." turned single-digit
      // values (5) into ten times the intended opacity (0.5).
      var alpha = Math.min(99, Math.max(1, parseInt(Opacity, 10))) / 100;
      style_rules += `
      hui-masonry-view,
      hui-sections-view,
      hui-panel-view {
          opacity: ${alpha};
      }`;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = "animated-bg-style";
      style.innerHTML = style_rules;
      Root.shadowRoot.appendChild(style);
    } else if (style.innerHTML != style_rules) {
      style.innerHTML = style_rules;
    }

    if (!bg) {
      if (!current_config.entity) {
        STATUS_MESSAGE("Applying default background", true);
      }

// transparent for top Pannel
      var div = document.createElement("div");
      div.id = "background-video";
      div.className = "bg-wrap";
      // Built via element properties, not HTML interpolation: a double
      // quote in a URL or overlay color would truncate an interpolated
      // srcdoc attribute and blank the background with no diagnostic.
      var iframe = document.createElement("iframe");
      iframe.id = "background-iframe";
      iframe.className = "bg-video";
      iframe.setAttribute("frameborder", "0");
      iframe.style.pointerEvents = "none";
      iframe.srcdoc = source_doc;
      div.appendChild(iframe);

      Root.shadowRoot.appendChild(div);

      View.setAttribute ("style","background:none;");

      Previous_Url = state_url;
    }
    else {
      if (current_config.entity || (Previous_Url != state_url)) {
        if (!current_config.entity) {
          STATUS_MESSAGE("Applying default background", true);
          Previous_Entity = null;
          Previous_State = null;
        }
        bg.srcdoc = source_doc;
        Previous_Url = state_url;
      }
    }

    }  // <-- this closes the if (state_url != "" && Hui) block

  // transparent for top Panel - evaluated on every render
  // Reachable with Hui unresolved (e.g. provideHass during startup), so gate first.
  if (!Hui || !Hui.shadowRoot) return;
  // Fall back to root Animated_Config for top-level settings not present in group/view configs
  var transparent_panel = current_config.transparent_panel !== undefined ? current_config.transparent_panel : (Animated_Config ? Animated_Config.transparent_panel : false);
  if (transparent_panel) {
    if (!Hui.shadowRoot.getElementById('animated-bg-panel-style')) {
      var ha_style = document.createElement('style');
      ha_style.id = 'animated-bg-panel-style';
      ha_style.innerHTML = `
        .header {
          background-color: transparent !important;
        }
        .toolbar {
          background-color: transparent !important;
        }`;
      Hui.shadowRoot.appendChild(ha_style);
    }
  }
  else {
    var panelStyle = Hui.shadowRoot.getElementById('animated-bg-panel-style');
    if (panelStyle) panelStyle.remove();
  }
}

function urlIsVideo(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  // Normalize URL/path and ignore query strings/hash fragments.
  var clean_url = url.split("?")[0].split("#")[0].toLowerCase();
  var last_dot = clean_url.lastIndexOf(".");
  if (last_dot === -1) {
    return false;
  }

  var extension = clean_url.slice(last_dot + 1);
  if (extension === "mp4" || extension === "webm") {
    return extension;
  }

  return false;
}

//removes lovelace theme background
function removeDefaultBackground(node, current_config) {
  var background = 'transparent';
  if (current_config.background) {
    background = current_config.background;
  }
  if (node.style.background != background) {
    node.style.background = background;
  }
}

//restores lovelace theme background
function restoreDefaultBackground(node) {
  node.style.background = null;
}


//remove background every 100 milliseconds for 2 seconds because race condition memes
function processDefaultBackground(temp_enabled) {
  if (!Meme_Remover) {
    Meme_Remover = setInterval(() => {
      getVars();
      var current_config = currentConfig();

      var view_holder;
      var view_node = null;
      var view_node_panel = null;

      if (Root) {
        view_holder = Root.shadowRoot.getElementById("view");

        if (view_holder) {
          view_node_panel = view_holder.querySelector("hui-panel-view")
          view_node = view_holder.querySelector('hui-view');
        }

        if (view_node || view_node_panel) {
          //required because ios pre 13.4 bitches out if there is nullish coalescing operator ('??')
          var iphone_bullshit_fixer = view_node;
          if (!iphone_bullshit_fixer) {
            iphone_bullshit_fixer = view_node_panel;
          }
          if (temp_enabled) {
            removeDefaultBackground(iphone_bullshit_fixer, current_config);
            DEBUG_MESSAGE("Removing view background for configuration:", currentConfig(), true);
          }
          else {
            restoreDefaultBackground(iphone_bullshit_fixer);
            if (current_config && current_config.reason) {
              DEBUG_MESSAGE("Current config is disabled because " + current_config.reason, null, true);
            }
          }
          View_Loaded = true;
        }
      }
      Meme_Count++;
      if (Meme_Count > 20) {
        clearMemes();
        Meme_Count = 0;
      }

      Loaded = true;
    }, 100);
  }
}

function clearMemes() {
  clearInterval(Meme_Remover);
  Meme_Remover = null;
  Meme_Count = 0;
}

function clearRefreshTimer() {
  clearInterval(Refresh_Timer);
  Refresh_Timer = null;
  Refresh_Interval_Value = null;
}

function setDebugMode() {
  if (Animated_Config) {
    if (Animated_Config.debug) {
      Debug_Mode = Animated_Config.debug;
      if (Animated_Config.display_user_agent) {
        if (Animated_Config.display_user_agent == true) {
          alert(navigator.userAgent);
        }
      }
    }
    else {
      Debug_Mode = false;
    }
  }
  else {
    Debug_Mode = false;
  }
}

function cleanupDOM() {
  if (Root && Root.shadowRoot) {
    var oldDiv = Root.shadowRoot.getElementById('background-video');
    if (oldDiv) oldDiv.remove();
    // Remove only our own style element. The shadow root also holds Home
    // Assistant's stylesheets (and card-mod's) - those must survive.
    var ownStyle = Root.shadowRoot.getElementById('animated-bg-style');
    if (ownStyle) ownStyle.remove();
  }
  if (Hui && Hui.shadowRoot) {
    var panelStyle = Hui.shadowRoot.getElementById('animated-bg-panel-style');
    if (panelStyle) panelStyle.remove();
  }
}

//main function
function run() {
  getVars();
  setDebugMode();
  STATUS_MESSAGE("Starting");
  DEBUG_MESSAGE("Starting, Debug mode enabled");
  if (!Loaded) {
    if (!currentConfig()) {
      if (Debug_Mode) {
        DEBUG_MESSAGE("No configuration found");
      }
      else {
        STATUS_MESSAGE("No configuration found");
      }
    }
  }

  //subscribe to hass object to detect state changes
  if (!Haobj) {
    var ha_el = document.querySelector("home-assistant");
    if (!ha_el) {
      // run() fires at load, possibly before Home Assistant mounts.
      // restart()'s poll loop waits for exactly this.
      restart();
      return;
    }
    ha_el.provideHass({
      set hass(value) {
        if (Haobj && Haobj.panelUrl != value.panelUrl) {
          restart();
        }
        Haobj = value;
        var current_config = currentConfig();
        if (Loaded) {
          if (current_config && current_config.entity) {
            var current_state = getEntityState(current_config.entity);
            var entity_data = Haobj.states[current_config.entity];
            var current_last_updated = entity_data ? entity_data.last_updated : null;
            var state_changed = Previous_State != current_state;
            // root fallback here too: refresh_on_update set at root must
            // reach group-driven views, not just root-config views
            var refresh_on_update = current_config.refresh_on_update !== undefined
              ? current_config.refresh_on_update
              : (Animated_Config ? Animated_Config.refresh_on_update : false);
            var force_refresh = refresh_on_update && current_last_updated !== Previous_Last_Updated;
            if (state_changed || force_refresh) {
              if (force_refresh && !state_changed) {
                Previous_State = null;
              }
              clearMemes();
              renderBackgroundHTML();
            }
          }

        }
        else {
          renderBackgroundHTML();
        }
      }
    });
  }
  else {
    if (!Loaded) {
      renderBackgroundHTML();
    }
  }

  if (!View) {
    restart();
    return;
  }

  View_Observer.observe(View, {
    characterData: true,
    childList: true,
    subtree: true,
    characterDataOldValue: true
  });

  Hui_Observer.disconnect();
  Hui_Observer.observe(Hui, {
    characterData: true,
    childList: true,
    subtree: true,
    characterDataOldValue: true
  });

  Panel_Observer.disconnect();
  Panel_Observer.observe(Panel_Holder, {
    characterData: true,
    childList: true,
    subtree: true,
    characterDataOldValue: true
  });
}

function restart() {
  cleanupDOM();
  clearRefreshTimer();
  if (Wait_Interval) {
    clearInterval(Wait_Interval);
    Wait_Interval = null;
  }
  Wait_Interval = setInterval(() => {
    getVars()
    if (Hui) {
      Previous_Entity = null;
      Previous_State = null;
      Previous_Last_Updated = null;
      Loaded = false;
      View_Loaded = false;
      clearMemes();
      View_Observer.disconnect();
      run();
      clearInterval(Wait_Interval);
      Wait_Interval = null;
    }
  }, 200);
}

// Guard against double registration (e.g. a leftover /local/ resource plus
// the /hacsfiles/ one): two copies would run competing observers and render
// loops on the same DOM.
if (window.__animatedBackgroundLoaded) {
  console.warn(Log_Prefix + "already loaded; ignoring duplicate resource registration.");
} else {
  window.__animatedBackgroundLoaded = true;
  run();
}


// ======================================================================
// Visual Configuration Editor
//
// Registers a `custom:animated-background-editor` card. Place it on any
// view of the dashboard you want to configure. It reads the dashboard's
// root `animated_background:` config, lets you edit it in a form, and
// saves it back through hui-root's lovelace.saveConfig(). On YAML-mode
// dashboards (where saveConfig is unavailable) it instead shows the
// generated YAML block to copy into your configuration file.
//
// Implementation rules (see docs/EDITOR_IMPLEMENTATION_GUIDE.md):
// - No Lit. Plain DOM plus HA's globally-registered custom elements,
//   guarded with customElements.get() so a rename degrades, not breaks.
// - A registration failure must never stop the background from
//   rendering (defineEditor() is wrapped in try/catch below).
// - The editor only touches the root `animated_background:` key and the
//   `animated_background:` key on view definitions. Saves are merges
//   over the original parsed config, so hand-written keys the editor
//   does not know about survive a round-trip.
// ======================================================================
(function () {
  "use strict";

  if (window.__animatedBackgroundEditorLoaded) {
    return;
  }
  window.__animatedBackgroundEditorLoaded = true;

  var KNOWN_DEVICES = ["iphone", "ipad", "windows", "macintosh", "android"];

  // -------------------- pure helpers (also used by the smoke tests) ----

  function splitLines(text) {
    return String(text == null ? "" : text)
      .split("\n")
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });
  }

  // textarea content -> string | string[] | undefined (undefined = remove key)
  function linesToUrlValue(text) {
    var lines = splitLines(text);
    if (lines.length === 0) return undefined;
    if (lines.length === 1) return lines[0];
    return lines;
  }

  // config value -> textarea content
  function urlValueToLines(value) {
    if (value == null) return "";
    if (Array.isArray(value)) return value.join("\n");
    return String(value);
  }

  // "a, b\nc" -> ["a", "b", "c"]
  function textToList(text) {
    return String(text == null ? "" : text)
      .split(/[\n,]/)
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });
  }

  function listToText(value) {
    if (Array.isArray(value)) return value.join(", ");
    if (value == null) return "";
    return String(value);
  }

  function stateMapToRows(map) {
    return Object.keys(map || {}).map(function (key) {
      return { state: key, urls: urlValueToLines(map[key]) };
    });
  }

  // state rows -> state_url map, or undefined when nothing is filled in
  function rowsToStateMap(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      var key = String(row.state || "").trim();
      var value = linesToUrlValue(row.urls);
      if (key && value !== undefined) {
        map[key] = value;
      }
    });
    return Object.keys(map).length > 0 ? map : undefined;
  }

  function parseOpacity(text) {
    var parsed = parseFloat(text);
    return isNaN(parsed) ? null : Math.min(1, Math.max(0, parsed));
  }

  // set key to value, or delete the key when value is undefined — a save
  // must never write an empty/default value into the config
  function setOrRemove(obj, key, value) {
    if (value === undefined) delete obj[key];
    else obj[key] = value;
  }

  // -------------------- sub-form <-> sub-config ------------------------

  // Sub-configs (groups and per-view config blocks) support the same
  // option set as the root, minus views, groups, debug and
  // display_user_agent (meaningfully root-only).
  function subFormFromConfig(cfg) {
    cfg = cfg || {};
    var overlay = cfg.overlay || {};
    return {
      entity: cfg.entity || "",
      default_url: urlValueToLines(cfg.default_url),
      states: stateMapToRows(cfg.state_url),
      background: cfg.background != null ? String(cfg.background) : "",
      transparent_panel: !!cfg.transparent_panel,
      opacity: cfg.opacity != null ? String(cfg.opacity) : "",
      overlay_enabled: !!cfg.overlay,
      overlay_color: overlay.color || "#000000",
      overlay_opacity: overlay.opacity != null ? String(overlay.opacity) : "0.3",
      refresh_interval: cfg.refresh_interval != null ? String(cfg.refresh_interval) : "",
      refresh_on_update: !!cfg.refresh_on_update,
      included_users: listToText(cfg.included_users),
      excluded_users: listToText(cfg.excluded_users),
      included_devices: (cfg.included_devices || []).slice(),
      excluded_devices: (cfg.excluded_devices || []).slice()
    };
  }

  // editable sub-form -> sub-config. Merge over the original parsed
  // config so hand-written keys the editor does not model survive a save
  // (guide §3.3). Returns null when the result would be empty.
  function subConfigFromForm(sf, original) {
    if (!sf) return null;
    var cfg = original ? JSON.parse(JSON.stringify(original)) : {};

    setOrRemove(cfg, "entity", String(sf.entity || "").trim() || undefined);
    setOrRemove(cfg, "default_url", linesToUrlValue(sf.default_url));
    setOrRemove(cfg, "state_url", rowsToStateMap(sf.states));
    setOrRemove(cfg, "background", String(sf.background || "").trim() || undefined);

    var opacity = parseInt(sf.opacity, 10);
    setOrRemove(cfg, "opacity",
      !isNaN(opacity) && opacity > 0 && opacity < 100 ? opacity : undefined);

    if (sf.overlay_enabled) {
      var overlay = cfg.overlay && typeof cfg.overlay === "object" && !Array.isArray(cfg.overlay)
        ? cfg.overlay : {};
      overlay.color = String(sf.overlay_color || "#000000");
      var parsed = parseOpacity(sf.overlay_opacity);
      overlay.opacity = parsed != null ? parsed : 0.3;
      cfg.overlay = overlay;
    } else {
      delete cfg.overlay;
    }

    if (sf.transparent_panel) cfg.transparent_panel = true;
    else delete cfg.transparent_panel;

    var refresh_interval = parseInt(sf.refresh_interval, 10);
    setOrRemove(cfg, "refresh_interval",
      !isNaN(refresh_interval) && refresh_interval > 0 ? refresh_interval : undefined);

    if (sf.refresh_on_update) cfg.refresh_on_update = true;
    else delete cfg.refresh_on_update;

    var included_users = textToList(sf.included_users);
    setOrRemove(cfg, "included_users", included_users.length ? included_users : undefined);
    var excluded_users = textToList(sf.excluded_users);
    setOrRemove(cfg, "excluded_users", excluded_users.length ? excluded_users : undefined);
    setOrRemove(cfg, "included_devices", (sf.included_devices || []).length ? sf.included_devices.slice() : undefined);
    setOrRemove(cfg, "excluded_devices", (sf.excluded_devices || []).length ? sf.excluded_devices.slice() : undefined);

    return Object.keys(cfg).length > 0 ? cfg : null;
  }

  // -------------------- root form <-> root config ----------------------

  // View identity: match on `path` when the view has one, on array
  // position otherwise — the SAME rule at read and write time (guide
  // §2.5), so group/none assignments work on path-less views.
  function viewIdentity(view, index) {
    return view && view.path != null ? String(view.path) : String(index);
  }

  // root config + lovelace views -> full editable form
  function formFromConfig(cfg, lovelaceViews) {
    cfg = cfg || {};
    var overlay = cfg.overlay || {};

    // every root views: entry, keyed by path — both custom configs and
    // legacy assignment entries
    var entriesByPath = {};
    (cfg.views || []).forEach(function (entry) {
      if (entry && entry.path != null) entriesByPath[String(entry.path)] = entry;
    });

    var seen = {};
    var views = [];
    (lovelaceViews || []).forEach(function (view, index) {
      var identity = viewIdentity(view, index);
      seen[identity] = true;
      var entry = entriesByPath[identity];
      var assignment = view.animated_background;
      var mode = "inherit";
      var group = "";
      var custom = null;
      if (entry && entry.config) {
        mode = "custom";
        custom = subFormFromConfig(entry.config);
      } else if (entry && entry.animated_background === "none") {
        mode = "none";
      } else if (entry && typeof entry.animated_background === "string" && entry.animated_background) {
        mode = "group";
        group = entry.animated_background;
      } else if (assignment === "none") {
        mode = "none";
      } else if (typeof assignment === "string" && assignment) {
        mode = "group";
        group = assignment;
      }
      views.push({
        path: identity,
        title: view.title || "",
        mode: mode,
        group: group,
        orphan: false,
        custom: custom || subFormFromConfig(null)
      });
    });
    // root `views:` entries that no longer match a dashboard view. Shown,
    // flagged and removable — never silently dropped (guide §5).
    Object.keys(entriesByPath).forEach(function (path) {
      if (seen[path]) return;
      var entry = entriesByPath[path];
      var mode = "custom";
      var group = "";
      var custom = entry.config ? subFormFromConfig(entry.config) : null;
      if (!custom) {
        if (entry.animated_background === "none") {
          mode = "none";
        } else if (typeof entry.animated_background === "string" && entry.animated_background) {
          mode = "group";
          group = entry.animated_background;
        } else {
          custom = subFormFromConfig(null);
        }
      }
      views.push({
        path: path,
        title: "(view not found in dashboard)",
        mode: mode,
        group: group,
        orphan: true,
        custom: custom || subFormFromConfig(null)
      });
    });

    var groups = (cfg.groups || []).map(function (group) {
      return {
        name: (group && group.name) || "",
        custom: subFormFromConfig(group && group.config)
      };
    });

    var opacity = cfg.opacity;
    return {
      enabled: cfg.enabled !== false,
      default_url: urlValueToLines(cfg.default_url),
      background: cfg.background != null ? String(cfg.background) : "",
      entity: cfg.entity || "",
      states: stateMapToRows(cfg.state_url),
      transparent_panel: !!cfg.transparent_panel,
      opacity: opacity != null ? String(opacity) : "",
      overlay_enabled: !!cfg.overlay,
      overlay_color: overlay.color || "#000000",
      overlay_opacity: overlay.opacity != null ? String(overlay.opacity) : "0.3",
      refresh_interval: cfg.refresh_interval != null ? String(cfg.refresh_interval) : "",
      refresh_on_update: !!cfg.refresh_on_update,
      included_users: listToText(cfg.included_users),
      excluded_users: listToText(cfg.excluded_users),
      included_devices: (cfg.included_devices || []).slice(),
      excluded_devices: (cfg.excluded_devices || []).slice(),
      debug: !!cfg.debug,
      display_user_agent: !!cfg.display_user_agent,
      views: views,
      groups: groups
    };
  }

  // full form -> { animated_background, assignments }. Merge over the
  // original parsed root config (guide §3.3). assignments maps dashboard
  // view identity -> group name | "none" | undefined (undefined = remove
  // the view-level key so the view inherits root/groups).
  function configFromForm(form, original) {
    var cfg = original ? JSON.parse(JSON.stringify(original)) : {};
    var assignments = {};

    // original custom view configs, for per-view merges
    var originalByPath = {};
    var originalAssignmentEntries = {};
    ((original || {}).views || []).forEach(function (entry) {
      if (!entry || entry.path == null) return;
      var path = String(entry.path);
      if (entry.config) originalByPath[path] = entry.config;
      else originalAssignmentEntries[path] = entry;
    });

    if (form.enabled) delete cfg.enabled;
    else cfg.enabled = false;

    setOrRemove(cfg, "default_url", linesToUrlValue(form.default_url));
    setOrRemove(cfg, "entity", String(form.entity || "").trim() || undefined);
    setOrRemove(cfg, "state_url", rowsToStateMap(form.states));
    setOrRemove(cfg, "background", String(form.background || "").trim() || undefined);

    var opacity = parseInt(form.opacity, 10);
    setOrRemove(cfg, "opacity",
      !isNaN(opacity) && opacity > 0 && opacity < 100 ? opacity : undefined);

    if (form.overlay_enabled) {
      var overlay = cfg.overlay && typeof cfg.overlay === "object" && !Array.isArray(cfg.overlay)
        ? cfg.overlay : {};
      overlay.color = String(form.overlay_color || "#000000");
      var parsed = parseOpacity(form.overlay_opacity);
      overlay.opacity = parsed != null ? parsed : 0.3;
      cfg.overlay = overlay;
    } else {
      delete cfg.overlay;
    }

    if (form.transparent_panel) cfg.transparent_panel = true;
    else delete cfg.transparent_panel;

    var refresh_interval = parseInt(form.refresh_interval, 10);
    setOrRemove(cfg, "refresh_interval",
      !isNaN(refresh_interval) && refresh_interval > 0 ? refresh_interval : undefined);

    if (form.refresh_on_update) cfg.refresh_on_update = true;
    else delete cfg.refresh_on_update;

    var included_users = textToList(form.included_users);
    setOrRemove(cfg, "included_users", included_users.length ? included_users : undefined);
    var excluded_users = textToList(form.excluded_users);
    setOrRemove(cfg, "excluded_users", excluded_users.length ? excluded_users : undefined);
    setOrRemove(cfg, "included_devices", (form.included_devices || []).length ? form.included_devices.slice() : undefined);
    setOrRemove(cfg, "excluded_devices", (form.excluded_devices || []).length ? form.excluded_devices.slice() : undefined);

    if (form.debug) cfg.debug = true;
    else delete cfg.debug;
    if (form.display_user_agent) cfg.display_user_agent = true;
    else delete cfg.display_user_agent;

    // views: custom configs rebuild the root views: list; group/none go
    // onto the dashboard view definitions — except stale paths, which
    // have no dashboard view to receive them and are preserved in place
    var customViews = [];
    var staleAssignmentEntries = [];
    (form.views || []).forEach(function (view) {
      var path = String(view.path || "").trim();
      if (!path) return;
      if (view.mode === "custom") {
        var config = subConfigFromForm(view.custom, originalByPath[path]);
        if (config) customViews.push({ path: path, config: config });
      } else if (view.mode === "group") {
        var group = String(view.group || "").trim();
        if (group) {
          if (view.orphan) {
            staleAssignmentEntries.push({ path: path, animated_background: group });
          } else {
            assignments[path] = group;
          }
        }
      } else if (view.mode === "none") {
        if (view.orphan) staleAssignmentEntries.push({ path: path, animated_background: "none" });
        else assignments[path] = "none";
      } else {
        assignments[path] = undefined; // inherit: remove the view-level key
      }
    });
    if (customViews.length || staleAssignmentEntries.length) {
      cfg.views = customViews.concat(staleAssignmentEntries);
    } else {
      delete cfg.views;
    }

    var groups = [];
    (form.groups || []).forEach(function (group) {
      var name = String(group.name || "").trim();
      var originalGroup = ((original || {}).groups || []).filter(function (g) {
        return g && g.name === name;
      })[0];
      var config = subConfigFromForm(group.custom, originalGroup && originalGroup.config);
      if (name && config) groups.push({ name: name, config: config });
    });
    if (groups.length) cfg.groups = groups;

    return { animated_background: cfg, assignments: assignments };
  }

  // -------------------- minimal YAML serializer ------------------------

  function yamlScalar(value) {
    if (typeof value === "number" && isFinite(value)) return String(value);
    if (typeof value === "boolean") return String(value);
    return "'" + String(value).replace(/'/g, "''") + "'";
  }

  function yamlMapLines(obj, indent) {
    var pad = new Array(indent + 1).join(" ");
    return Object.keys(obj)
      .filter(function (key) { return obj[key] !== undefined; })
      .map(function (key) {
        return pad + String(key) + ":" + yamlBlock(obj[key], indent);
      })
      .join("\n");
  }

  function yamlBlock(value, indent) {
    if (value === null || value === undefined) return " null";
    if (typeof value !== "object") return " " + yamlScalar(value);
    var pad = new Array(indent + 1).join(" ");
    if (Array.isArray(value)) {
      if (value.length === 0) return " []";
      return "\n" + value.map(function (item) {
        if (item && typeof item === "object") {
          var inner = yamlMapLines(item, indent + 2);
          return pad + "- " + inner.slice(indent + 2);
        }
        return pad + "- " + yamlScalar(item);
      }).join("\n");
    }
    var keys = Object.keys(value).filter(function (key) { return value[key] !== undefined; });
    if (keys.length === 0) return " {}";
    return "\n" + yamlMapLines(value, indent + 2);
  }

  // Serializes the complete `animated_background:` block INCLUDING the
  // root key, so the output pastes into configuration.yaml verbatim
  // (guide §2.3).
  function configToYaml(cfg) {
    var keys = Object.keys(cfg || {}).filter(function (key) { return cfg[key] !== undefined; });
    if (!keys.length) return "# animated_background is empty\n";
    return yamlMapLines({ animated_background: cfg }, 0) + "\n";
  }

  // build the YAML snippet users must add to view definitions when the
  // editor cannot write view-level assignments itself (YAML dashboards)
  function assignmentsToYaml(assignments) {
    var paths = Object.keys(assignments || {}).filter(function (path) {
      return assignments[path] !== undefined;
    });
    if (!paths.length) return "";
    return "\n# Also set this on the matching view definitions in your dashboard:\n" +
      paths.map(function (path) {
        return "# - path: " + yamlScalar(path) + "\n#   animated_background: " + yamlScalar(assignments[path]);
      }).join("\n") + "\n";
  }

  // -------------------- lovelace / hass access -------------------------

  function getLovelace() {
    try {
      var node = document.querySelector("home-assistant");
      node = node && node.shadowRoot;
      node = node && node.querySelector("home-assistant-main");
      node = node && node.shadowRoot;
      node = node && node.querySelector("app-drawer-layout partial-panel-resolver, ha-drawer partial-panel-resolver");
      node = (node && node.shadowRoot) || node;
      node = node && node.querySelector && node.querySelector("ha-panel-lovelace");
      node = node && node.shadowRoot;
      node = node && node.querySelector("hui-root");
      return node ? node.lovelace : null;
    } catch (err) {
      return null;
    }
  }

  function getHass() {
    try {
      var ha = document.querySelector("home-assistant");
      return ha && ha.hass ? ha.hass : null;
    } catch (err) {
      return null;
    }
  }

  // clipboard with a fallback for non-secure origins (plain-HTTP LAN
  // installs have no navigator.clipboard — guide §2.6)
  function copyText(text, done) {
    var fallback = function () {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch (err) {
        return false;
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { done(fallback()); });
    } else {
      done(fallback());
    }
  }

  // -------------------- DOM builders ------------------------------------

  // property-backed element factory: value/checked/disabled go through
  // properties (setAttribute("checked", "") semantics differ), listeners
  // via on*, everything else via attributes
  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "value" || k === "checked" || k === "disabled" ||
                 k === "selected" || k === "min" || k === "max" || k === "step" ||
                 k === "type" || k === "placeholder" || k === "for") {
          if (k in node) node[k] = v;
          else node.setAttribute(k, v === true ? "" : v);
        } else if (k.slice(0, 2) === "on" && typeof v === "function") {
          node.addEventListener(k.slice(2), v);
        } else {
          node.setAttribute(k, v === true ? "" : v);
        }
      });
    }
    // children may be an array, a single node/string, or varargs —
    // callers use all three styles
    var kids = children === undefined || children === null
      ? []
      : (Array.isArray(children) ? children : Array.prototype.slice.call(arguments, 2));
    kids.forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function styleNode() {
    var style = document.createElement("style");
    style.textContent = [
      ":host { display: block; }",
      ".head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }",
      ".title { font-weight: 600; }",
      ".tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }",
      ".tabs button { border: 1px solid var(--divider-color, #ccc); background: transparent; color: var(--primary-text-color, #111); border-radius: 16px; padding: 4px 12px; cursor: pointer; font-size: 13px; }",
      ".tabs button[active] { background: var(--primary-color, #03a9f4); border-color: var(--primary-color, #03a9f4); color: var(--text-on-primary-color, #fff); }",
      ".row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }",
      ".row > label:first-child { min-width: 170px; font-size: 13px; }",
      ".grow { flex: 1; min-width: 200px; }",
      "input[type=text], input[type=number], textarea, select { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--divider-color, #ccc); border-radius: 4px; background: var(--card-background-color, #fff); color: var(--primary-text-color, #111); font: inherit; }",
      "ha-textfield { width: 100%; }",
      "ha-textfield.grow { flex: 1; min-width: 200px; }",
      "textarea { min-height: 54px; resize: vertical; }",
      "textarea.urls { font-family: var(--code-font-family, monospace); font-size: 12px; }",
      ".check { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 4px 0; }",
      ".section { border-top: 1px solid var(--divider-color, #eee); margin-top: 12px; padding-top: 8px; }",
      ".section h4 { margin: 4px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; }",
      ".hint { font-size: 12px; opacity: 0.7; margin: 2px 0 8px; }",
      ".sub { border: 1px solid var(--divider-color, #ccc); border-radius: 8px; padding: 8px; margin: 8px 0; }",
      ".actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; align-items: center; }",
      "button.primary, button.small { cursor: pointer; font: inherit; border-radius: 4px; }",
      "button.primary { background: var(--primary-color, #03a9f4); color: var(--text-on-primary-color, #fff); border: none; padding: 8px 18px; }",
      "button.small { background: transparent; border: 1px solid var(--divider-color, #ccc); color: var(--primary-text-color, #111); padding: 2px 8px; font-size: 12px; }",
      ".status { font-size: 12px; opacity: 0.8; }",
      ".warn { color: var(--warning-color, #ffa600); font-size: 12px; margin: 4px 0; }",
      ".error { color: var(--error-color, #db4437); font-size: 12px; margin: 4px 0; }",
      ".devchips { display: flex; flex-wrap: wrap; gap: 10px; }",
      ".devchips label { min-width: 0; display: flex; align-items: center; gap: 4px; font-size: 13px; }",
      "pre.yaml { background: var(--secondary-background-color, #f5f5f5); padding: 10px; border-radius: 6px; overflow: auto; font-size: 12px; max-height: 420px; }",
      "details.more { margin: 8px 0; }",
      "details.more summary { cursor: pointer; font-size: 13px; opacity: 0.8; }",
      "ha-select { width: 100%; max-width: 320px; }"
    ].join("\n");
    return style;
  }

  // -------------------- the card ----------------------------------------

  function defineEditor() {
    if (customElements.get("animated-background-editor")) return;

    var EditorVersion = "v1.1.1";

    class AnimatedBackgroundEditor extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._tab = "general";
        this._dirty = false;
        this._status = "";
        this._error = "";
        this._yamlOut = "";
        this._warnings = [];
        this._form = formFromConfig(null, null);
        this._lovelace = null;
        this._hass = null;
      }

      connectedCallback() {
        this._reload();
      }

      setConfig() {
        // this card is not configured through card YAML
      }

      getCardSize() {
        return 8;
      }

      getGridOptions() {
        return { rows: 12, columns: 12, min_rows: 6, min_columns: 6 };
      }

      // -------------------- state ------------------------------

      _reload() {
        this._lovelace = getLovelace();
        this._hass = getHass();
        var config = this._lovelace && this._lovelace.config
          ? this._lovelace.config.animated_background : null;
        var views = this._lovelace && this._lovelace.config
          && Array.isArray(this._lovelace.config.views) ? this._lovelace.config.views : [];
        this._form = formFromConfig(config, views);
        this._dirty = false;
        this._yamlOut = "";
        this._warnings = [];
        this._error = "";
        this._status = "";
        this._render();
      }

      _update(mutator) {
        mutator(this._form);
        this._dirty = true;
        this._render();
      }

      _canWrite() {
        // saveConfig requires an admin user (guide §2.6)
        var hass = this._hass;
        if (hass && hass.user && hass.user.is_admin === false) return false;
        return !!(this._lovelace && typeof this._lovelace.saveConfig === "function");
      }

      _isYamlMode() {
        return !(this._lovelace && typeof this._lovelace.saveConfig === "function");
      }

      _isUncontrolled() {
        var ll = this._lovelace;
        if (!ll) return true;
        if (ll.mode === "generated") return true;
        return !(ll.config && Array.isArray(ll.config.views));
      }

      _validate(form) {
        var warnings = [];
        if (form.entity && !rowsToStateMap(form.states)) {
          warnings.push("An entity is set but no state URLs are configured, so the default URL will always be used.");
        }
        if (!form.entity && !splitLines(form.default_url).length) {
          warnings.push("No default URL and no entity configured.");
        }
        var opacity = parseInt(form.opacity, 10);
        if (form.opacity !== "" && (isNaN(opacity) || opacity < 1 || opacity > 99)) {
          warnings.push("Opacity should be between 1 and 99, or empty to disable.");
        }
        var overlayOpacity = parseOpacity(form.overlay_opacity);
        if (form.overlay_enabled && overlayOpacity == null) {
          warnings.push("Overlay opacity should be a number between 0 and 1.");
        }
        var paths = {};
        (form.views || []).forEach(function (view) {
          var path = String(view.path || "").trim();
          if (path && paths[path] && view.mode === "custom") {
            warnings.push("More than one custom background is defined for view path '" + path + "'.");
          }
          paths[path] = true;
        });
        var names = {};
        var groupNames = {};
        (form.groups || []).forEach(function (group) {
          var name = String(group.name || "").trim();
          if (name && names[name]) warnings.push("Duplicate group name '" + name + "'.");
          if (name) groupNames[name] = true;
          names[name] = true;
        });
        (form.views || []).forEach(function (view) {
          if (view.mode === "group") {
            var group = String(view.group || "").trim();
            if (group && !groupNames[group]) {
              warnings.push("View '" + view.path + "' uses group '" + group + "', which is not defined in the Groups tab.");
            }
          }
        });
        // overlay/opacity warnings on custom sub-forms and groups
        var checkSub = function (label, sf) {
          if (!sf) return;
          var subOpacity = parseInt(sf.opacity, 10);
          if (sf.opacity !== "" && (isNaN(subOpacity) || subOpacity < 1 || subOpacity > 99)) {
            warnings.push(label + ": opacity should be between 1 and 99, or empty.");
          }
          if (sf.overlay_enabled && parseOpacity(sf.overlay_opacity) == null) {
            warnings.push(label + ": overlay opacity should be a number between 0 and 1.");
          }
        };
        (form.views || []).forEach(function (view) {
          if (view.mode === "custom") checkSub("View '" + view.path + "'", view.custom);
        });
        (form.groups || []).forEach(function (group) {
          checkSub("Group '" + (group.name || "?") + "'", group.custom);
        });
        return warnings;
      }

      _buildYaml() {
        var original = this._lovelace && this._lovelace.config
          ? this._lovelace.config.animated_background : null;
        var built = configFromForm(this._form, original);
        return configToYaml(built.animated_background)
          + assignmentsToYaml(built.assignments);
      }

      async _save() {
        this._error = "";
        this._warnings = this._validate(this._form);

        if (this._isUncontrolled()) {
          this._yamlOut = this._buildYaml();
          this._status = "";
          this._error = "This dashboard has not been taken control of yet, so there is no stored configuration to write to. Edit the dashboard once and confirm Home Assistant's take-control prompt, then save here.";
          this._render();
          return;
        }

        if (!this._canWrite()) {
          this._yamlOut = this._buildYaml();
          this._status = "";
          this._error = this._isYamlMode()
            ? "This dashboard is YAML-mode: copy the generated block into your configuration file. View assignments are included as comments."
            : "Saving requires an administrator account. Copy the generated YAML instead, or sign in as an admin.";
          this._render();
          return;
        }

        var built = configFromForm(this._form, this._lovelace.config.animated_background);
        var newConfig = JSON.parse(JSON.stringify(this._lovelace.config));
        if (Object.keys(built.animated_background).length > 0) {
          newConfig.animated_background = built.animated_background;
        } else {
          delete newConfig.animated_background;
        }
        // same identity rule as the read path: path when the view has
        // one, array position otherwise (guide §2.5)
        newConfig.views = (newConfig.views || []).map(function (view, index) {
          var identity = viewIdentity(view, index);
          if (!(identity in built.assignments)) return view;
          var copy = Object.assign({}, view);
          var assignment = built.assignments[identity];
          if (assignment === undefined) {
            delete copy.animated_background;
          } else {
            copy.animated_background = assignment;
          }
          return copy;
        });

        try {
          await this._lovelace.saveConfig(newConfig);
        } catch (err) {
          this._status = "";
          this._error = "Save failed: " + (err && err.message ? err.message : err);
          this._render();
          return;
        }

        // reset ALL render state before redrawing, so an overlay or
        // background edit on an entity-less config rebuilds the iframe
        // instead of showing stale pixels (guide §2.4)
        try {
          getVars();
          Previous_Config = null;
          Previous_Url = null;
          Previous_State = null;
          Previous_Entity = null;
          Previous_Last_Updated = null;
          clearMemes();
          clearRefreshTimer();
          renderBackgroundHTML();
        } catch (err) {
          // the save succeeded; a redraw hiccup must not report failure
        }

        this._yamlOut = "";
        this._dirty = false;
        this._status = "Saved " + new Date().toLocaleTimeString();
        this._render();
      }

      _copyYaml() {
        var self = this;
        var text = this._yamlOut || this._buildYaml();
        copyText(text, function (ok) {
          self._status = ok ? "YAML copied to clipboard"
            : "Copy failed — select the YAML text manually";
          self._render();
        });
      }

      // -------------------- control factories ------------------

      _textField(value, opts, onchange) {
        var handler = function (e) { onchange(e.target.value); };
        var HaText = customElements.get("ha-textfield");
        // ha-textfield where available, native input otherwise; every
        // supplied option is applied as a property/attribute so min, max
        // and step reach the element too, not just type and placeholder
        var input = document.createElement(HaText ? "ha-textfield" : "input");
        input.value = value == null ? "" : String(value);
        ["type", "placeholder", "min", "max", "step"].forEach(function (k) {
          var v = opts ? opts[k] : null;
          if (v == null) return;
          if (k in input) input[k] = v;
          else input.setAttribute(k, v);
        });
        input.addEventListener("change", handler);
        return input;
      }

      _numberField(value, opts, onchange) {
        return this._textField(value, Object.assign({ type: "number" }, opts), onchange);
      }

      _area(value, cls, placeholder, onchange) {
        return h("textarea", {
          class: cls, value: value == null ? "" : String(value),
          placeholder: placeholder || "",
          onchange: function (e) { onchange(e.target.value); }
        });
      }

      _check(checked, label, onchange) {
        var HaSwitch = customElements.get("ha-switch");
        var control;
        if (HaSwitch) {
          control = document.createElement("ha-switch");
          control.checked = !!checked;
          control.addEventListener("change", function (e) { onchange(e.target.checked); });
        } else {
          control = h("input", {
            type: "checkbox", checked: !!checked,
            onchange: function (e) { onchange(e.target.checked); }
          });
        }
        return h("label", { class: "check" }, control, label);
      }

      // value is set in exactly one place — on the select — never on the
      // options, so re-renders cannot fight the selected state (§2.6)
      _select(value, options, onchange) {
        var HaSelect = customElements.get("ha-select");
        if (HaSelect) {
          var sel = document.createElement("ha-select");
          // HA 2026.2 rewrote ha-select from mwc to a ha-dropdown base: it
          // fires "selected" (new value in detail.value) instead of
          // "change", never updates its own value property, and its menu
          // only reacts to ha-dropdown-item children. Older builds are
          // mwc-based and need ha-list-item + "change".
          var modern = !!customElements.get("ha-dropdown-item");
          var itemTag = modern ? "ha-dropdown-item" : "ha-list-item";
          options.forEach(function (o) {
            var item = document.createElement(itemTag);
            item.value = o[0];
            item.textContent = o[1];
            if (modern && o[0] === value) item.selected = true;
            sel.appendChild(item);
          });
          sel.value = value;
          // mwc resolves value against its rendered item list during its
          // own upgrade; re-assert after so the assignment cannot be lost
          if (sel.updateComplete && typeof sel.updateComplete.then === "function") {
            sel.updateComplete.then(function () { sel.value = value; });
          }
          if (modern) {
            sel.addEventListener("selected", function (e) {
              var next = e.detail && e.detail.value !== undefined
                ? e.detail.value
                : e.target.value;
              if (next === value) return; // initial sync / same-value pick
              onchange(next);
            });
          } else {
            sel.addEventListener("change", function (e) { onchange(e.target.value); });
          }
          // mwc's menu "closed" event bubbles composed and can be mistaken
          // for a dialog dismissal by an ancestor; HA stops it too
          sel.addEventListener("closed", function (e) { e.stopPropagation(); });
          return sel;
        }
        var native = document.createElement("select");
        options.forEach(function (o) {
          var opt = document.createElement("option");
          opt.value = o[0];
          opt.textContent = o[1];
          native.appendChild(opt);
        });
        native.value = value;
        native.addEventListener("change", function (e) { onchange(e.target.value); });
        return native;
      }

      _entityPicker(value, onchange) {
        var self = this;
        var HaPicker = customElements.get("ha-entity-picker");
        if (HaPicker && this._hass) {
          var picker = document.createElement("ha-entity-picker");
          picker.hass = this._hass;
          picker.value = value || "";
          picker.allowCustomEntity = true;
          picker.addEventListener("value-changed", function (e) {
            onchange(e.detail && e.detail.value ? e.detail.value : "");
          });
          return picker;
        }
        var listId = "abe-entity-list";
        var entities = this._hass ? Object.keys(this._hass.states).sort() : [];
        var datalist = h("datalist", { id: listId },
          entities.map(function (id) { return h("option", { value: id }); }));
        var input = this._textField(value, { placeholder: "e.g. weather.home" }, onchange);
        input.setAttribute("list", listId);
        return h("span", { class: "grow", style: "display:flex;flex-direction:column" }, input, datalist);
      }

      _row(labelText, control, hint) {
        var kids = [];
        if (labelText) kids.push(h("label", {}, labelText));
        kids.push(control);
        var row = h("div", { class: "row" }, kids);
        if (hint) row.appendChild(h("div", { class: "hint", style: "flex-basis:100%" }, hint));
        return row;
      }

      // -------------------- sub-form ----------------------------

      // api: { patch(changes), addState(), removeState(i), stateField(i, key, v) }
      _subForm(sf, api, opts) {
        opts = opts || {};
        var self = this;
        var wrap = h("div", {});

        if (!opts.hideEntity) {
          wrap.appendChild(this._row("Entity",
            this._entityPicker(sf.entity, function (v) { api.patch({ entity: v }); })));
          var hass = this._hass;
          var entityState = hass && sf.entity && hass.states[sf.entity]
            ? hass.states[sf.entity].state : "";
          if (entityState !== "") {
            wrap.appendChild(h("div", { class: "hint" },
              "Current state of " + sf.entity + ": " + entityState));
          }
        }

        if (!opts.hideDefaultUrl) {
          wrap.appendChild(this._row("Default URL(s)",
            this._area(sf.default_url, "urls grow",
              "One URL per line. Multiple lines = random choice",
              function (v) { api.patch({ default_url: v }); }),
            "One URL per line. Multiple lines for a state = a random URL is picked each refresh. Set a state's URL to none to disable the background for that state."));
        }

        (sf.states || []).forEach(function (row, index) {
          wrap.appendChild(h("div", { class: "row" },
            h("input", {
              type: "text", value: row.state, placeholder: "state",
              style: "max-width:160px",
              onchange: function (e) { api.stateField(index, "state", e.target.value); }
            }),
            h("textarea", {
              class: "urls grow", value: row.urls,
              placeholder: "URL(s) for this state",
              onchange: function (e) { api.stateField(index, "urls", e.target.value); }
            }),
            h("button", {
              class: "small", type: "button", text: "Remove",
              onclick: function () { api.removeState(index); }
            })));
        });
        wrap.appendChild(h("div", { class: "row" },
          h("button", {
            class: "small", type: "button", text: "Add state",
            onclick: function () { api.addState(); }
          })));

        var more = h("div", {});
        more.appendChild(this._row("Background override",
          this._textField(sf.background, {
            placeholder: "'transparent' or any CSS background"
          }, function (v) { api.patch({ background: v }); }),
          "Overrides the default transparent background the card paints behind the header."));
        more.appendChild(this._row("Opacity (1-99)",
          this._numberField(sf.opacity, { placeholder: "empty = disabled" },
            function (v) { api.patch({ opacity: v }); })));
        more.appendChild(this._check(sf.transparent_panel, "Transparent top panel",
          function (v) { api.patch({ transparent_panel: v }); }));
        more.appendChild(this._check(sf.overlay_enabled, "Tint overlay",
          function (v) { api.patch({ overlay_enabled: v }); }));
        if (sf.overlay_enabled) {
          more.appendChild(this._row("Overlay color",
            h("span", { style: "display:flex;gap:8px;align-items:center" },
              this._textField(sf.overlay_color, { type: "text" },
                function (v) { api.patch({ overlay_color: v }); }),
              this._numberField(sf.overlay_opacity, { min: "0", max: "1", step: "0.05" },
                function (v) { api.patch({ overlay_opacity: v }); }))));
        }
        more.appendChild(this._row("Refresh interval (minutes)",
          this._numberField(sf.refresh_interval, { placeholder: "empty = never" },
            function (v) { api.patch({ refresh_interval: v }); })));
        more.appendChild(this._check(sf.refresh_on_update,
          "Refresh when the entity updates, even if the state is unchanged",
          function (v) { api.patch({ refresh_on_update: v }); }));
        more.appendChild(h("div", { class: "hint" },
          "Users: comma or newline separated Home Assistant usernames."));
        more.appendChild(this._row("Included users",
          this._area(sf.included_users, "grow", "", function (v) { api.patch({ included_users: v }); })));
        more.appendChild(this._row("Excluded users",
          this._area(sf.excluded_users, "grow", "", function (v) { api.patch({ excluded_users: v }); })));
        ["included_devices", "excluded_devices"].forEach(function (field) {
          var label = field === "included_devices"
            ? "Included devices (empty = all)" : "Excluded devices";
          var chips = h("div", { class: "devchips" });
          KNOWN_DEVICES.forEach(function (device) {
            var checked = (sf[field] || []).indexOf(device) !== -1;
            chips.appendChild(h("label", {},
              h("input", {
                type: "checkbox", checked: checked,
                onchange: function (e) {
                  var list = (sf[field] || []).slice();
                  var at = list.indexOf(device);
                  if (e.target.checked && at === -1) list.push(device);
                  if (!e.target.checked && at !== -1) list.splice(at, 1);
                  var changes = {};
                  changes[field] = list;
                  api.patch(changes);
                }
              }), device));
          });
          more.appendChild(h("div", { class: "section" },
            h("h4", {}, label), chips));
        });
        more.appendChild(h("div", { class: "hint" },
          "Device types are matched against the browser user agent. Use debug + \"show user agent\" on the Advanced tab to find the right value."));

        if (!opts.hideMore) {
          wrap.appendChild(h("details", { class: "more" },
            h("summary", {}, "More options"), more));
        }
        return wrap;
      }

      // -------------------- tabs --------------------------------

      _renderGeneral() {
        var self = this;
        var form = this._form;
        var wrap = h("div", {});
        wrap.appendChild(this._check(form.enabled, "Background enabled",
          function (v) { self._update(function (f) { f.enabled = v; }); }));
        wrap.appendChild(this._row("Default URL(s)",
          this._area(form.default_url, "urls grow",
            "One URL per line. Multiple lines = random choice",
            function (v) { self._update(function (f) { f.default_url = v; }); }),
          "One URL per line. Multiple lines = a random URL is picked each refresh."));
        wrap.appendChild(this._row("Background override",
          this._textField(form.background, {
            placeholder: "'transparent' or any CSS background"
          }, function (v) { self._update(function (f) { f.background = v; }); }),
          "Overrides the default transparent background Home Assistant paints behind the header."));
        wrap.appendChild(this._row("Opacity (1-99)",
          this._numberField(form.opacity, { placeholder: "empty = disabled" },
            function (v) { self._update(function (f) { f.opacity = v }); }),
          "Empty = disabled. Makes cards see-through with a compatible theme. Creates a CSS stacking context (see README)."));
        wrap.appendChild(this._check(form.transparent_panel, "Transparent top panel",
          function (v) { self._update(function (f) { f.transparent_panel = v; }); }));
        wrap.appendChild(this._check(form.overlay_enabled, "Tint overlay over the background",
          function (v) { self._update(function (f) { f.overlay_enabled = v; }); }));
        if (form.overlay_enabled) {
          wrap.appendChild(this._row("Overlay color",
            h("span", { style: "display:flex;gap:8px;align-items:center" },
              this._textField(form.overlay_color, {},
                function (v) { self._update(function (f) { f.overlay_color = v; }); }),
              this._numberField(form.overlay_opacity, { min: "0", max: "1", step: "0.05" },
                function (v) { self._update(function (f) { f.overlay_opacity = v; }); }))));
        }
        wrap.appendChild(this._row("Refresh interval (minutes)",
          this._numberField(form.refresh_interval, { placeholder: "empty = never" },
            function (v) { self._update(function (f) { f.refresh_interval = v; }); }),
          "Empty = never. Re-picks from the current URL list."));
        wrap.appendChild(this._check(form.refresh_on_update,
          "Refresh when the entity updates, even if the state is unchanged",
          function (v) { self._update(function (f) { f.refresh_on_update = v; }); }));
        return wrap;
      }

      _renderStates() {
        var self = this;
        var form = this._form;
        var wrap = this._subForm(
          { entity: form.entity, states: form.states },
          {
            patch: function (changes) {
              // only the entity field belongs to the root form on this
              // tab; the "More options" block is hidden entirely
              if ("entity" in changes) {
                self._update(function (f) { f.entity = changes.entity; });
              }
            },
            stateField: function (index, key, value) {
              self._update(function (f) { f.states[index][key] = value; });
            },
            addState: function () {
              self._update(function (f) { f.states.push({ state: "", urls: "" }); });
            },
            removeState: function (index) {
              self._update(function (f) { f.states.splice(index, 1); });
            }
          },
          { hideDefaultUrl: true, hideMore: true });
        wrap.appendChild(h("div", { class: "hint" },
          "Maps states of the entity above to background URLs. States without an entry fall back to the default URL."));
        return wrap;
      }

      _renderViews() {
        var self = this;
        var form = this._form;
        var wrap = h("div", {});
        wrap.appendChild(h("div", { class: "hint" },
          "Per-view overrides. \"Inherit\" uses the root config (and any group assigned to the view). Group and None assignments are written onto the dashboard view definitions on save."));
        (form.views || []).forEach(function (view, index) {
          var block = h("div", { class: "sub" });
          block.appendChild(h("div", { class: "row" },
            h("b", {}, view.title || view.path),
            h("span", { class: "hint" },
              view.path + (view.orphan ? " (stale entry)" : "")),
            view.orphan
              ? h("button", {
                  class: "small", type: "button", text: "Remove stale entry",
                  onclick: function () {
                    self._update(function (f) { f.views.splice(index, 1); });
                  }
                })
              : null));
          block.appendChild(self._row("Background",
            self._select(view.mode, [
              ["inherit", "Inherit root config"],
              ["group", "Use a group"],
              ["none", "Disabled ('none')"],
              ["custom", "Custom config"]
            ], function (v) {
              self._update(function (f) { f.views[index].mode = v; });
            })));
          if (view.mode === "group") {
            var groupNames = (form.groups || []).map(function (g) { return g.name; })
              .filter(function (n) { return n; });
            block.appendChild(self._row("Group",
              self._select(view.group, [["", "Choose group..."]].concat(
                groupNames.map(function (name) { return [name, name]; })),
              function (v) {
                self._update(function (f) { f.views[index].group = v; });
              }),
              groupNames.indexOf(view.group) === -1 && view.group
                ? "This group is not defined in the Groups tab."
                : ""));
          }
          if (view.mode === "custom") {
            var custom = h("div", { class: "sub" });
            custom.appendChild(self._subForm(view.custom, {
              patch: function (changes) {
                self._update(function (f) { Object.assign(f.views[index].custom, changes); });
              },
              stateField: function (si, key, value) {
                self._update(function (f) { f.views[index].custom.states[si][key] = value; });
              },
              addState: function () {
                self._update(function (f) {
                  f.views[index].custom.states.push({ state: "", urls: "" });
                });
              },
              removeState: function (si) {
                self._update(function (f) { f.views[index].custom.states.splice(si, 1); });
              }
            }));
            block.appendChild(custom);
          }
          wrap.appendChild(block);
        });
        if (!(form.views || []).length) {
          wrap.appendChild(h("div", { class: "hint" }, "This dashboard has no views yet."));
        }
        return wrap;
      }

      _renderGroups() {
        var self = this;
        var form = this._form;
        var wrap = h("div", {});
        wrap.appendChild(h("div", { class: "hint" },
          "Named reusable configurations. Assign them to views in the Views tab, or set animated_background: <group name> on a view definition."));
        (form.groups || []).forEach(function (group, index) {
          var block = h("div", { class: "sub" });
          block.appendChild(self._row("Group name",
            h("span", { style: "display:flex;gap:8px;flex:1" },
              self._textField(group.name, {},
                function (v) {
                  self._update(function (f) { f.groups[index].name = v; });
                }),
              h("button", {
                class: "small", type: "button", text: "Remove group",
                onclick: function () {
                  self._update(function (f) { f.groups.splice(index, 1); });
                }
              }))));
          block.appendChild(self._subForm(group.custom, {
            patch: function (changes) {
              self._update(function (f) { Object.assign(f.groups[index].custom, changes); });
            },
            stateField: function (si, key, value) {
              self._update(function (f) { f.groups[index].custom.states[si][key] = value; });
            },
            addState: function () {
              self._update(function (f) {
                f.groups[index].custom.states.push({ state: "", urls: "" });
              });
            },
            removeState: function (si) {
              self._update(function (f) { f.groups[index].custom.states.splice(si, 1); });
            }
          }));
          wrap.appendChild(block);
        });
        wrap.appendChild(h("div", { class: "row" },
          h("button", {
            class: "small", type: "button", text: "Add group",
            onclick: function () {
              self._update(function (f) {
                f.groups.push({ name: "", custom: subFormFromConfig(null) });
              });
            }
          })));
        return wrap;
      }

      _renderAccess() {
        var self = this;
        var form = this._form;
        var wrap = h("div", {});
        wrap.appendChild(h("div", { class: "section" },
          h("h4", {}, "Included users (empty = everyone)"),
          this._area(form.included_users, "grow", "", function (v) {
            self._update(function (f) { f.included_users = v; });
          }),
          h("h4", {}, "Excluded users"),
          this._area(form.excluded_users, "grow", "", function (v) {
            self._update(function (f) { f.excluded_users = v; });
          }),
          h("div", { class: "hint" },
            "Comma or newline separated Home Assistant usernames.")));
        var devices = h("div", { class: "section" });
        ["included_devices", "excluded_devices"].forEach(function (field) {
          devices.appendChild(h("h4", {},
            field === "included_devices"
              ? "Included devices (empty = all)" : "Excluded devices"));
          var chips = h("div", { class: "devchips" });
          KNOWN_DEVICES.forEach(function (device) {
            var checked = (form[field] || []).indexOf(device) !== -1;
            chips.appendChild(h("label", {},
              h("input", {
                type: "checkbox", checked: checked,
                onchange: function (e) {
                  self._update(function (f) {
                    var list = f[field];
                    var at = list.indexOf(device);
                    if (e.target.checked && at === -1) list.push(device);
                    if (!e.target.checked && at !== -1) list.splice(at, 1);
                  });
                }
              }), device));
          });
          devices.appendChild(chips);
        });
        devices.appendChild(h("div", { class: "hint" },
          "Device types are matched against the browser user agent. Use debug + \"show user agent\" on the Advanced tab to find the right value."));
        wrap.appendChild(devices);
        return wrap;
      }

      _renderAdvanced() {
        var self = this;
        var form = this._form;
        var wrap = h("div", {});
        wrap.appendChild(this._check(form.debug, "Debug logging (browser console)",
          function (v) { self._update(function (f) { f.debug = v; }); }));
        wrap.appendChild(this._check(form.display_user_agent,
          "Show my user agent on reload (for device lists)",
          function (v) { self._update(function (f) { f.display_user_agent = v; }); }));
        return wrap;
      }

      // -------------------- render -------------------------------

      _render() {
        var self = this;
        var root = this.shadowRoot;
        root.innerHTML = "";

        var canWrite = this._canWrite();
        var uncontrolled = this._isUncontrolled();

        var head = h("div", { class: "head" },
          h("span", { class: "title" }, "Animated Background"),
          h("span", { class: "status" }, this._status));

        var container = h("ha-card", {},
          h("div", { style: "padding: 12px 16px 16px" }, head));

        var inner = container.firstChild;

        // an uncontrolled (strategy-generated) dashboard has no stored
        // config to write to — explain the take-control step instead of
        // rendering a form whose save would fail (guide §5)
        if (uncontrolled) {
          inner.appendChild(h("p", { class: "hint" },
            "This dashboard is auto-generated (a strategy controls it). Take control of it first: edit the dashboard once and confirm Home Assistant's take-control prompt. Until then there is no stored configuration for this editor (or a save) to write to."));
          if (this._yamlOut) {
            inner.appendChild(this._yamlBlock());
          }
          this._actions(inner, false);
          root.appendChild(styleNode());
          root.appendChild(container);
          return;
        }

        var tabs = [
          ["general", "General"],
          ["states", "Entity & States"],
          ["views", "Views"],
          ["groups", "Groups"],
          ["access", "Access"],
          ["advanced", "Advanced"]
        ];
        var tabBar = h("div", { class: "tabs" });
        tabs.forEach(function (tab) {
          var button = h("button", {
            type: "button", text: tab[1],
            onclick: function () { self._tab = tab[0]; self._render(); }
          });
          if (self._tab === tab[0]) button.setAttribute("active", "");
          tabBar.appendChild(button);
        });
        inner.appendChild(tabBar);

        if (!canWrite) {
          var note = this._isYamlMode()
            ? "This dashboard is YAML-mode: changes cannot be saved from here. Use Save to generate the animated_background: block (plus the view-level lines) and paste it into your configuration file."
            : "You are not signed in as an administrator. Saving requires admin; use Save to generate YAML you can hand to an admin, or paste it into your YAML configuration yourself.";
          inner.appendChild(h("div", { class: "hint" }, note));
        }

        this._warnings.forEach(function (warning) {
          inner.appendChild(h("div", { class: "warn" }, warning));
        });
        if (this._error) {
          inner.appendChild(h("div", { class: "error" }, this._error));
        }

        var body;
        if (this._tab === "general") body = this._renderGeneral();
        else if (this._tab === "states") body = this._renderStates();
        else if (this._tab === "views") body = this._renderViews();
        else if (this._tab === "groups") body = this._renderGroups();
        else if (this._tab === "access") body = this._renderAccess();
        else body = this._renderAdvanced();
        inner.appendChild(body);

        if (this._yamlOut) {
          inner.appendChild(this._yamlBlock());
        }

        this._actions(inner, canWrite && !uncontrolled);

        root.appendChild(styleNode());
        root.appendChild(container);
      }

      _yamlBlock() {
        var self = this;
        return h("div", { class: "section" },
          h("h4", {}, "Generated YAML"),
          h("pre", { class: "yaml", text: this._yamlOut }),
          h("div", { class: "row" },
            h("button", {
              class: "small", type: "button", text: "Copy YAML",
              onclick: function () { self._copyYaml(); }
            })));
      }

      _actions(inner, canWrite) {
        var self = this;
        var actions = h("div", { class: "actions" });
        if (canWrite) {
          var save = h("button", {
            class: "primary", type: "button", text: "Save",
            disabled: !this._dirty,
            onclick: function () { self._save(); }
          });
          actions.appendChild(save);
        } else {
          actions.appendChild(h("button", {
            class: "primary", type: "button", text: "Generate YAML",
            onclick: function () {
              self._yamlOut = self._buildYaml();
              self._render();
            }
          }));
        }
        actions.appendChild(h("button", {
          class: "small", type: "button", text: "Reload config",
          onclick: function () { self._reload(); }
        }));
        actions.appendChild(h("button", {
          class: "small", type: "button", text: "Copy YAML",
          onclick: function () { self._copyYaml(); }
        }));
        actions.appendChild(h("span", { class: "status" }, "version " + EditorVersion));
        inner.appendChild(actions);
      }
    }

    customElements.define("animated-background-editor", AnimatedBackgroundEditor);

    window.customCards = window.customCards || [];
    window.customCards.push({
      type: "animated-background-editor",
      name: "Animated Background Editor",
      description: "Visual editor for the dashboard's animated_background configuration",
      preview: false
    });

    STATUS_MESSAGE("Editor card registered");
  }

  // no polling wait: the editor is plain DOM and defines its custom
  // element immediately; HA's Lit classes are irrelevant to it now
  try {
    defineEditor();
  } catch (err) {
    console.error("Animated Background: failed to register editor card", err);
  }

  // exposed for testing
  window.__animatedBackgroundEditor = {
    splitLines: splitLines,
    linesToUrlValue: linesToUrlValue,
    urlValueToLines: urlValueToLines,
    textToList: textToList,
    listToText: listToText,
    stateMapToRows: stateMapToRows,
    rowsToStateMap: rowsToStateMap,
    subFormFromConfig: subFormFromConfig,
    subConfigFromForm: subConfigFromForm,
    formFromConfig: formFromConfig,
    configFromForm: configFromForm,
    viewIdentity: viewIdentity,
    configToYaml: configToYaml,
    assignmentsToYaml: assignmentsToYaml,
    yamlScalar: yamlScalar,
    yamlMapLines: yamlMapLines,
    yamlBlock: yamlBlock
  };
})();

console.info(
  '%c ANIMATED-BACKGROUND %c v1.1.1 ',
  'color: white; background: #526ecd; font-weight: 700;',
  'color: white; background: #1c1c1c; font-weight: 700;'
);
