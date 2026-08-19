// Sula — resume injection.
//
// Reads a job posting, pulls out the terms an ATS and a human screener will
// look for, compares them against the user's existing resume, and reports what
// is missing. For each gap it offers a rewrite of one of the user's OWN bullets
// that surfaces the term, rather than inventing experience.
//
// The honesty rule is the whole design:
//   * A term is only "covered" if it is genuinely in the resume.
//   * A suggested bullet is a rewrite of a real bullet the user wrote. Sula
//     never fabricates a job, a tool, a metric, or a result.
//   * Anything the user cannot truthfully claim is listed as a gap to close,
//     not as text to paste.
//
// Pure and DOM-free apart from readJobPage(). window.SulaResumeInjection

(() => {
  "use strict";

  // Words that carry no signal for matching. Kept small on purpose -- an
  // over-eager stoplist quietly drops real skills ("go", "r", "c").
  const STOP = new Set([
    "the","and","for","with","you","your","our","are","will","that","this","have","has",
    "from","into","about","their","them","they","its","not","but","all","any","can","may",
    "who","what","when","where","how","why","a","an","of","to","in","on","at","as","by",
    "or","is","be","we","us","it","if","so","up","out","do","does","done","more","most",
    "role","team","work","working","years","year","experience","strong","ability","able",
    "including","etc","new","across","within","using","use","used","help","helping","join",
    "looking","seeking","ideal","candidate","candidates","required","preferred","plus",
    "responsibilities","qualifications","requirements","benefits","apply","company",
    "opportunity","position","job","please","must","should","would","could","other",
    "well","also","own","end","full","time","per","via","one","two","three","great",
    "good","best","like","need","needs","want","make","made","build","building",
  ]);

  // Multi-word phrases worth catching as a unit. Single-token matching misses
  // these, and they are exactly what a screener greps for.
  const PHRASES = [
    "product management","product manager","product strategy","product roadmap",
    "go to market","go-to-market","cross functional","cross-functional",
    "stakeholder management","user research","customer research","a/b testing",
    "data driven","data-driven","machine learning","artificial intelligence",
    "project management","agile","scrum","kanban","okrs","kpis",
    "product lifecycle","user experience","customer experience","market research",
    "competitive analysis","road mapping","roadmapping","p&l","gtm",
    "sql","python","javascript","typescript","react","node","aws","azure","gcp",
    "figma","jira","confluence","tableau","looker","amplitude","mixpanel",
    "salesforce","hubspot","segment","snowflake","databricks","kubernetes","docker",
    "api","apis","rest","graphql","saas","b2b","b2c","crm","erp","etl",
    "stakeholder","roadmap","backlog","discovery","prioritization","monetization",
    "churn","retention","activation","onboarding","conversion","funnel",
  ];

  function norm(s) {
    return String(s || "").toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ");
  }

  // Pure: pull candidate keywords out of posting text, ranked by frequency.
  function extractKeywords(text, limit) {
    const t = norm(text);
    if (!t) return [];
    const counts = new Map();

    for (const p of PHRASES) {
      // Count non-overlapping occurrences of the phrase.
      let i = 0, n = 0;
      while ((i = t.indexOf(p, i)) !== -1) { n++; i += p.length; }
      if (n) counts.set(p, (counts.get(p) || 0) + n * 3); // phrases outrank tokens
    }

    const tokens = t.match(/[a-z][a-z0-9+#./-]{1,}/g) || [];
    for (const tok of tokens) {
      const w = tok.replace(/^[./-]+|[./-]+$/g, "");
      if (w.length < 3 || STOP.has(w)) continue;
      if (/^\d+$/.test(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit || 40)
      .map(([term, weight]) => ({ term, weight }));
  }

  // Pure: which extracted terms already appear in the resume?
  // Substring match on normalized text, so "roadmaps" covers "roadmap".
  function coverage(keywords, resumeText) {
    const r = norm(resumeText);
    const covered = [], missing = [];
    for (const k of keywords || []) {
      const term = norm(k.term);
      const hit = r.includes(term) ||
        (term.endsWith("s") && r.includes(term.slice(0, -1))) ||
        r.includes(term.replace(/-/g, " ")) ||
        r.includes(term.replace(/\s/g, "-"));
      (hit ? covered : missing).push(k);
    }
    const total = (keywords || []).length;
    return {
      covered,
      missing,
      score: total ? Math.round((covered.length / total) * 100) : 0,
    };
  }

  // Split a resume into bullet-ish lines we can offer to rewrite.
  //
  // Header lines (name, section titles, company/date rows) must not qualify --
  // offering to rewrite somebody's name line is nonsense, and a header has no
  // verb to hang a claim on. A real accomplishment bullet has a verb and does
  // not read as Title Case Throughout.
  function resumeBullets(resumeText) {
    const SECTION = /^(experience|education|skills|summary|projects|certifications|contact|profile)\b/i;
    return String(resumeText || "")
      .split(/\r?\n/)
      .map((l) => l.replace(/^[\s•\-*+·]+/, "").trim())
      .filter((l) => {
        if (l.length < 30 || !/[a-z]/.test(l)) return false;
        if (SECTION.test(l)) return false;
        // A header is mostly capitalised words and has no sentence verb.
        const words = l.split(/\s+/).filter(Boolean);
        const capish = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
        if (words.length && capish / words.length > 0.6) return false;
        // Needs at least one lowercase verb-ish token to be a claim.
        return /\b(ed|ing|s)\b|\b[a-z]{3,}(ed|ing)\b|\b(led|ran|built|own|owns|owned|drove|cut|grew|shipped|managed|launched)\b/i.test(l);
      });
  }

  // Score how well a bullet could host a term: prefer bullets that already
  // share vocabulary with the posting, so the rewrite stays truthful and close
  // to what the user actually did.
  // `used` is an optional Map of bullet -> how many gaps already point at it,
  // so a caller building several suggestions can spread them across the resume.
  function bestHostBullet(term, bullets, keywords, used) {
    const words = new Set(
      (keywords || []).map((k) => norm(k.term)).filter((w) => w.length > 3)
    );
    let best = null, bestScore = -1;
    // Topic words from the term itself. A gap for "a/b testing" belongs on the
    // bullet about experiments, not on whichever bullet happens to share the
    // most generic posting vocabulary -- that was picking one global winner and
    // hanging every single gap off it.
    const termWords = norm(term).split(/[^a-z0-9+#]+/).filter((w) => w.length > 2);

    for (const b of bullets || []) {
      const nb = norm(b);
      let score = 0;
      // Direct topical affinity dominates.
      for (const w of termWords) if (nb.includes(w)) score += 6;
      // Then general overlap with the posting's language.
      for (const w of words) if (nb.includes(w)) score++;
      // A shorter bullet has more room to absorb a phrase.
      score += Math.max(0, 3 - Math.floor(nb.length / 90));
      // Penalise a bullet already carrying suggestions so the gaps spread out
      // instead of stacking on one line the user then has to rewrite eight ways.
      score -= (used && used.get(b)) ? (used.get(b) * 4) : 0;
      if (score > bestScore) { bestScore = score; best = b; }
    }
    return best;
  }

  // Build the report. Every suggestion points at a real bullet; nothing is
  // invented. `verify` is what the user must confirm is true before using it.
  function buildReport(jobText, resumeText, opts) {
    const o = opts || {};
    const keywords = extractKeywords(jobText, o.limit || 30);
    const cov = coverage(keywords, resumeText);
    const bullets = resumeBullets(resumeText);

    // Track how many gaps already point at each bullet so they spread out.
    const used = new Map();
    const suggestions = cov.missing.slice(0, o.maxSuggestions || 8).map((k) => {
      const host = bestHostBullet(k.term, bullets, keywords, used);
      if (host) used.set(host, (used.get(host) || 0) + 1);
      return {
        term: k.term,
        weight: k.weight,
        hostBullet: host || null,
        // Deliberately a prompt, not a finished lie. The user supplies the fact.
        action: host
          ? 'Rewrite this bullet so "' + k.term + '" appears, if it is true of the work you did.'
          : 'No matching bullet found. Add "' + k.term + '" only if you have real experience with it.',
        verify: "Only use this if it accurately describes your own work.",
      };
    });

    return {
      score: cov.score,
      matched: cov.covered.map((k) => k.term),
      missing: cov.missing.map((k) => k.term),
      suggestions,
      bulletCount: bullets.length,
      disclaimer:
        "Sula surfaces the terms this posting emphasises and shows which ones your " +
        "resume already supports. It rewrites your own bullets; it never invents " +
        "experience. Every claim you send is yours to stand behind.",
    };
  }

  // Read the posting off the page the user is on.
  function readJobPage() {
    if (typeof document === "undefined") return { title: "", text: "" };
    const sel = [
      '[class*="job-description"]', '[class*="jobDescription"]',
      '[id*="job-description"]', '[data-testid*="jobDescription"]',
      '[class*="description"]', "article", "main",
    ];
    let el = null;
    for (const s of sel) {
      try {
        const c = document.querySelector(s);
        if (c && (c.innerText || "").length > 400) { el = c; break; }
      } catch (_) {}
    }
    const text = ((el || document.body || {}).innerText || "").slice(0, 20000);
    return { title: document.title || "", text };
  }

  const api = {
    extractKeywords, coverage, resumeBullets, bestHostBullet,
    buildReport, readJobPage, PHRASES, STOP,
  };
  if (typeof window !== "undefined") window.SulaResumeInjection = api;
})();
