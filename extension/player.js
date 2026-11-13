(() => {
  "use strict";
  const PLAYER = '.video-player, [data-a-target="video-player"], .channel-page__video-player';
  let enabled = false;
  let hud = null;
  let timer = null;
  let fitEnabled = false;
  let source = null;
  let portal = null;
  let watchedRoot = null;
  let fittedRoot = null;
  let viewport = null;

  function syncViewport() {
    if (!fittedRoot?.isConnected || !viewport?.isConnected) return;
    const height = viewport.clientHeight || viewport.getBoundingClientRect().height;
    if (height > 0) {
      fittedRoot.setAttribute('data-tq-vod-fit', '');
      fittedRoot.style.setProperty('--tq-vod-height', `${height}px`);
    }
  }

  function releaseFit() {
    resizeObserver.disconnect();
    viewportObserver.disconnect();
    if (fittedRoot) {
      fittedRoot.removeAttribute('data-tq-vod-fit');
      fittedRoot.style.removeProperty('--tq-vod-height');
    }
    fittedRoot = viewport = null;
    if (portal) {
      portal.removeAttribute("data-tq-fit-player");
      for (const name of ["x", "y", "width", "height"]) portal.style.removeProperty(`--tq-player-${name}`);
    }
    source = portal = null;
  }

  function syncFit() {
    if (!source?.isConnected || !portal?.isConnected || document.fullscreenElement) return;
    const box = source.getBoundingClientRect();
    const parent = portal.offsetParent;
    if (!parent || !box.width || !box.height) return;
    const origin = parent.getBoundingClientRect();
    const values = {
      x: box.left - origin.left + parent.scrollLeft - parent.clientLeft,
      y: box.top - origin.top + parent.scrollTop - parent.clientTop,
      width: box.width,
      height: box.height
    };
    portal.setAttribute("data-tq-fit-player", "");
    for (const [name, value] of Object.entries(values)) portal.style.setProperty(`--tq-player-${name}`, `${value}px`);
  }

  function locateFit() {
    if (!fitEnabled || document.fullscreenElement) {
      releaseFit();
      return;
    }
    const root = document.querySelector('.channel-root:has(.metadata-layout__split-top [data-a-target="video-info-game-boxart-link"])');
    if (root !== watchedRoot) {
      stateObserver.disconnect();
      watchedRoot = root;
      if (root) stateObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
    }
    const theatre = root?.matches('.channel-root--theatre-mode, .channel-root--theatre');
    const nextSource = theatre ? null : root?.querySelector('[data-target="persistent-player-content"]');
    const nextPortal = theatre ? null : root?.closest('.root-scrollable__wrapper')?.querySelector('.persistent-player');
    if (nextSource !== source || nextPortal !== portal) {
      releaseFit();
      source = nextSource;
      portal = nextPortal;
      if (source && portal) resizeObserver.observe(source);
    }
    if (root && !theatre) {
      const nextViewport = root.closest('[data-a-target="root-scroller"], .root-scrollable, main');
      if (nextViewport !== viewport || fittedRoot !== root) {
        viewportObserver.disconnect();
        fittedRoot = root;
        viewport = nextViewport;
        if (viewport) {
          // Old channel-panel scroll offsets must not leave a clipped player
          // and a blank lower region after switching to the fitted layout.
          viewport.scrollTop = 0;
          viewportObserver.observe(viewport);
        }
      }
      syncViewport();
    }
    syncFit();
  }

  const resizeObserver = new ResizeObserver(syncFit);
  const viewportObserver = new ResizeObserver(() => { syncViewport(); syncFit(); });
  const stateObserver = new MutationObserver(locateFit);
  const mountObserver = new MutationObserver(() => {
    if (source?.isConnected && portal?.isConnected) return;
    locateFit();
  });

  function clearHUD() {
    clearTimeout(timer);
    hud?.remove();
    hud = null;
  }

  document.addEventListener("wheel", event => {
    if (!enabled || event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target || target.closest('[role="menu"], [role="dialog"], [data-a-target="player-settings-menu"]')) return;
    const player = target.closest(PLAYER);
    if (!player) return;
    const videos = [...player.querySelectorAll("video")].filter(video => video.checkVisibility({ checkVisibilityCSS: true }));
    const video = videos.find(video => !video.paused) || videos[0];
    if (!video) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    // A normal 100px mouse-wheel notch is 5%; small trackpad deltas are smooth.
    const units = event.deltaMode === 1 ? event.deltaY / 3 : event.deltaMode === 2 ? event.deltaY : event.deltaY / 100;
    const change = Math.max(-0.1, Math.min(0.1, -units * 0.05));
    const volume = Math.round(Math.max(0, Math.min(1, video.volume + change)) * 1000) / 1000;
    if (video.muted && change > 0) {
      player.querySelector('[data-a-target="player-mute-unmute-button"]')?.click();
      video.muted = false;
    }
    // Notify Twitch's volume control too, so its UI and saved level can update.
    const slider = player.querySelector('input[data-a-target="player-volume-slider"]');
    if (slider) {
      const min = Number(slider.min || 0), max = Number(slider.max || 1);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(slider, min + volume * (max - min));
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    }
    video.volume = volume;

    clearHUD();
    hud = document.createElement("output");
    hud.id = "twitch-min-volume";
    hud.setAttribute("role", "status");
    hud.textContent = `Volume ${Math.round(volume * 100)}%`;
    player.append(hud);
    timer = setTimeout(clearHUD, 850);
  }, { capture: true, passive: false });

  globalThis.TwitchMinPlayer = Object.freeze({
    configure(settings) {
      enabled = settings.enabled === true;
      if (!enabled) clearHUD();
      const next = enabled && settings.channelAbout;
      if (next !== fitEnabled) {
        fitEnabled = next;
        if (fitEnabled) {
          mountObserver.observe(document, { childList: true, subtree: true });
          window.addEventListener("resize", locateFit);
          document.addEventListener("fullscreenchange", locateFit);
          locateFit();
        } else {
          mountObserver.disconnect();
          stateObserver.disconnect();
          watchedRoot = null;
          window.removeEventListener("resize", locateFit);
          document.removeEventListener("fullscreenchange", locateFit);
          releaseFit();
          window.dispatchEvent(new Event("resize"));
        }
      }
    }
  });
})();
