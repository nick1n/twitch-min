(() => {
  "use strict";
  const PLAYER = globalThis.TwitchMinSelectors.player;
  const FIT_PARTS = '.channel-root, .metadata-layout__split-top, [data-a-target="video-info-game-boxart-link"], [data-target="persistent-player-content"], .persistent-player, .root-scrollable__wrapper';
  let enabled = false;
  let hud = null;
  let timer = null;
  let sideButtonsEnabled = false;
  const SIDE_BUTTON_EVENTS = ['mousedown', 'mouseup', 'auxclick'];
  const LIVE_REWIND_TIMEOUT = 8000;
  let stopSeekRegions = null;
  let pendingRewind = null;

  function cancelRewind() {
    pendingRewind?.dispose();
    pendingRewind = null;
  }

  function liveSeekbar(player) {
    const bar = player.querySelector('[data-a-target="player-seekbar"]');
    if (!bar || bar.closest('[hidden], [inert], [disabled], [aria-disabled="true"]') ||
        !bar.checkVisibility({ checkVisibilityCSS: true })) return null;
    const rect = bar.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? bar : null;
  }

  function seekEnd(video) {
    const limit = Number.isFinite(video.duration) ? video.duration : Infinity;
    const ranges = video.seekable;
    return Math.min(limit, ranges.length ? ranges.end(ranges.length - 1) : limit);
  }

  function seekVideo(video, desired) {
    const ranges = video.seekable;
    const start = ranges.length ? ranges.start(0) : 0;
    const end = seekEnd(video);
    desired = Math.max(start, Math.min(end, desired));
    let next = desired;
    if (ranges.length) {
      let distance = Infinity;
      for (let i = 0; i < ranges.length; i++) {
        const candidate = Math.max(ranges.start(i), Math.min(ranges.end(i), desired));
        if (Math.abs(candidate - desired) < distance) {
          next = candidate;
          distance = Math.abs(candidate - desired);
        }
      }
    }
    video.currentTime = next;
  }

  function rewindLive(player, bar) {
    cancelRewind();
    const rect = bar.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const url = location.href;
    const transition = { player, url, dispose };
    const observer = new MutationObserver(queueFinish);
    const mediaEvents = ['durationchange', 'loadedmetadata', 'progress', 'seeked'];
    let settledVideo = null;
    let deadline;
    function dispose() {
      clearTimeout(deadline);
      observer.disconnect();
      for (const type of mediaEvents) player.removeEventListener(type, queueFinish, true);
      player.removeEventListener('mousedown', onManualSeek, true);
      window.removeEventListener('popstate', cancelRewind);
      window.removeEventListener('hashchange', cancelRewind);
    }
    function onManualSeek(event) {
      if (event.isTrusted && event.button === 0) cancelRewind();
    }
    function queueFinish(event) {
      // Let the native event handler finish switching media before seeking.
      if (event?.type === 'seeked' && event.target instanceof HTMLVideoElement &&
          Number.isFinite(event.target.duration)) settledVideo = event.target;
      queueMicrotask(() => finish(false));
    }
    function finish(timedOut) {
      if (pendingRewind !== transition) return;
      if (!player.isConnected || location.href !== url) { cancelRewind(); return; }
      const video = [...player.querySelectorAll('video')].find(video =>
        video.checkVisibility({ checkVisibilityCSS: true }) && Number.isFinite(video.duration) && video.duration > 0);
      if (!video || video.seeking || !video.seekable.length || (!timedOut && video !== settledVideo)) {
        if (timedOut || (!video && !liveSeekbar(player))) cancelRewind();
        return;
      }
      cancelRewind();
      seekVideo(video, seekEnd(video) - 30);
    }
    // Own all temporary work before asking Twitch to change its media source.
    pendingRewind = transition;
    try {
      for (const type of mediaEvents) player.addEventListener(type, queueFinish, true);
      player.addEventListener('mousedown', onManualSeek, true);
      window.addEventListener('popstate', cancelRewind);
      window.addEventListener('hashchange', cancelRewind);
      observer.observe(player, { childList: true, subtree: true });
      // Metadata can arrive before Twitch even starts its scrubber seek.
      // Allow source swaps without a seeked event to finish at the deadline.
      deadline = setTimeout(() => finish(true), LIVE_REWIND_TIMEOUT);
      // Twitch's live scrubber loads the recording timeline. Its live video
      // exposes a placeholder seekable range that cannot request older footage.
      for (const type of ['mousedown', 'mouseup', 'click']) {
        bar.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window, button: 0,
          buttons: type === 'mousedown' ? 1 : 0,
          clientX: rect.left + rect.width * 0.98,
          clientY: rect.top + rect.height / 2
        }));
      }
      queueFinish();
    } catch (error) {
      cancelRewind();
      throw error;
    }
  }

  function onSideButton(event) {
    if (!sideButtonsEnabled || (event.button !== 3 && event.button !== 4)) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target || target.closest('[role="menu"], [role="dialog"], [data-a-target="player-settings-menu"]')) return;
    const player = target.closest(PLAYER);
    if (!player) return;
    const bar = liveSeekbar(player);
    const videos = [...player.querySelectorAll('video')].filter(video =>
      video.checkVisibility({ checkVisibilityCSS: true }));
    const video = videos.find(video => !video.paused) || videos[0];
    if (!video) return;
    // Live media can report a placeholder seekable range even without DVR.
    // Only Twitch's usable scrubber authorizes a live-to-recording transition;
    // never change currentTime on the infinite live timeline itself.
    if (video.duration === Infinity ? !bar : !Number.isFinite(video.duration) || video.duration <= 0) {
      cancelRewind();
      return;
    }

    // Cancel every phase, but seek only once per press. Browsers differ in
    // which phase triggers their native Back/Forward action.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'mousedown') return;
    if (event.button === 3 && pendingRewind?.player === player && pendingRewind.url === location.href) return;
    if (video.duration === Infinity && bar) {
      if (event.button === 3) rewindLive(player, bar);
      else cancelRewind();
      return;
    }
    cancelRewind();
    const desired = video.currentTime + (event.button === 3 ? -30 : 60);
    if (event.button === 4 && desired >= seekEnd(video)) {
      const live = player.querySelector('button[aria-label="Skip to Live"]');
      if (live && !live.disabled && live.getAttribute('aria-disabled') !== 'true' && live.checkVisibility({ checkVisibilityCSS: true })) {
        live.click();
        return;
      }
    }
    seekVideo(video, desired);
  }
  function attachFit(region, onCleanup) {
    let source = null;
    let portal = null;
    let fittedRoot = null;
    let viewport = null;

    function syncViewport() {
      if (!fittedRoot?.isConnected || !viewport?.isConnected) return;
      const height = viewport.clientHeight || viewport.getBoundingClientRect().height;
      if (height > 0) {
        if (!fittedRoot.hasAttribute('data-tq-vod-fit')) fittedRoot.setAttribute('data-tq-vod-fit', '');
        const value = `${height}px`;
        if (fittedRoot.style.getPropertyValue('--tq-vod-height') !== value) fittedRoot.style.setProperty('--tq-vod-height', value);
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
      if (!portal.hasAttribute('data-tq-fit-player')) portal.setAttribute('data-tq-fit-player', '');
      for (const [name, value] of Object.entries(values)) {
        const property = `--tq-player-${name}`;
        const pixels = `${value}px`;
        if (portal.style.getPropertyValue(property) !== pixels) portal.style.setProperty(property, pixels);
      }
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
    const seekEnabled = settings.sideButtonSeek === true;
    if (seekEnabled !== sideButtonsEnabled) {
      sideButtonsEnabled = seekEnabled;
      if (seekEnabled) {
        stopSeekRegions = globalThis.TwitchMinRegions.watch(PLAYER, (player, onCleanup) => {
          onCleanup(() => { if (pendingRewind?.player === player) cancelRewind(); });
        }, stop => { stopSeekRegions = stop; });
      } else {
        cancelRewind();
        stopSeekRegions?.();
        stopSeekRegions = null;
      }
      for (const type of SIDE_BUTTON_EVENTS) {
        if (seekEnabled) document.addEventListener(type, onSideButton, { capture: true, passive: false });
        else document.removeEventListener(type, onSideButton, true);
      }
    }
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
      update({ channelAbout: false, wheelVolume: false, sideButtonSeek: false });
    }
  });
})();
