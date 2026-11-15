/* Delegated hover/focus previews inside Twitch's own live and replay tooltips. */
(() => {
  "use strict";

  const CHAT = '.chat-room, .video-chat, .chat-line__message, .video-chat__message, [data-a-target="chat-scroller"], [data-a-target="video-chat-message"]';
  const EMOTE = 'img[data-a-target="emote-name"], img.chat-line__message--emote, img.chat-image';
  const BUTTON = 'button, [role="button"], [data-test-selector="emote-button"], .chat-line__message--emote-button, [tabindex="0"]';
  const TOOLTIP = globalThis.TwitchMinSelectors.tooltip;
  const ID = "twitch-min-emote-preview";
  let enabled = false;
  let active = null;

  function emoteAt(target) {
    if (!(target instanceof Element)) return null;
    const owner = target.closest(BUTTON);
    const image = target.matches("img") ? target : !owner?.matches(CHAT) && owner?.querySelector(EMOTE);
    if (!image || !image.matches(EMOTE) || !image.closest(CHAT)) return null;
    if (image.closest('.chat-input, [data-a-target="emote-picker"], [data-test-selector="emote-picker"]')) return null;
    // chat-image also occurs on badges. Only accept it for the emote CDN.
    if (!image.matches('img[data-a-target="emote-name"], img.chat-line__message--emote') &&
        !isTwitchEmote(image.currentSrc || image.src)) return null;
    return image;
  }

  function tooltipHasName(node, name) {
    // Rich tooltips can include an author/provider beneath the emote name.
    // Match an intact native label, excluding our own image/status subtree.
    if (node === active?.popup) return false;
    const normalize = text => (text || '').replace(/\s+/g, ' ').trim();
    if (normalize(node.textContent) === normalize(name)) return true;
    return [...node.childNodes].some(child => tooltipHasName(child, name));
  }

  function usableTooltip(wrapper, name) {
    return wrapper?.isConnected && wrapper.matches(TOOLTIP) && tooltipHasName(wrapper, name) &&
      !wrapper.closest('[hidden], [aria-hidden="true"], [data-popper-reference-hidden="true"]') &&
      wrapper.checkVisibility({ checkVisibilityCSS: true });
  }

  function nativeTooltip(image, name) {
    // Prefer Twitch's explicit reference when supplied; generated IDs are read,
    // never hard-coded. Otherwise match the visible tooltip's exact emote name.
    for (let element = image; element && !element.matches(CHAT); element = element.parentElement) {
      for (const id of (element.getAttribute('aria-describedby') || '').split(/\s+/)) {
        const reference = document.getElementById(id);
        const wrapper = reference?.matches(TOOLTIP) ? reference : reference?.querySelector(TOOLTIP);
        if (usableTooltip(wrapper, name)) return wrapper;
      }
    }
    const anchor = image.getBoundingClientRect();
    return [...document.querySelectorAll(TOOLTIP)].filter(wrapper => usableTooltip(wrapper, name))
      .sort((a, b) => {
        const distance = wrapper => { const r = wrapper.getBoundingClientRect(); return Math.hypot(r.x - anchor.x, r.y - anchor.y); };
        return distance(a) - distance(b);
      })[0] || null;
  }

  function attachNative(wrapper) {
    if (!active || !usableTooltip(wrapper, active.name)) return;
    const { popup, label, observer, resizeObserver } = active;
    popup.setAttribute('data-tq-native-emote', '');
    label.hidden = !active.failed;
    if (active.failed) label.textContent = 'Image unavailable';
    active.host = wrapper;
    active.positioner = wrapper.closest('[data-popper-placement]');
    active.shift = { x: 0, y: 0 };
    wrapper.setAttribute('data-tq-emote-host', '');
    let descriptionId = active.positioner?.id || wrapper.id;
    if (!descriptionId) {
      descriptionId = `${ID}-native-host`;
      wrapper.id = descriptionId;
      active.generatedHostId = descriptionId;
    }
    const descriptions = (active.image.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== ID);
    if (!descriptions.includes(descriptionId)) {
      descriptions.push(descriptionId);
      active.addedDescription = descriptionId;
    }
    active.image.setAttribute('aria-describedby', descriptions.join(' '));
    wrapper.prepend(popup);
    resizeObserver.disconnect();
    resizeObserver.observe(wrapper);
    if (active.positioner) {
      active.positioner.setAttribute('data-tq-emote-positioner', '');
      observer.observe(active.positioner, { attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'data-popper-placement', 'data-popper-reference-hidden'] });
    }
    position();
  }

  function isTwitchEmote(source) {
    try {
      const url = new URL(source, document.baseURI);
      return url.hostname === "static-cdn.jtvnw.net" && /^\/emoticons\/v[12]\//.test(url.pathname);
    } catch {
      return false;
    }
  }

  function previewSource(image) {
    // Use the supplied variants first; preserve the emote's animation and theme.
    const variants = (image.getAttribute("srcset") || "").split(",").map(candidate => {
      const match = candidate.trim().match(/^(\S+)\s+([\d.]+)([xw])$/);
      return match && { source: match[1], size: Number(match[2]), unit: match[3] };
    }).filter(Boolean).sort((a, b) => b.size - a.size);
    const larger = variants.find(variant => variant.unit === "w" || variant.size >= 3);
    if (larger) return larger.source;
    const source = image.currentSrc || image.src;
    if (isTwitchEmote(source)) {
      const url = new URL(source);
      url.pathname = url.pathname.replace(/\/[123]\.0\/?$/, "/3.0");
      return url.href;
    }
    return variants[0]?.source || source;
  }

  function close() {
    if (!active) return;
    const { popup, image, titles, describedBy, observer, resizeObserver, host, positioner, addedDescription, generatedHostId } = active;
    active = null;
    observer.disconnect();
    resizeObserver.disconnect();
    popup.remove();
    host?.removeAttribute('data-tq-emote-host');
    if (generatedHostId && host?.id === generatedHostId) host.removeAttribute('id');
    if (positioner) {
      positioner.removeAttribute('data-tq-emote-positioner');
      positioner.style.removeProperty('--tq-emote-shift-x');
      positioner.style.removeProperty('--tq-emote-shift-y');
    }
    for (const [element, title] of titles) {
      if (!element.hasAttribute("title")) element.setAttribute("title", title);
    }
    // Remove only our description if Twitch changed it while the bubble was open.
    const ids = (image.getAttribute("aria-describedby") || "").split(/\s+/).filter(id => id && id !== ID && id !== addedDescription);
    if (ids.length) image.setAttribute("aria-describedby", ids.join(" "));
    else if (describedBy === "") image.setAttribute("aria-describedby", "");
    else image.removeAttribute("aria-describedby");
    document.removeEventListener("scroll", closeOnScroll, true);
    window.removeEventListener("resize", close);
    window.removeEventListener("popstate", close);
    window.removeEventListener("hashchange", close);
    window.removeEventListener("pagehide", close);
  }

  function closeOnScroll(event) {
    if (!active?.popup.contains(event.target)) close();
  }

  function position() {
    if (active?.host) {
      const { positioner, shift } = active;
      if (!positioner) return;
      const r = positioner.getBoundingClientRect();
      const left = r.left - shift.x, top = r.top - shift.y;
      const x = Math.round((Math.max(8, Math.min(left, innerWidth - r.width - 8)) - left) * 100) / 100;
      const y = Math.round((Math.max(8, Math.min(top, innerHeight - r.height - 8)) - top) * 100) / 100;
      // Preserve Popper's transform/placement and only correct viewport overflow.
      if (x !== shift.x) positioner.style.setProperty('--tq-emote-shift-x', `${x}px`);
      if (y !== shift.y) positioner.style.setProperty('--tq-emote-shift-y', `${y}px`);
      active.shift = { x, y };
    }
  }

  function open(image) {
    close();
    const original = image.currentSrc || image.src;
    const rect = image.getBoundingClientRect();
    if (!original || !rect.width || !rect.height) return;

    const popup = document.createElement("div");
    popup.id = ID;
    const label = document.createElement("span");
    const name = image.alt || image.getAttribute("aria-label") || image.title || "Emote";
    label.textContent = 'Image unavailable';
    label.hidden = true;
    const preview = document.createElement("img");
    preview.alt = "";
    // 3 times the displayed size, independent of screen pixel density.
    const scale = Math.min(3, (innerWidth - 40) / rect.width, (innerHeight - 80) / rect.height);
    preview.style.width = `${rect.width * scale}px`;
    preview.style.height = `${rect.height * scale}px`;
    popup.append(preview, label);

    const titles = [];
    const describedBy = image.getAttribute("aria-describedby");
    const href = location.href;
    const observer = new MutationObserver(records => {
      if (!active || active.popup !== popup) return;
      if (!image.isConnected || location.href !== href) { close(); return; }
      if (active.host) {
        const relevant = records.some(record => record.target === active.host || active.host.contains(record.target) ||
          record.target === active.positioner || (record.type === "attributes" && record.target.contains(active.host)) || [...record.removedNodes].some(node => node === active.host || node.contains?.(active.host)));
        if (!relevant) return;
        if (!usableTooltip(active.host, name)) { close(); return; }
        // React may replace the name's text children while keeping the wrapper.
        if (popup.parentElement !== active.host) active.host.prepend(popup);
        position();
      } else if (records.some(record => {
        const element = record.target instanceof Element ? record.target : record.target.parentElement;
        if (element?.closest('.tw-tooltip-layer')) return true;
        // A hidden tooltip can become visible through a wrapper or ancestor.
        if (record.type === 'attributes' && element?.querySelector('.tw-tooltip-layer, .tw-tooltip-wrapper')) return true;
        return [...record.addedNodes].some(node => node instanceof Element &&
          (node.matches('.tw-tooltip-layer, .tw-tooltip-wrapper') || node.querySelector('.tw-tooltip-layer, .tw-tooltip-wrapper')));
      })) {
        const wrapper = nativeTooltip(image, name);
        if (wrapper) attachNative(wrapper);
      }
    });
    const resizeObserver = new ResizeObserver(position);
    const owner = image.closest(BUTTON);
    const source = owner && !owner.matches(CHAT) ? owner : image;
    active = { popup, image, source, name, label, titles, describedBy, observer, resizeObserver, host: null, positioner: null, failed: false };
    // Keep pending content detached until Twitch mounts its matching tooltip.
    // Register ownership before suppressing titles or starting observation.
    for (let element = image; element && !element.matches(CHAT); element = element.parentElement) {
      if (element.hasAttribute("title")) {
        titles.push([element, element.getAttribute("title")]);
        element.removeAttribute("title");
      }
    }
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-hidden', 'data-popper-reference-hidden', 'style', 'class', 'hidden'] });
    const wrapper = nativeTooltip(image, name);
    if (wrapper) attachNative(wrapper);
    document.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("popstate", close);
    window.addEventListener("hashchange", close);
    window.addEventListener("pagehide", close);
    preview.addEventListener("load", () => { if (active?.popup === popup) position(); });
    let triedOriginal = false;
    preview.addEventListener("error", () => {
      if (active?.popup !== popup) return;
      if (!triedOriginal && preview.src !== original) {
        triedOriginal = true;
        preview.src = original;
      } else {
        active.failed = true;
        preview.hidden = true;
        label.hidden = false;
      }
      position();
    });
    preview.src = previewSource(image);
    position();
  }

  function onEnter(event) {
    if (!enabled) return;
    const image = emoteAt(event.target);
    if (image && active?.image !== image) open(image);
  }

  function onLeave(event) {
    if (!active) return;
    const inside = node => node instanceof Node &&
      (active.source.contains(node) || active.host?.contains(node));
    if (event.type === 'pointerout' && active.source.contains(document.activeElement)) return;
    if (inside(event.target) && !inside(event.relatedTarget)) close();
  }

  function onKeydown(event) {
    if (event.key === "Escape") close();
  }

  globalThis.TwitchMinEmotes = globalThis.TwitchMinRuntime.create({
    attach() {
      enabled = true;
      for (const type of ['pointerover', 'focusin']) document.addEventListener(type, onEnter, true);
      for (const type of ['pointerout', 'focusout']) document.addEventListener(type, onLeave, true);
      document.addEventListener("keydown", onKeydown, true);
    },
    dispose() {
      enabled = false;
      for (const type of ['pointerover', 'focusin']) document.removeEventListener(type, onEnter, true);
      for (const type of ['pointerout', 'focusout']) document.removeEventListener(type, onLeave, true);
      document.removeEventListener("keydown", onKeydown, true);
      close();
    }
  }, settings => settings.enabled === true && settings.emotePreviews !== false);
})();
