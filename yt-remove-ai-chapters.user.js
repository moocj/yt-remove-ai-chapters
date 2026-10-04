// ==UserScript==
// @name         YouTube Remove AI Chapters
// @namespace    https://github.com/moocj/yt-remove-ai-chapters
// @version      1.0.0
// @description  Removes YouTube's AI-generated chapters from videos. Creator-made chapters are still shown.
// @description:de  Entfernt die KI-generierten Kapitel von YouTube aus Videos. Vom Ersteller angelegte Kapitel bleiben sichtbar.
// @description:es  Elimina los capítulos generados por IA de YouTube en los vídeos. Los capítulos creados por el autor siguen visibles.
// @description:fr  Supprime les chapitres générés par l’IA de YouTube dans les vidéos. Les chapitres ajoutés par les créateurs restent visibles.
// @description:it  Rimuove i capitoli generati dall’IA di YouTube dai video. I capitoli creati dall’autore restano visibili.
// @author       moocj
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @homepageURL  https://github.com/moocj/yt-remove-ai-chapters
// @supportURL   https://github.com/moocj/yt-remove-ai-chapters/issues
// @downloadURL  https://raw.githubusercontent.com/moocj/yt-remove-ai-chapters/main/yt-remove-ai-chapters.user.js
// @updateURL    https://raw.githubusercontent.com/moocj/yt-remove-ai-chapters/main/yt-remove-ai-chapters.meta.js
// ==/UserScript==

(function () {
  'use strict';

  if (/^\/(?:embed|live_embed)(?:\/|$)/.test(location.pathname)) return;

  var CLASS = 'yt-auto-chapters';
  var STYLE_ID = 'yt-remove-ai-chapters-style';
  var CSS = [
    'body.' + CLASS + ' .ytp-chapter-container,',
    'body.' + CLASS + ' .ytp-chapter-title,',
    'body.' + CLASS + ' .ytp-chapter-title-content,',
    'body.' + CLASS + ' button[class*="chapter-title"],',
    'body.' + CLASS + ' ytd-macro-markers-list-renderer,',
    'body.' + CLASS + ' ytd-engagement-panel-section-list-renderer[target-id*="macro-markers"]',
    '{ display: none !important; }'
  ].join(' ');

  // Set window.__ytRemoveAiChaptersDebug = true before load to log to console.
  var debug = !!window.__ytRemoveAiChaptersDebug;
  function log() {
    if (!debug) return;
    try { console.log.apply(console, ['[Remove AI Chapters]'].concat([].slice.call(arguments))); }
    catch (e) { /* ignore */ }
  }

  var wantClass = false;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return true;
    var root = document.head || document.documentElement;
    if (!root) return false;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    root.appendChild(style);
    return true;
  }

  function syncClass() {
    if (!document.body) return false;
    document.body.classList.toggle(CLASS, wantClass);
    return true;
  }

  function sync() {
    var styled = ensureStyle();
    var classed = syncClass();
    return styled && classed;
  }

  if (!sync() && typeof MutationObserver !== 'undefined') {
    var readyObserver = new MutationObserver(function () {
      if (sync()) readyObserver.disconnect();
    });
    try { readyObserver.observe(document, { childList: true, subtree: true }); }
    catch (e) { /* ignore */ }
  }

  function markStripped() {
    wantClass = true;
    syncClass();
    log('AI chapters stripped');
  }

  window.addEventListener('yt-navigate-start', function () {
    wantClass = false;
    syncClass();
  }, true);


  function strip(root) {
    var stripped = false;
    var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
    var stack = [root];
    while (stack.length) {
      var o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      if (seen) {
        if (seen.has(o)) continue;
        seen.add(o);
      }

      // Remove AI markers, unless the creator also supplied chapters.
      if (Array.isArray(o.markersMap)) {
        var keys = o.markersMap.map(function (x) { return x && x.key; });
        if (keys.indexOf('AUTO_CHAPTERS') !== -1 && keys.indexOf('DESCRIPTION_CHAPTERS') === -1) {
          o.markersMap = o.markersMap.filter(function (x) { return !x || x.key !== 'AUTO_CHAPTERS'; });
          stripped = true;
        }
      }

      if (Array.isArray(o.engagementPanels)) {
        var kept = o.engagementPanels.filter(function (p) {
          var r = p && p.engagementPanelSectionListRenderer;
          return !/auto-chapters/i.test((r && r.targetId) || '');
        });
        if (kept.length !== o.engagementPanels.length) {
          o.engagementPanels = kept;
          stripped = true;
        }
      }

      var own = Object.keys(o);
      for (var i = 0; i < own.length; i++) {
        try { stack.push(o[own[i]]); } catch (e) {  }
      }
    }
    return stripped;
  }

  // SPA navigation: /next responses are parsed with JSON.parse.
  var nativeParse = JSON.parse;
  JSON.parse = function (text) {
    var result = nativeParse.apply(this, arguments);
    try {
      if (typeof text === 'string' && /AUTO_CHAPTERS|auto-chapters/.test(text) && strip(result)) {
        markStripped();
      }
    } catch (e) { }
    return result;
  };

  var initialData = window.ytInitialData;
  try {
    Object.defineProperty(window, 'ytInitialData', {
      configurable: true,
      enumerable: true,
      get: function () { return initialData; },
      set: function (value) {
        try { if (strip(value)) markStripped(); } catch (e) { /* ignore */ }
        initialData = value;
      }
    });
  } catch (e) { /* ignore */ }
  if (initialData) {
    try { if (strip(initialData)) markStripped(); } catch (e) { /* ignore */ }
  }
})();