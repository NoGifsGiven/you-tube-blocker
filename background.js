chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "block-video",
    title: "Block this video",
    contexts: ["link"],
    targetUrlPatterns: [
      "*://*.youtube.com/watch*",
      "*://*.youtube.com/shorts/*",
      "*://youtu.be/*"
    ]
  });

  chrome.contextMenus.create({
    id: "block-channel",
    title: "Block this channel",
    contexts: ["link"],
    targetUrlPatterns: [
      "*://*.youtube.com/@*",
      "*://*.youtube.com/channel/*",
      "*://*.youtube.com/c/*",
      "*://*.youtube.com/watch*",
      "*://*.youtube.com/shorts/*",
      "*://youtu.be/*"
    ]
  });

  chrome.contextMenus.create({
    id: "block-channel-pair",
    title: "Block this channel pair (collab)",
    contexts: ["page", "link"],
    documentUrlPatterns: ["*://*.youtube.com/watch*"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "block-video") {
    const videoId = extractVideoId(info.linkUrl);
    if (videoId) {
      addToBlocklist("blockedVideos", videoId, () => {
        chrome.tabs.sendMessage(tab.id, { action: "hideBlocked" });
      });
    }
  } else if (info.menuItemId === "block-channel") {
    chrome.tabs.sendMessage(
      tab.id,
      { action: "getChannelForLink", linkUrl: info.linkUrl },
      (response) => {
        if (response && response.channel) {
          addToBlocklist("blockedChannels", response.channel, () => {
            chrome.tabs.sendMessage(tab.id, { action: "hideBlocked" });
          });
        }
      }
    );
  } else if (info.menuItemId === "block-channel-pair") {
    chrome.tabs.sendMessage(tab.id, { action: "getPageChannels" }, (response) => {
      if (!response || !response.primary || !Array.isArray(response.collaborators) || response.collaborators.length === 0) {
        return;
      }
      const newPairs = response.collaborators.map((c) => normalizePair(response.primary, c));
      addPairs(newPairs, () => {
        chrome.tabs.sendMessage(tab.id, { action: "hideBlocked" });
      });
    });
  }
});

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1);
    }
    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.split("/shorts/")[1].split(/[?#]/)[0];
    }
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

function addToBlocklist(key, value, callback) {
  chrome.storage.local.get({ [key]: [] }, (data) => {
    const list = data[key];
    if (!list.includes(value)) {
      list.push(value);
      chrome.storage.local.set({ [key]: list }, callback);
    } else {
      callback();
    }
  });
}

function normalizePair(a, b) {
  return a < b ? [a, b] : [b, a];
}

function addPairs(pairs, callback) {
  chrome.storage.local.get({ blockedPairs: [] }, (data) => {
    const list = data.blockedPairs;
    let changed = false;
    for (const pair of pairs) {
      if (pair[0] === pair[1]) {
        continue;
      }
      if (!list.some((p) => p[0] === pair[0] && p[1] === pair[1])) {
        list.push(pair);
        changed = true;
      }
    }
    if (changed) {
      chrome.storage.local.set({ blockedPairs: list }, callback);
    } else {
      callback();
    }
  });
}
