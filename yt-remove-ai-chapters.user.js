// ==UserScript==
// @name         YouTube Remove AI Chapters
// @namespace    https://github.com/moocj/yt-remove-ai-chapters
// @version      1.2.0
// @description  Removes YouTube's AI-generated chapters from videos. Creator-made chapters are still shown.
// @description:de  Entfernt die KI-generierten Kapitel von YouTube aus Videos. Vom Ersteller angelegte Kapitel bleiben sichtbar.
// @description:es  Elimina los capítulos generados por IA de YouTube en los vídeos. Los capítulos creados por el autor siguen visibles.
// @description:fr  Supprime les chapitres générés par l’IA de YouTube dans les vidéos. Les chapitres ajoutés par les créateurs restent visibles.
// @description:it  Rimuove i capitoli generati dall’IA di YouTube dai video. I capitoli creati dall’autore restano visibili.
// @author       moocj
// @license      MIT
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://m.youtube.com/*
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

  var VERSION = '1.2.2';
  var CLASS = 'yt-auto-chapters';
  var STYLE_ID = 'yt-remove-ai-chapters-style';
  var ATTR_STRIPPED = 'data-ytrac-stripped';
  var IS_MOBILE = location.hostname === 'm.youtube.com';

  var CSS = [
    'body.' + CLASS + ' .ytp-chapter-container,',
    'body.' + CLASS + ' .ytp-chapter-title,',
    'body.' + CLASS + ' .ytp-chapter-title-content,',
    'body.' + CLASS + ' button[class*="chapter-title"],',
    'body.' + CLASS + ' .ytp-exp-chapter-hover-effect,',
    'body.' + CLASS + ' .ytp-fine-scrubbing-chapter-title,',
    'body.' + CLASS + ' .ytp-tooltip-progress-bar-pill-title,',
    'body.' + CLASS + ' ytd-macro-markers-list-renderer,',
    'body.' + CLASS + ' ytd-engagement-panel-section-list-renderer[target-id*="macro-markers"],',
    // Mobile (m.youtube.com) guesses - verify with Web Inspector
    'body.' + CLASS + ' ytm-macro-markers-list-renderer,',
    'body.' + CLASS + ' ytm-engagement-panel[target-id*="macro-markers"],',
    'body.' + CLASS + ' [target-id*="macro-markers-auto-chapters"],',
    'body.' + CLASS + ' [class*="chapter-title" i],',
    'body.' + CLASS + ' [class*="chaptertitle" i],',
    'body.' + CLASS + ' [class*="chapter-container" i],',
    'body.' + CLASS + ' [class*="chapters-button" i],',
    'body.' + CLASS + ' [class*="chapter-button" i],',
    'body.' + CLASS + ' [class*="chapters-entry" i],',
    'body.' + CLASS + ' button[aria-label*="chapter" i],',
    'body.' + CLASS + ' [role="button"][aria-label*="chapter" i]',
    '{ display: none !important; }',
    'body.' + CLASS + ' .ytp-chapter-hover-container',
    '{ margin-right: 0 !important; }',
    'body.' + CLASS + ' button.ytwPlayerTimeDisplayPlayerBarButton[aria-label*="chapter" i]',
    '{ display: none !important; }',
    'body.' + CLASS + ' button[aria-label="View Chapters"]',
    '{ display: none !important; }'
  ].join(' ');


  var AUTO_PANEL_SELECTOR = '[target-id*="macro-markers-auto-chapters"]';
  var DESC_PANEL_SELECTOR = '[target-id*="macro-markers-description-chapters"]';

  function debugEnabled() {
    try { if (location.search.indexOf('ytrac-debug=1') !== -1) return true; } catch (e) { }
    try { if (localStorage.getItem('ytrac:debug') === '1') return true; } catch (e) { }
    try { if (window.__ytRemoveAiChaptersDebug) return true; } catch (e) { }
    return false;
  }
  var debug = debugEnabled();
  function log() {
    if (!debug) return;
    try { console.log.apply(console, ['[Remove AI Chapters]'].concat([].slice.call(arguments))); }
    catch (e) { /* ignore */ }
  }

  var wantClass = false;
  var scheduled = false;
  var lastVideoId = null;

  function currentVideoId() {
    try {
      var m = location.search.match(/[?&]v=([^&]+)/);
      if (m) return m[1];
      m = location.pathname.match(/^\/(?:shorts|live)\/([^/?#]+)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }
  lastVideoId = currentVideoId();

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

  function jsonStripped() {
    try { return document.documentElement.hasAttribute(ATTR_STRIPPED); } catch (e) { return false; }
  }

  function domHasAutoChapters() {
    try {
      return !!document.querySelector(AUTO_PANEL_SELECTOR) && !document.querySelector(DESC_PANEL_SELECTOR);
    } catch (e) { return false; }
  }

  function recompute(why) {
    var next = jsonStripped() || domHasAutoChapters();
    if (next !== wantClass) log('chapters state -> ' + next + ' (' + why + ')');
    wantClass = next;
    sync();
  }

  // Mobile fallback: m.youtube.com may not fire the yt-navigate-* events,
  // so detect video changes by URL and reset the stripped flag.
  function checkVideoChange(why) {
    if (!IS_MOBILE) return;
    var vid = currentVideoId();
    if (vid !== lastVideoId) {
      log('video changed ' + lastVideoId + ' -> ' + vid + ' (' + why + ')');
      lastVideoId = vid;
      try { document.documentElement.removeAttribute(ATTR_STRIPPED); } catch (e) { }
      wantClass = false;
    }
  }

  function schedule(why) {
    if (scheduled) return;
    scheduled = true;
    function run() { scheduled = false; sync(); checkVideoChange(why); recompute(why); }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 50);
  }



  var pw = window;
  var mode = 'direct';
  try {
    if (window.wrappedJSObject && window.wrappedJSObject !== window) { pw = window.wrappedJSObject; mode = 'wrappedJSObject'; }
    else if (typeof unsafeWindow !== 'undefined' && unsafeWindow !== window) { pw = unsafeWindow; mode = 'unsafeWindow'; }
  } catch (e) { }

  // Make a sandbox function callable by page code for Greasemonkey support.
  function exp(fn) {
    try {
      if (pw !== window && typeof exportFunction === 'function') {
        return exportFunction(fn, pw, { allowCrossOriginArguments: true });
      }
    } catch (e) { }
    return fn;
  }

  function unwrap(o) {
    try { return (o && o.wrappedJSObject) || o; } catch (e) { return o; }
  }

  function markStripped(how) {
    if (!jsonStripped()) log('AI chapters stripped from page data (' + how + ')');
    try { document.documentElement.setAttribute(ATTR_STRIPPED, '1'); } catch (e) { }
    schedule('data-' + how);
  }

  function strip(root) {
    var Arr = pw.Array || Array;
    var stripped = false;
    var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
    var stack = [unwrap(root)];
    while (stack.length) {
      var o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      if (seen) {
        if (seen.has(o)) continue;
        seen.add(o);
      }

      // Remove AI markers, unless the creator also supplied chapters.
      var mm = o.markersMap;
      if (Array.isArray(mm)) {
        var hasAuto = false, hasDesc = false, j;
        for (j = 0; j < mm.length; j++) {
          var key = mm[j] && mm[j].key;
          if (key === 'AUTO_CHAPTERS') hasAuto = true;
          else if (key === 'DESCRIPTION_CHAPTERS') hasDesc = true;
        }
        if (hasAuto && !hasDesc) {
          var nm = new Arr();
          for (j = 0; j < mm.length; j++) {
            if (!(mm[j] && mm[j].key === 'AUTO_CHAPTERS')) nm.push(mm[j]);
          }
          o.markersMap = nm;
          stripped = true;
        }
      }

      var ep = o.engagementPanels;
      if (Array.isArray(ep)) {
        var np = new Arr(), removed = false, k;
        for (k = 0; k < ep.length; k++) {
          var r = ep[k] && ep[k].engagementPanelSectionListRenderer;
          if (/auto-chapters/i.test((r && r.targetId) || '')) removed = true;
          else np.push(ep[k]);
        }
        if (removed) {
          o.engagementPanels = np;
          stripped = true;
        }
      }

      var own = Object.keys(o);
      for (var i = 0; i < own.length; i++) {
        try { stack.push(o[own[i]]); } catch (e) { }
      }
    }
    return stripped;
  }

  function installHooks() {
    var ok = { parse: false, fetch: false, initial: false };

    // SPA navigation: /next responses are parsed with JSON.parse.
    try {
      var pageJSON = pw.JSON;
      var nativeParse = pageJSON.parse;
      pageJSON.parse = exp(function (text, reviver) {
        var result = arguments.length > 1
          ? nativeParse.call(pageJSON, text, reviver)
          : nativeParse.call(pageJSON, text);
        try {
          if (typeof text === 'string' && /AUTO_CHAPTERS|auto-chapters/.test(text) && strip(result)) {
            markStripped('JSON.parse');
          }
        } catch (e) { }
        return result;
      });
      ok.parse = true;
    } catch (e) { log('JSON.parse hook failed', e); }

    try {
      var RP = pw.Response.prototype;
      var nativeRespJson = RP.json;
      RP.json = exp(function () {
        var self = unwrap(this);
        var p = nativeRespJson.call(self);
        var url = '';
        try { url = self.url || ''; } catch (e) { }
        if (url.indexOf('/youtubei/') === -1) return p;
        return p.then(exp(function (data) {
          try { if (strip(data)) markStripped('fetch'); } catch (e) { }
          return data;
        }));
      });
      ok.fetch = true;
    } catch (e) { log('Response.json hook failed', e); }

    try {
      var initialData = pw.ytInitialData;
      Object.defineProperty(pw, 'ytInitialData', {
        configurable: true,
        enumerable: true,
        get: exp(function () { return initialData; }),
        set: exp(function (value) {
          try { if (strip(value)) markStripped('ytInitialData'); } catch (e) { }
          initialData = value;
        })
      });
      if (initialData) {
        try { if (strip(initialData)) markStripped('ytInitialData'); } catch (e) { }
      }
      ok.initial = true;
    } catch (e) { log('ytInitialData hook failed', e); }

    log('v' + VERSION + ' loaded | host: ' + location.hostname + ' | mode: ' + mode +
      ' | hooks: JSON.parse=' + ok.parse + ' fetch=' + ok.fetch + ' ytInitialData=' + ok.initial +
      ' | DOM fallback: active');
  }

  installHooks();

  schedule('init');

  if (typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function () { schedule('mutation'); });
    try { observer.observe(document, { childList: true, subtree: true }); }
    catch (e) { /* ignore */ }
  }

  window.addEventListener('yt-navigate-start', function () {
    try { document.documentElement.removeAttribute(ATTR_STRIPPED); } catch (e) { }
    wantClass = false;
    syncClass();
    schedule('navigate-start');
  }, true);

  ['yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated'].forEach(function (name) {
    window.addEventListener(name, function () { schedule(name); }, true);
  });

  // Extra navigation signals for mobile / Safari
  window.addEventListener('popstate', function () { schedule('popstate'); }, true);
  window.addEventListener('state-navigatestart', function () { schedule('state-navigatestart'); }, true);
})();