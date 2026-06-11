# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Manifest V3 extension ("YouTube Video Blocker") that hides YouTube videos and channels via a right-click context menu. Blocklists are persisted in `chrome.storage.local`.

## Development

No build step — plain JS, HTML, CSS loaded directly by Chrome. To test:

1. Open `chrome://extensions`, enable Developer mode.
2. Click "Load unpacked" and select this directory.
3. After changing `background.js` or `manifest.json`, click the reload button on the extension card. Content script / popup changes take effect on next page load.

## Architecture

- **background.js** — Service worker. Registers three context menu items ("Block this video" / "Block this channel" / "Block this channel pair (collab)") on install. Handles menu clicks: extracts the video ID itself for video blocks, but delegates channel resolution and current-page channel discovery to the content script (because channel info lives in the DOM, not the URL). Manages `chrome.storage.local` blocklists (`blockedVideos[]`, `blockedChannels[]`, `blockedPairs[][2]`). Pairs are stored lex-normalized as `[a, b]` with `a < b`.
- **content.js** — Injected into youtube.com pages. On load and on every DOM mutation (YouTube is an SPA), reads blocklists from storage and hides matching renderer elements via `.ytvb-hidden`. Also unconditionally hides shelf sections whose title matches an entry in `hideSectionsByTitle(...)` (currently `"People also watched"`). On watch pages, `getCurrentPageChannels()` extracts the primary channel (from `ytd-video-owner-renderer`) plus collaborators (channel links inside the description), and `applyWatchPageBlock` renders a full-page overlay if any of those channels is blocked or if any `blockedPairs` entry is fully present on the page. Message actions: `hideBlocked`, `getChannelForLink`, `getPageChannels`.
- **popup.html / popup.js** — Extension popup for viewing and managing all three blocklists (videos, channels, collab pairs) with per-item Remove and Clear All. Also supports **Export** (downloads `youtube-blocker-YYYY-MM-DD.json` containing `{format, version, exportedAt, blockedVideos, blockedChannels, blockedPairs}`) and **Import** (merges/dedupes the file's entries into the existing lists; pairs are lex-normalized on the way in). No additional permissions needed — download is done via an in-page anchor + `URL.createObjectURL`.
- **styles.css** — Hidden class (`.ytvb-hidden`) and watch-page overlay (`#ytvb-overlay`).

## YouTube DOM Selectors

The content script targets these YouTube custom elements as "renderer" containers to hide:
`ytd-rich-item-renderer`, `ytd-video-renderer`, `ytd-compact-video-renderer`, `ytd-grid-video-renderer`, `ytd-reel-item-renderer`, `ytd-playlist-panel-video-renderer`. YouTube changes these periodically — if hiding stops working, check whether new renderer tag names have been introduced.
