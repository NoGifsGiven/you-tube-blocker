document.addEventListener("DOMContentLoaded", () => {
  const videoList = document.getElementById("video-list");
  const channelList = document.getElementById("channel-list");
  const pairList = document.getElementById("pair-list");
  const videoCount = document.getElementById("video-count");
  const channelCount = document.getElementById("channel-count");
  const pairCount = document.getElementById("pair-count");

  function render() {
    chrome.storage.local.get(
      { blockedVideos: [], blockedChannels: [], blockedPairs: [] },
      ({ blockedVideos, blockedChannels, blockedPairs }) => {
        renderList(videoList, blockedVideos, "blockedVideos");
        videoCount.textContent = `(${blockedVideos.length})`;

        renderList(channelList, blockedChannels, "blockedChannels");
        channelCount.textContent = `(${blockedChannels.length})`;

        renderPairList(pairList, blockedPairs);
        pairCount.textContent = `(${blockedPairs.length})`;
      }
    );
  }

  function renderList(ul, items, storageKey) {
    ul.innerHTML = "";
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "None";
      ul.appendChild(li);
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");

      const label = document.createElement("span");
      label.className = "item-label";
      label.textContent = item;
      li.appendChild(label);

      const btn = document.createElement("button");
      btn.className = "remove";
      btn.textContent = "Remove";
      btn.addEventListener("click", () => {
        removeItem(storageKey, item);
      });
      li.appendChild(btn);

      ul.appendChild(li);
    });
  }

  function renderPairList(ul, pairs) {
    ul.innerHTML = "";
    if (pairs.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "None";
      ul.appendChild(li);
      return;
    }
    pairs.forEach((pair) => {
      const li = document.createElement("li");

      const label = document.createElement("span");
      label.className = "item-label";
      label.textContent = `${pair[0]} ↔ ${pair[1]}`;
      li.appendChild(label);

      const btn = document.createElement("button");
      btn.className = "remove";
      btn.textContent = "Remove";
      btn.addEventListener("click", () => {
        removePair(pair);
      });
      li.appendChild(btn);

      ul.appendChild(li);
    });
  }

  function removeItem(key, value) {
    chrome.storage.local.get({ [key]: [] }, (data) => {
      const list = data[key].filter((v) => v !== value);
      chrome.storage.local.set({ [key]: list }, () => {
        render();
        notifyContentScript();
      });
    });
  }

  function removePair(pair) {
    chrome.storage.local.get({ blockedPairs: [] }, (data) => {
      const list = data.blockedPairs.filter(
        (p) => !(p[0] === pair[0] && p[1] === pair[1])
      );
      chrome.storage.local.set({ blockedPairs: list }, () => {
        render();
        notifyContentScript();
      });
    });
  }

  function clearAll(key) {
    chrome.storage.local.set({ [key]: [] }, () => {
      render();
      notifyContentScript();
    });
  }

  function notifyContentScript() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes("youtube.com")) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "hideBlocked" });
      }
    });
  }

  document.getElementById("clear-videos").addEventListener("click", () => {
    clearAll("blockedVideos");
  });
  document.getElementById("clear-channels").addEventListener("click", () => {
    clearAll("blockedChannels");
  });
  document.getElementById("clear-pairs").addEventListener("click", () => {
    clearAll("blockedPairs");
  });

  const statusEl = document.getElementById("io-status");
  let statusTimer = null;
  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", !!isError);
    if (statusTimer) clearTimeout(statusTimer);
    if (text) {
      statusTimer = setTimeout(() => {
        statusEl.textContent = "";
        statusEl.classList.remove("error");
      }, 4000);
    }
  }

  document.getElementById("export-btn").addEventListener("click", () => {
    chrome.storage.local.get(
      { blockedVideos: [], blockedChannels: [], blockedPairs: [] },
      ({ blockedVideos, blockedChannels, blockedPairs }) => {
        const payload = {
          format: "youtube-blocker-export",
          version: 1,
          exportedAt: new Date().toISOString(),
          blockedVideos,
          blockedChannels,
          blockedPairs
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `youtube-blocker-${new Date()
          .toISOString()
          .slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Give the browser a moment to start the download before revoking.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus(
          `Exported ${blockedVideos.length} videos, ${blockedChannels.length} channels, ${blockedPairs.length} pairs`
        );
      }
    );
  });

  const importFile = document.getElementById("import-file");
  document.getElementById("import-btn").addEventListener("click", () => {
    importFile.value = "";
    importFile.click();
  });
  importFile.addEventListener("change", () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setStatus("Import failed: could not read file", true);
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(String(reader.result));
      } catch {
        setStatus("Import failed: invalid JSON", true);
        return;
      }
      const incomingVideos = Array.isArray(data.blockedVideos)
        ? data.blockedVideos.filter((v) => typeof v === "string" && v)
        : [];
      const incomingChannels = Array.isArray(data.blockedChannels)
        ? data.blockedChannels.filter((c) => typeof c === "string" && c)
        : [];
      const incomingPairs = Array.isArray(data.blockedPairs)
        ? data.blockedPairs
            .filter(
              (p) =>
                Array.isArray(p) &&
                p.length === 2 &&
                typeof p[0] === "string" &&
                typeof p[1] === "string" &&
                p[0] &&
                p[1]
            )
            .map((p) => (p[0] < p[1] ? [p[0], p[1]] : [p[1], p[0]]))
        : [];

      if (
        incomingVideos.length === 0 &&
        incomingChannels.length === 0 &&
        incomingPairs.length === 0
      ) {
        setStatus("Import failed: no blocklist entries found", true);
        return;
      }

      chrome.storage.local.get(
        { blockedVideos: [], blockedChannels: [], blockedPairs: [] },
        (existing) => {
          const mergedVideos = Array.from(
            new Set([...existing.blockedVideos, ...incomingVideos])
          );
          const mergedChannels = Array.from(
            new Set([...existing.blockedChannels, ...incomingChannels])
          );
          const pairKey = (p) => `${p[0]}|${p[1]}`;
          const pairMap = new Map();
          for (const p of existing.blockedPairs) {
            if (Array.isArray(p) && p.length === 2) pairMap.set(pairKey(p), p);
          }
          for (const p of incomingPairs) {
            if (!pairMap.has(pairKey(p))) pairMap.set(pairKey(p), p);
          }
          const mergedPairs = Array.from(pairMap.values());

          const addedV = mergedVideos.length - existing.blockedVideos.length;
          const addedC = mergedChannels.length - existing.blockedChannels.length;
          const addedP = mergedPairs.length - existing.blockedPairs.length;

          chrome.storage.local.set(
            {
              blockedVideos: mergedVideos,
              blockedChannels: mergedChannels,
              blockedPairs: mergedPairs
            },
            () => {
              render();
              notifyContentScript();
              setStatus(
                `Imported: +${addedV} videos, +${addedC} channels, +${addedP} pairs`
              );
            }
          );
        }
      );
    };
    reader.readAsText(file);
  });

  render();
});
