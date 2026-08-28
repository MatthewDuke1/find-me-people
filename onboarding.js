// Sula — First-run walkthrough.
//
// Non-technical users are Sula's main audience, and the popup drops them
// straight into a list of contacts with no explanation of what the tool does
// or that it has more than one job. This is a one-time, 4-step welcome overlay
// that introduces the features in plain language the first time the popup is
// opened, then never shows again.
//
// Self-contained on purpose: injects its own styles and markup, owns a single
// storage flag (`sula_onboarded`), and exposes window.SulaOnboarding.maybeShow()
// for popup.js to call once the popup has initialised. Skipping or finishing
// sets the flag, so it fires at most once per user. Fully keyboard-navigable
// and respects prefers-reduced-motion.

(() => {
  "use strict";

  const FLAG = "sula_onboarded";

  // Steps are ordered by what a non-technical user cares about first: the
  // core promise, then that it's automatic, then the money-back tools, then
  // the privacy reassurance. Copy is plain — no jargon, no feature names the
  // user hasn't earned yet.
  const STEPS = [
    {
      emoji: "🔎",
      title: "The real phone number, found for you",
      body: "Stuck in a chatbot loop? Sula digs out the actual support email and phone number for the site you're on — and ranks them so the one most likely to reach a human is right at the top.",
    },
    {
      emoji: "✨",
      title: "It just works, on every site",
      body: "There's no button to press. Sula quietly checks each page as you browse, and the little number on its icon tells you how many contacts it found. Click the icon any time to see them.",
    },
    {
      emoji: "💸",
      title: "Get your money back",
      body: "Sula is on your side. It shows your refund deadline, drafts the letter that actually gets a refund, guides a card dispute, and helps you cancel subscriptions — you always read it and hit send yourself.",
    },
    {
      emoji: "🔒",
      title: "Your info never leaves your device",
      body: "All of this happens right here in your browser. No account, no tracking, nothing sold. That's the whole point. Ready when you are.",
    },
  ];

  function injectStyles() {
    if (document.getElementById("sula-onb-styles")) return;
    const css = `
      #sula-onb {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(6, 6, 8, 0.86);
        display: flex; align-items: center; justify-content: center;
        padding: 18px;
        -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
      }
      #sula-onb .onb-card {
        background: #111113; border: 1px solid #262629; border-radius: 14px;
        width: 100%; max-width: 320px; padding: 22px 20px 18px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        animation: onb-in 0.32s cubic-bezier(0.22,0.68,0,1);
      }
      @keyframes onb-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) { #sula-onb .onb-card { animation: none; } }
      #sula-onb .onb-emoji { font-size: 34px; line-height: 1; margin-bottom: 12px; }
      #sula-onb .onb-title {
        font-size: 16px; font-weight: 700; color: #fafafa; line-height: 1.25;
        margin-bottom: 8px;
      }
      #sula-onb .onb-body { font-size: 13px; line-height: 1.55; color: #a1a1aa; }
      #sula-onb .onb-dots { display: flex; gap: 6px; margin: 18px 0 16px; }
      #sula-onb .onb-dot { width: 7px; height: 7px; border-radius: 50%; background: #333338; transition: background 0.2s, width 0.2s; }
      #sula-onb .onb-dot.active { background: #60a5fa; width: 18px; border-radius: 4px; }
      #sula-onb .onb-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      #sula-onb .onb-skip {
        background: none; border: none; color: #71717a; font-size: 12px;
        cursor: pointer; font-family: inherit; padding: 6px 4px;
      }
      #sula-onb .onb-skip:hover { color: #a1a1aa; }
      #sula-onb .onb-next {
        background: #60a5fa; color: #07101f; border: none; border-radius: 8px;
        font-size: 13px; font-weight: 700; padding: 9px 18px; cursor: pointer;
        font-family: inherit; transition: background 0.15s, transform 0.15s;
      }
      #sula-onb .onb-next:hover { background: #93c5fd; transform: translateY(-1px); }
      #sula-onb .onb-next:active { transform: translateY(0); }
      #sula-onb button:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
    `;
    const style = document.createElement("style");
    style.id = "sula-onb-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function markDone() {
    try { chrome.storage.local.set({ [FLAG]: true }); } catch (_e) { /* non-fatal */ }
  }

  function show() {
    injectStyles();
    let i = 0;

    const overlay = document.createElement("div");
    overlay.id = "sula-onb";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Welcome to Sula");

    overlay.innerHTML = `
      <div class="onb-card">
        <div class="onb-emoji" id="onb-emoji"></div>
        <div class="onb-title" id="onb-title"></div>
        <div class="onb-body" id="onb-body"></div>
        <div class="onb-dots" id="onb-dots" aria-hidden="true"></div>
        <div class="onb-actions">
          <button class="onb-skip" id="onb-skip" type="button">Skip</button>
          <button class="onb-next" id="onb-next" type="button">Next</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const emojiEl = overlay.querySelector("#onb-emoji");
    const titleEl = overlay.querySelector("#onb-title");
    const bodyEl = overlay.querySelector("#onb-body");
    const dotsEl = overlay.querySelector("#onb-dots");
    const skipBtn = overlay.querySelector("#onb-skip");
    const nextBtn = overlay.querySelector("#onb-next");

    dotsEl.innerHTML = STEPS.map(() => `<span class="onb-dot"></span>`).join("");
    const dots = Array.from(dotsEl.children);

    function render() {
      const s = STEPS[i];
      emojiEl.textContent = s.emoji;
      titleEl.textContent = s.title;
      bodyEl.textContent = s.body;
      dots.forEach((d, n) => d.classList.toggle("active", n === i));
      nextBtn.textContent = i === STEPS.length - 1 ? "Start using Sula" : "Next";
      skipBtn.style.visibility = i === STEPS.length - 1 ? "hidden" : "visible";
      nextBtn.focus();
    }

    function close() {
      markDone();
      overlay.remove();
    }

    nextBtn.addEventListener("click", () => {
      if (i < STEPS.length - 1) { i += 1; render(); }
      else { close(); }
    });
    skipBtn.addEventListener("click", close);

    // Keyboard: Esc skips, Enter/→ advances, ← goes back.
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); i -= 1; render(); }
      else if (e.key === "ArrowRight" && i < STEPS.length - 1) { e.preventDefault(); i += 1; render(); }
    });

    render();
  }

  // Called by popup.js after init. Shows the walkthrough only once, ever.
  function maybeShow() {
    try {
      chrome.storage.local.get([FLAG], (r) => {
        if (!r || !r[FLAG]) show();
      });
    } catch (_e) {
      // storage unavailable — skip onboarding rather than block the popup.
    }
  }

  window.SulaOnboarding = { maybeShow };
})();
