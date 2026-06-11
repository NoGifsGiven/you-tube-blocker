// Hide videos/channels that are on the blocklist.
// Runs on page load and whenever the background script tells us to re-check.

let debounceTimer = null;

function hideBlockedDebounced() {
  if (debounceTimer) {
    return;
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    hideBlocked();
  }, 300);
}

function hideBlocked() {
  chrome.storage.local.get(
    { blockedVideos: [], blockedChannels: [], blockedPairs: [] },
    ({ blockedVideos, blockedChannels, blockedPairs }) => {
      const rendererSelector = [
        "ytd-rich-item-renderer",
        "ytd-video-renderer",
        "ytd-compact-video-renderer",
        "ytd-grid-video-renderer",
        "ytd-reel-item-renderer",
        "ytd-playlist-panel-video-renderer"
      ].join(",");

      // First, un-hide everything so removed blocklist entries take effect
      document.querySelectorAll(".ytvb-hidden").forEach((el) => {
        el.classList.remove("ytvb-hidden");
      });

      // Hide individual videos
      document.querySelectorAll("a[href]").forEach((link) => {
        const videoId = videoIdFromHref(link.href);
        if (videoId && blockedVideos.includes(videoId)) {
          const renderer = link.closest(rendererSelector);
          if (renderer) {
            renderer.classList.add("ytvb-hidden");
          }
        }
      });

      // Hide channels
      if (blockedChannels.length > 0) {
        document.querySelectorAll("a[href]").forEach((link) => {
          const channel = channelFromHref(link.href);
          if (channel && blockedChannels.includes(channel)) {
            const renderer = link.closest(rendererSelector);
            if (renderer) {
              renderer.classList.add("ytvb-hidden");
            }
          }
        });
      }

      hideSectionsByTitle(["People also watched", "People also search for"]);

      applyWatchPageBlock(blockedChannels, blockedPairs);
    }
  );
}

function hideSectionsByTitle(titles) {
  const sectionSelector = [
    "ytd-item-section-renderer",
    "ytd-shelf-renderer",
    "ytd-reel-shelf-renderer",
    "yt-related-shelf-view-model"
  ].join(",");
  const wanted = titles.map((t) => t.trim().toLowerCase());

  document.querySelectorAll(sectionSelector).forEach((section) => {
    // Look at the section's own header/title, not any nested item title.
    const titleEl =
      section.querySelector(":scope > #header #title") ||
      section.querySelector(":scope > #header .title") ||
      section.querySelector(":scope > .ytRelatedShelfViewModelTitle") ||
      section.querySelector(":scope > h2, :scope > h3") ||
      section.querySelector("#title, .title");
    if (!titleEl) {
      return;
    }
    const text = titleEl.textContent.trim().toLowerCase();
    if (wanted.some((t) => text === t || text.startsWith(t))) {
      section.classList.add("ytvb-hidden");
    }
  });
}

function applyWatchPageBlock(blockedChannels, blockedPairs) {
  if (!location.pathname.startsWith("/watch")) {
    removeWatchOverlay();
    return;
  }

  const { primary, collaborators } = getCurrentPageChannels();
  const pageChannels = new Set();
  if (primary) {
    pageChannels.add(primary);
  }
  for (const c of collaborators) {
    pageChannels.add(c);
  }
  if (pageChannels.size === 0) {
    return;
  }

  const blockedSet = new Set(blockedChannels);
  let reason = null;
  for (const c of pageChannels) {
    if (blockedSet.has(c)) {
      reason = `Blocked channel present: ${c}`;
      break;
    }
  }
  if (!reason) {
    for (const pair of blockedPairs) {
      if (Array.isArray(pair) && pair.length === 2 && pageChannels.has(pair[0]) && pageChannels.has(pair[1])) {
        reason = `Blocked collab: ${pair[0]} + ${pair[1]}`;
        break;
      }
    }
  }

  if (reason) {
    showWatchOverlay(reason);
  } else {
    removeWatchOverlay();
  }
}

function getCurrentPageChannels() {
  const result = { primary: null, collaborators: [] };
  if (!location.pathname.startsWith("/watch")) return result;

  const seen = new Set();

  const primaryLink = document.querySelector(
    "ytd-video-owner-renderer a[href^='/@'], ytd-video-owner-renderer a[href^='/channel/'], ytd-video-owner-renderer a[href^='/c/']"
  );
  if (primaryLink) {
    const p = channelFromHref(primaryLink.href);
    if (p) {
      result.primary = p;
      seen.add(p);
    }
  }

  const descSelectors = [
    "ytd-watch-metadata #description",
    "#description-inline-expander",
    "ytd-text-inline-expander",
    "ytd-video-description-content-renderer",
    "#description"
  ];
  for (const sel of descSelectors) {
    const container = document.querySelector(sel);
    if (!container) {
      continue;
    }
    const links = container.querySelectorAll(
      "a[href^='/@'], a[href^='/channel/'], a[href^='/c/']"
    );
    for (const link of links) {
      const c = channelFromHref(link.href);
      if (c && !seen.has(c)) {
        seen.add(c);
        result.collaborators.push(c);
      }
    }
    if (result.collaborators.length > 0) {
      break;
    }
  }

  return result;
}

function showWatchOverlay(reason) {
  let overlay = document.getElementById("ytvb-overlay");
  if (overlay) {
    const reasonEl = overlay.querySelector(".ytvb-overlay-reason");
    if (reasonEl) {
      reasonEl.textContent = reason;
    }
  } else {
    overlay = document.createElement("div");
    overlay.id = "ytvb-overlay";
    overlay.innerHTML =
      '<div class="ytvb-overlay-box">' +
      '<h2>Video blocked</h2>' +
      '<p class="ytvb-overlay-reason"></p>' +
      '<button class="ytvb-back">Go back</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector(".ytvb-overlay-reason").textContent = reason;
    overlay.querySelector(".ytvb-back").addEventListener("click", () => history.back());
  }
  document.querySelectorAll("video").forEach((v) => {
    try { v.pause(); } catch {}
  });
}

function removeWatchOverlay() {
  const overlay = document.getElementById("ytvb-overlay");
  if (overlay) {
    overlay.remove();
  }
}

function videoIdFromHref(href) {
  try {
    const url = new URL(href, location.origin);
    if (url.pathname.startsWith("/shorts/")) {
      return url.pathname.split("/shorts/")[1].split(/[?#]/)[0];
    }
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

function channelFromHref(href) {
  try {
    const url = new URL(href, location.origin);
    const path = url.pathname;
    if (path.startsWith("/@")) {
      return path.split("/")[1]; // "/@handle"
    }
    if (path.startsWith("/channel/")) {
      return path.split("/")[2];
    }
    if (path.startsWith("/c/")) {
      return path.split("/")[2];
    }
    return null;
  } catch {
    return null;
  }
}

// Respond to messages from the background script
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "hideBlocked") {
    hideBlocked();
    sendResponse({ ok: true });
  } else if (msg.action === "getChannelForLink") {
    const channel = resolveChannelForLink(msg.linkUrl);
    sendResponse({ channel });
  } else if (msg.action === "getPageChannels") {
    sendResponse(getCurrentPageChannels());
  }
  return true;
});

function resolveChannelForLink(linkUrl) {
  const videoId = videoIdFromHref(linkUrl);
  const allLinks = document.querySelectorAll("a[href]");

  for (const link of allLinks) {
    if (videoId && videoIdFromHref(link.href) === videoId) {
      const renderer = link.closest(
        "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer"
      );
      if (renderer) {
        const channelLink = renderer.querySelector(
          'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"]'
        );
        if (channelLink) {
          return channelFromHref(channelLink.href);
        }
      }
    }
  }

  // Fallback: if the link itself is a channel link
  return channelFromHref(linkUrl);
}

// Initial pass
hideBlocked();

// YouTube is an SPA — watch for navigation / DOM changes (debounced)
const observer = new MutationObserver(() => hideBlockedDebounced());
observer.observe(document.body, { childList: true, subtree: true });
