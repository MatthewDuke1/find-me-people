// Sula — Global Privacy Control (GPC), page-property half.
//
// GPC is a browser signal that tells a website "do not sell or share my
// personal information." Under CCPA/CPRA and a growing list of state laws
// (Texas, California, Colorado, Connecticut, Oregon, and more) it is a
// legally-binding opt-out, not a courtesy. Sula sends it on the user's behalf.
//
// GPC has two delivery channels:
//   1. The `Sec-GPC: 1` request header  -> handled declaratively by
//      gpc-rules.json (declarativeNetRequest), no code here.
//   2. The `navigator.globalPrivacyControl` JS property -> this file.
//
// Sites read the property from their OWN page context, so a content script
// (which runs in an isolated world) can't just set it there — it has to
// inject a tiny script into the page's real context. We do that at
// document_start so the property is present before the page's own scripts
// read it. Follows the W3C GPC spec: read-only, non-configurable, === true.
//
// Respects the user's toggle: if GPC is disabled we inject nothing, leaving
// `navigator.globalPrivacyControl` undefined exactly as if Sula weren't here.

(() => {
  "use strict";

  const GPC_KEY = "sula_gpc_enabled";

  function inject() {
    // Define the property in the page's own context. Guarded so we never
    // clobber a value the browser set natively (Firefox/Brave ship GPC).
    const code =
      "(function(){try{" +
      "if(navigator.globalPrivacyControl===undefined){" +
      "Object.defineProperty(Navigator.prototype,'globalPrivacyControl'," +
      "{get:function(){return true;},configurable:false,enumerable:true});" +
      "}}catch(e){}})();";
    const s = document.createElement("script");
    s.textContent = code;
    // documentElement exists at document_start; prepend so it runs first.
    (document.head || document.documentElement).prepend(s);
    s.remove();
  }

  // Default ON: absence of the key, or anything other than an explicit false,
  // means enabled. Matches how the side-panel toggle treats its default.
  try {
    chrome.storage.local.get([GPC_KEY], (r) => {
      if (r && r[GPC_KEY] === false) return; // user turned it off
      inject();
    });
  } catch (_e) {
    // storage unavailable (rare) — fail open to the privacy-protective default.
    inject();
  }
})();
