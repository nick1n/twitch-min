(() => {
  "use strict";
  const PLAYER = globalThis.TwitchMinSelectors.player;
  const FIT_PARTS = '.channel-root, .metadata-layout__split-top, [data-a-target="video-info-game-boxart-link"], [data-target="persistent-player-content"], .persistent-player, .root-scrollable__wrapper';
  let enabled = false;
  let hud = null;
  let timer = null;
  function attachFit(region, onCleanup) {
    let source = null;
    let portal = null;
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
      if (document.fullscreenElement) {
        releaseFit();
        return;
      }
      const root = region.querySelector(globalThis.TwitchMinSelectors.vodRoot);
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
    const regionObserver = new MutationObserver(records => {
      // Discover only player/metadata mounts, not every live chat insertion. One
      // lookup handles the whole mutation batch, including SPA replacements.
      const detached = (source && !source.isConnected) || (portal && !portal.isConnected);
      if (detached || records.some(record =>
        (record.type === 'attributes' && (record.target.matches(FIT_PARTS) ||
          record.target === fittedRoot || record.target === source || record.target === portal ||
          record.target.closest('.metadata-layout__split-top'))) ||
        [...record.addedNodes, ...record.removedNodes].some(node =>
          node instanceof Element && (node.matches(FIT_PARTS) || node.querySelector(FIT_PARTS))))) locateFit();
    });

    onCleanup(() => {
      regionObserver.disconnect();
      window.removeEventListener('resize', locateFit);
      document.removeEventListener('fullscreenchange', locateFit);
      releaseFit();
    });
    regionObserver.observe(region, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-a-target', 'data-target'] });
    window.addEventListener('resize', locateFit);
    document.addEventListener('fullscreenchange', locateFit);
    locateFit();
  }

  function clearHUD() {
    clearTimeout(timer);
    hud?.remove();
    hud = null;
  }

  function onWheel(event) {
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

    clearTimeout(timer);
    if (!hud) {
      hud = document.createElement("output");
      hud.id = "twitch-min-volume";
      hud.setAttribute("role", "status");
    }
    const label = `Volume ${Math.round(volume * 100)}%`;
    if (hud.textContent !== label) hud.textContent = label;
    if (hud.parentElement !== player) player.append(hud);
    timer = setTimeout(clearHUD, 850);
  }

  let stopFitRegions = null;
  function update(settings) {
    const wheelEnabled = settings.wheelVolume !== false;
    if (wheelEnabled !== enabled) {
      enabled = wheelEnabled;
      if (enabled) document.addEventListener('wheel', onWheel, { capture: true, passive: false });
      else {
        document.removeEventListener('wheel', onWheel, true);
        clearHUD();
      }
    }
    if (settings.channelAbout && !stopFitRegions) {
      stopFitRegions = globalThis.TwitchMinRegions.watch('.root-scrollable__wrapper', attachFit, stop => { stopFitRegions = stop; });
    } else if (!settings.channelAbout && stopFitRegions) {
      stopFitRegions();
      stopFitRegions = null;
      window.dispatchEvent(new Event('resize'));
    }
  }
  globalThis.TwitchMinPlayer = globalThis.TwitchMinRuntime.create({
    attach(settings) {
      update(settings);
    },
    update,
    dispose() {
      enabled = false;
      document.removeEventListener('wheel', onWheel, true);
      clearHUD();
      update({ channelAbout: false, wheelVolume: false });
    }
  });
})();
