(() => {
  // ================================================================
  // CF Rating Filter - problem explorer on Codeforces profile pages
  // ================================================================

  const m = location.pathname.match(/^\/profile\/([^/]+)/);
  if (!m) return;
  const handle = decodeURIComponent(m[1]);

  if (document.getElementById("cf-rating-card")) return;
  const host = document.querySelector("#pageContent");
  if (!host) return;

  const meLink =
    document.querySelector('.lang-chooser a[href^="/profile/"]') ||
    document.querySelector('#header a[href^="/profile/"]');
  const myHandle = meLink
    ? decodeURIComponent(meLink.getAttribute("href").split("/profile/")[1] || "").split(/[/?#]/)[0]
    : null;
  const isOwnProfile = !!myHandle && myHandle.toLowerCase() === handle.toLowerCase();

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    }
    n.append(...kids);
    return n;
  }

  const fmtDate = (t) => new Date(t * 1000).toLocaleDateString("en-GB");
  const fmtDateTime = (t) => new Date(t * 1000).toLocaleString("en-GB");

  function problemUrl(p) {
    // contest ids >= 100000 are gym contests
    return p.contestId >= 100000
      ? `https://codeforces.com/gym/${p.contestId}/problem/${p.index}`
      : `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;
  }

  function submissionUrl(p, id) {
    return p.contestId >= 100000
      ? `https://codeforces.com/gym/${p.contestId}/submission/${id}`
      : `https://codeforces.com/contest/${p.contestId}/submission/${id}`;
  }

  function verdictText(v) {
    return v === "OK" ? "Accepted" : v.replace(/_/g, " ").toLowerCase();
  }

  function ratingClass(r) {
    if (r < 1200) return "user-gray";
    if (r < 1400) return "user-green";
    if (r < 1600) return "user-cyan";
    if (r < 1900) return "user-blue";
    if (r < 2100) return "user-violet";
    if (r < 2400) return "user-orange";
    return "user-red";
  }

  let lastApiCall = 0;
  async function api(url) {
    const wait = lastApiCall + 2100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastApiCall = Date.now();
    let data;
    try {
      const res = await fetch(url);
      data = await res.json();
    } catch (e) {
      throw new Error("could not reach the Codeforces API (rate limit? try again in a few seconds)");
    }
    if (data.status !== "OK") throw new Error(data.comment || "Codeforces API returned an error");
    return data.result;
  }

  const CACHE_TTL = 10 * 60 * 1000;
  const cacheKey = (h) => "cfrf2:" + h.toLowerCase(); // bump prefix when the cached shape changes
  function cacheGet(h) {
    try {
      const raw = sessionStorage.getItem(cacheKey(h));
      if (!raw) return null;
      const o = JSON.parse(raw);
      return Date.now() - o.t > CACHE_TTL ? null : o.d;
    } catch (e) {
      return null;
    }
  }
  function cacheSet(h, d) {
    try {
      sessionStorage.setItem(cacheKey(h), JSON.stringify({ t: Date.now(), d }));
    } catch (e) {
      /* storage full or blocked - fine, just skip caching */
    }
  }

  function buildProblems(result) {
    const map = new Map();
    for (const sub of result) {
      const p = sub.problem;
      if (!p || typeof p.rating !== "number") continue; // unrated problems can't match a rating filter
      const key = `${p.contestId}-${p.index}`;
      let e = map.get(key);
      if (!e) {
        e = {
          key,
          name: p.name,
          rating: p.rating,
          tags: p.tags || [],
          contestId: p.contestId,
          index: p.index,
          solved: false,
          solvedAt: null, // first accepted submission
          lastAt: 0, // latest submission of any kind
          inContest: false, // tried while a contest was running (not practice/virtual)
          subs: [],
        };
        map.set(key, e);
      }
      const ptype = sub.author && sub.author.participantType;
      if (ptype === "CONTESTANT" || ptype === "OUT_OF_COMPETITION") e.inContest = true;
      const t = sub.creationTimeSeconds;
      if (sub.verdict === "OK") {
        e.solved = true;
        e.solvedAt = e.solvedAt === null ? t : Math.min(e.solvedAt, t);
      }
      e.lastAt = Math.max(e.lastAt, t);
      e.subs.push({
        id: sub.id,
        verdict: sub.verdict || "TESTING",
        lang: sub.programmingLanguage,
        time: t,
      });
    }
    return map;
  }

  async function fetchUser(h) {
    const cached = cacheGet(h);
    if (cached) return new Map(cached.map((e) => [e.key, e]));
    const result = await api(
      `https://codeforces.com/api/user.status?handle=${encodeURIComponent(h)}&lang=en`
    );
    const map = buildProblems(result);
    cacheSet(h, [...map.values()]);
    return map;
  }

  const style = el("style");
  style.textContent = `
    #cf-rating-card .cfrf-body { padding: 12px 14px 14px; }

    /* toolbar: labelled fields */
    #cf-rating-card .cfrf-toolbar { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: flex-end; margin-bottom: 10px; }
    #cf-rating-card .cfrf-field { display: flex; flex-direction: column; gap: 3px; }
    #cf-rating-card .cfrf-flabel { font-size: 11px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.04em; }
    #cf-rating-card .cfrf-fctrl { display: flex; align-items: center; gap: 6px; }
    #cf-rating-card .cfrf-count { margin-left: auto; font-weight: bold; opacity: 0.85; padding-bottom: 3px; }

    /* action buttons */
    #cf-rating-card .cfrf-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 0; border-top: 1px solid rgba(128,128,128,0.25); }
    #cf-rating-card .cfrf-spacer { flex: 1 1 auto; }
    #cf-rating-card button { padding: 3px 10px; cursor: pointer; }
    #cf-rating-card button.cfrf-toggle.active { background-color: rgba(88,166,255,0.28); box-shadow: inset 0 0 0 1px rgba(88,166,255,0.9); font-weight: bold; }

    /* panels (tag stats, suggestions) */
    #cf-rating-card .cfrf-panel { margin-bottom: 12px; padding: 10px 12px; border: 1px solid rgba(128,128,128,0.4); border-radius: 4px; background: rgba(128,128,128,0.07); }
    #cf-rating-card .cfrf-panel-title { font-weight: bold; font-size: 14px; }
    #cf-rating-card .cfrf-panel-sub { opacity: 0.72; font-size: 12px; margin: 2px 0 8px; }
    #cf-rating-card .cfrf-scroll { max-height: 300px; overflow-y: auto; }

    #cf-rating-card .cfrf-summary { opacity: 0.75; margin-bottom: 8px; }
    #cf-rating-card .cfrf-muted { opacity: 0.7; }

    /* rating chips */
    #cf-rating-card .cfrf-dist { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
    #cf-rating-card .cfrf-chip { border: 1px solid rgba(128,128,128,0.5); border-radius: 11px; padding: 1px 10px; font-size: 12px; cursor: pointer; user-select: none; }
    #cf-rating-card .cfrf-chip:hover { background: rgba(128,128,128,0.18); }
    #cf-rating-card .cfrf-chip.active { background: rgba(88,166,255,0.28); border-color: rgba(88,166,255,0.9); font-weight: bold; }

    /* tables */
    #cf-rating-card .cfrf-list { max-height: 480px; overflow-y: auto; border: 1px solid rgba(128,128,128,0.3); border-radius: 4px; }
    #cf-rating-card .cfrf-empty { padding: 14px; opacity: 0.75; }
    #cf-rating-card table.cfrf-table { width: 100%; border-collapse: collapse; }
    #cf-rating-card .cfrf-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.75; padding: 6px 10px; border-bottom: 1px solid rgba(128,128,128,0.5); white-space: nowrap; }
    #cf-rating-card .cfrf-table td { padding: 6px 10px; border-bottom: 1px solid rgba(128,128,128,0.2); vertical-align: middle; }
    #cf-rating-card .cfrf-table tbody tr:last-child td { border-bottom: none; }
    #cf-rating-card .cfrf-table .num { text-align: right; white-space: nowrap; }
    #cf-rating-card .cfrf-table tbody tr.cfrf-row:hover td,
    #cf-rating-card .cfrf-table tbody tr.cfrf-click:hover td { background: rgba(128,128,128,0.12); }
    #cf-rating-card .cfrf-table tr.cfrf-click { cursor: pointer; }
    #cf-rating-card .cfrf-table tr.cfrf-detail td { font-size: 12px; padding: 6px 10px 8px 22px; border-left: 2px solid rgba(128,128,128,0.45); background: rgba(128,128,128,0.06); }
    #cf-rating-card .cfrf-pid { opacity: 0.6; font-size: 12px; margin-right: 8px; font-variant-numeric: tabular-nums; }
    #cf-rating-card .cfrf-rating { font-weight: bold; }

    /* small bits */
    #cf-rating-card .tag-box { display: inline-block; padding: 0 6px; margin: 1px 3px 1px 0; border-radius: 3px; font-size: 11px; background: rgba(128,128,128,0.2); white-space: nowrap; }
    #cf-rating-card .tag-box.cfrf-weak { background: rgba(229,83,75,0.22); color: #e5534b; font-weight: bold; margin-left: 6px; }
    #cf-rating-card .cfrf-badge { display: inline-block; padding: 0 8px; border-radius: 9px; font-size: 11px; border: 1px solid rgba(128,128,128,0.5); }
    #cf-rating-card .cfrf-badge.tried { background: rgba(217,162,27,0.25); border-color: rgba(217,162,27,0.8); }
    #cf-rating-card .cfrf-bar { display: inline-block; width: 64px; height: 6px; border-radius: 3px; background: rgba(128,128,128,0.28); overflow: hidden; vertical-align: middle; margin-right: 8px; }
    #cf-rating-card .cfrf-bar > i { display: block; height: 100%; }
    #cf-rating-card .cfrf-bar.hi > i { background: #3fb950; }
    #cf-rating-card .cfrf-bar.mid > i { background: #d9a21b; }
    #cf-rating-card .cfrf-bar.lo > i { background: #e5534b; }
    #cf-rating-card .verdict-accepted { color: #0a0; font-weight: bold; }
    #cf-rating-card .verdict-rejected { color: #d00; }
  `;

  const card = el("div", {
    id: "cf-rating-card",
    class: "roundbox borderTopRound borderBottomRound",
    style: "margin-top: 1em;",
  });
  const caption = el("div", { class: "caption titled", text: `→ Problem explorer: ${handle}` });
  const body = el("div", { class: "cfrf-body" });

  const mkSelect = (opts, value) => {
    const s = el("select");
    for (const [v, t, disabled] of opts) {
      const o = el("option", { value: v, text: t });
      if (disabled) o.disabled = true;
      s.appendChild(o);
    }
    if (value !== undefined) s.value = value;
    return s;
  };

  const field = (label, ...ctrls) =>
    el(
      "div",
      { class: "cfrf-field" },
      el("span", { class: "cfrf-flabel", text: label }),
      el("div", { class: "cfrf-fctrl" }, ...ctrls)
    );

  const ratings = [];
  for (let r = 800; r <= 3500; r += 100) ratings.push([String(r), String(r)]);
  const minSel = mkSelect(ratings, "900");
  const maxSel = mkSelect(ratings, "900");

  const modeOpts = [
    ["solved", "Solved (accepted)"],
    ["attempted", "Attempted, not solved"],
    ["upsolve", "Upsolve queue (tried in contest, never solved)"],
  ];
  if (!isOwnProfile) {
    modeOpts.push(
      myHandle
        ? ["notme", `Solved by them, not by me (${myHandle})`]
        : ["notme", "Solved by them, not by me (log in to use)", true]
    );
  }
  const modeSel = mkSelect(modeOpts, "solved");
  const tagSel = mkSelect([["", "All tags"]], "");
  const sortSel = mkSelect(
    [
      ["dateDesc", "Newest first"],
      ["dateAsc", "Oldest first"],
      ["ratingAsc", "Rating: low to high"],
      ["ratingDesc", "Rating: high to low"],
    ],
    "dateDesc"
  );
  const countSpan = el("span", { class: "cfrf-count" });

  const toolbar = el(
    "div",
    { class: "cfrf-toolbar" },
    field("Rating", minSel, el("span", { class: "cfrf-muted", text: "to" }), maxSel),
    field("Show", modeSel),
    field("Tag", tagSel),
    field("Sort", sortSel),
    countSpan
  );

  const randomBtn = el("button", { type: "button", text: "Random problem" });
  const copyBtn = el("button", { type: "button", text: "Copy Markdown" });
  const csvBtn = el("button", { type: "button", text: "Download CSV" });
  const exportMsg = el("span", { class: "cfrf-muted" });
  const statsBtn = el("button", { type: "button", class: "cfrf-toggle", "aria-pressed": "false", text: "Tag stats" });
  const recBtn = el("button", { type: "button", class: "cfrf-toggle", "aria-pressed": "false", text: "Suggest problems" });

  const actions = el(
    "div",
    { class: "cfrf-actions" },
    randomBtn,
    copyBtn,
    csvBtn,
    exportMsg,
    el("span", { class: "cfrf-spacer" }),
    statsBtn,
    recBtn
  );

  const summary = el("div", { class: "cfrf-summary" });
  const dist = el("div", { class: "cfrf-dist" });
  const listBox = el("div", { class: "cfrf-list" });
  listBox.appendChild(el("div", { class: "cfrf-empty", text: "Loading submissions..." }));

  const statsBox = el("div", { class: "cfrf-panel", style: "display:none;" });

  const recMin = mkSelect(ratings, "1200");
  const recMax = mkSelect(ratings, "1400");
  const recTagSel = mkSelect(
    [
      ["auto", "Weakest tags (auto)"],
      ["any", "Any tag"],
    ],
    "auto"
  );
  const recAgain = el("button", { type: "button", text: "Suggest again" });
  const recOut = el("div");
  const recBox = el(
    "div",
    { class: "cfrf-panel", style: "display:none;" },
    el("div", { class: "cfrf-panel-title", text: "Practice suggestions" }),
    el(
      "div",
      { class: "cfrf-toolbar", style: "margin: 8px 0 6px;" },
      field("Rating", recMin, el("span", { class: "cfrf-muted", text: "to" }), recMax),
      field("Tag", recTagSel),
      recAgain
    ),
    recOut
  );

  body.append(toolbar, actions, summary, statsBox, recBox, dist, listBox);
  card.append(style, caption, body);

  const activity = document.querySelector("._UserActivityFrame_frame");
  const anchor = activity ? activity.closest(".roundbox") || activity : null;
  if (anchor) anchor.insertAdjacentElement("afterend", card);
  else host.appendChild(card);

  const setListMessage = (msg) => {
    listBox.textContent = "";
    listBox.appendChild(el("div", { class: "cfrf-empty", text: msg }));
  };
  const ratingCell = (r) => el("td", {}, el("span", { class: `cfrf-rating ${ratingClass(r)}`, text: String(r) }));
  const tagsCell = (tags) => {
    const td = el("td");
    for (const t of tags) td.appendChild(el("span", { class: "tag-box", text: t }));
    return td;
  };
  const problemCell = (p) =>
    el(
      "td",
      {},
      el("span", { class: "cfrf-pid", text: `${p.contestId}${p.index}` }),
      el("a", { href: problemUrl(p), target: "_blank", rel: "noopener", text: p.name })
    );
  const headRow = (cols) =>
    el(
      "thead",
      {},
      el("tr", {}, ...cols.map(([t, num]) => el("th", { class: num ? "num" : "", text: t })))
    );

  let problems = null; // Map of this profile's rated problems
  let mySolved = null; // Set of keys the logged-in user has solved (loaded on demand)
  let loadingMe = false;
  let meError = null;
  let currentItems = [];
  let statsVisible = false;
  const MIN_TAG_PROBLEMS = 3; // tags with fewer attempted problems are hidden from tag stats
  const REC_POOL = 60; // suggestions are picked at random from this many most-solved matches
  const REC_COUNT = 10; // how many suggestions to show
  let recVisible = false;
  let recData = null; // all rated problems on Codeforces (problemset)
  let recRating = null; // the profile owner's current rating, if rated
  let recLoading = false;
  let recError = null;

  function baseList() {
    const mode = modeSel.value;
    const tag = tagSel.value;
    return [...problems.values()].filter((p) => {
      if (tag && !p.tags.includes(tag)) return false;
      if (mode === "solved") return p.solved;
      if (mode === "attempted") return !p.solved;
      if (mode === "upsolve") return p.inContest && !p.solved;
      if (mode === "notme") return p.solved && !!mySolved && !mySolved.has(p.key);
      return false;
    });
  }

  const activityTime = (p) => (p.solved ? p.solvedAt : p.lastAt);

  function sortItems(items) {
    const how = sortSel.value;
    const byDate = (a, b) => activityTime(a) - activityTime(b);
    if (how === "dateAsc") return items.sort(byDate);
    if (how === "ratingAsc") return items.sort((a, b) => a.rating - b.rating || activityTime(b) - activityTime(a));
    if (how === "ratingDesc") return items.sort((a, b) => b.rating - a.rating || activityTime(b) - activityTime(a));
    return items.sort((a, b) => byDate(b, a));
  }

  function renderDistribution(base) {
    dist.textContent = "";
    const counts = new Map();
    for (const p of base) counts.set(p.rating, (counts.get(p.rating) || 0) + 1);
    const lo = Number(minSel.value);
    const hi = Number(maxSel.value);

    dist.appendChild(el("span", { class: "cfrf-flabel", text: "By rating", style: "align-self:center;margin-right:2px;" }));

    const all = el("span", { class: "cfrf-chip", text: `All (${base.length})` });
    all.classList.toggle("active", lo === 800 && hi === 3500);
    all.addEventListener("click", () => {
      minSel.value = "800";
      maxSel.value = "3500";
      render();
    });
    dist.appendChild(all);

    for (const r of [...counts.keys()].sort((a, b) => a - b)) {
      const chip = el("span", { class: "cfrf-chip", text: `${r}: ${counts.get(r)}` });
      chip.classList.toggle("active", lo === r && hi === r);
      chip.addEventListener("click", () => {
        minSel.value = String(r);
        maxSel.value = String(r);
        render();
      });
      dist.appendChild(chip);
    }
  }

  function renderTable(items) {
    if (items.length === 0) {
      setListMessage("No problems found for this filter.");
      return;
    }

    const attemptedMode = modeSel.value === "attempted" || modeSel.value === "upsolve";
    const table = el("table", { class: "cfrf-table" });
    table.appendChild(
      headRow([
        ["Problem"],
        ["Rating"],
        ["Tags"],
        [attemptedMode ? "Last tried" : "Solved on"],
        ["Submissions", true],
      ])
    );

    const tbody = el("tbody");
    for (const p of items) {
      const toggle = el("a", {
        href: "#",
        text: `${p.subs.length} ▾`,
        title: "Show all submissions for this problem",
      });

      const row = el(
        "tr",
        { class: "cfrf-row" },
        problemCell(p),
        ratingCell(p.rating),
        tagsCell(p.tags),
        el("td", { text: fmtDate(activityTime(p)) }),
        el("td", { class: "num" }, toggle)
      );

      const detailCell = el("td", { colspan: "5" });
      for (const s of [...p.subs].sort((a, b) => b.time - a.time)) {
        const line = el("div");
        line.append(
          el("a", { href: submissionUrl(p, s.id), target: "_blank", rel: "noopener", text: `#${s.id}` }),
          document.createTextNode(" – "),
          el("span", {
            class: s.verdict === "OK" ? "verdict-accepted" : "verdict-rejected",
            text: verdictText(s.verdict),
          }),
          document.createTextNode(` – ${s.lang} – ${fmtDateTime(s.time)}`)
        );
        detailCell.appendChild(line);
      }
      const detail = el("tr", { class: "cfrf-detail", style: "display:none;" }, detailCell);

      toggle.addEventListener("click", (e) => {
        e.preventDefault();
        detail.style.display = detail.style.display === "none" ? "" : "none";
      });

      tbody.append(row, detail);
    }
    table.appendChild(tbody);
    listBox.textContent = "";
    listBox.appendChild(table);
  }

  function tagRows(lo, hi) {
    const byTag = new Map();
    for (const p of problems.values()) {
      if (p.rating < lo || p.rating > hi) continue;
      const okSubs = p.subs.filter((s) => s.verdict === "OK").length;
      for (const t of p.tags) {
        let s = byTag.get(t);
        if (!s) {
          s = { tag: t, solved: 0, unsolved: 0, subs: 0, ok: 0 };
          byTag.set(t, s);
        }
        if (p.solved) s.solved++;
        else s.unsolved++;
        s.subs += p.subs.length;
        s.ok += okSubs;
      }
    }
    const rows = [...byTag.values()].filter((s) => s.solved + s.unsolved >= MIN_TAG_PROBLEMS);
    rows.sort((a, b) => a.ok / a.subs - b.ok / b.subs || b.unsolved - a.unsolved);
    return { rows, weakCount: Math.min(3, Math.floor(rows.length / 2)) };
  }

  function renderStats() {
    statsBox.textContent = "";
    statsBtn.classList.toggle("active", statsVisible);
    statsBtn.setAttribute("aria-pressed", String(statsVisible));
    if (!statsVisible) {
      statsBox.style.display = "none";
      return;
    }
    statsBox.style.display = "";

    const lo = Number(minSel.value);
    const hi = Number(maxSel.value);
    const { rows, weakCount } = tagRows(lo, hi);

    statsBox.append(
      el("div", { class: "cfrf-panel-title", text: "Tag stats" }),
      el("div", {
        class: "cfrf-panel-sub",
        text: `Rating ${lo}–${hi} · tags with at least ${MIN_TAG_PROBLEMS} attempted problems · weakest first (lowest acceptance) · click a row to filter the list below`,
      })
    );

    if (rows.length === 0) {
      statsBox.appendChild(el("div", { text: "Not enough data for this rating range." }));
      return;
    }

    const table = el("table", { class: "cfrf-table" });
    table.appendChild(
      headRow([["Tag"], ["Solved", true], ["Unsolved", true], ["Tries per solve", true], ["Acceptance", true]])
    );
    const tbody = el("tbody");
    rows.forEach((s, i) => {
      const nameCell = el("td", {}, el("a", { href: "#", text: s.tag }));
      if (i < weakCount) nameCell.appendChild(el("span", { class: "tag-box cfrf-weak", text: "weak" }));

      const pct = Math.round((100 * s.ok) / s.subs);
      const level = pct < 50 ? "lo" : pct < 75 ? "mid" : "hi";

      const tr = el(
        "tr",
        { class: "cfrf-click" },
        nameCell,
        el("td", { class: "num", text: String(s.solved) }),
        el("td", { class: "num", text: String(s.unsolved) }),
        el("td", { class: "num", text: s.solved ? (s.subs / s.solved).toFixed(1) : "-" }),
        el(
          "td",
          { class: "num" },
          el("span", { class: `cfrf-bar ${level}` }, el("i", { style: `width:${pct}%` })),
          `${pct}%`
        )
      );
      tr.addEventListener("click", (e) => {
        e.preventDefault();
        tagSel.value = s.tag;
        render();
        if (listBox.scrollIntoView) listBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    statsBox.appendChild(el("div", { class: "cfrf-scroll" }, table));
  }

  async function loadRecData() {
    let list = cacheGet("problemset");
    if (!list) {
      const r = await api("https://codeforces.com/api/problemset.problems?lang=en");
      const solvedBy = new Map(r.problemStatistics.map((s) => [`${s.contestId}-${s.index}`, s.solvedCount]));
      // compact arrays keep the cached copy small
      list = r.problems
        .filter((p) => typeof p.rating === "number")
        .map((p) => [p.contestId, p.index, p.name, p.rating, p.tags || [], solvedBy.get(`${p.contestId}-${p.index}`) || 0]);
      cacheSet("problemset", list);
    }
    recData = list.map(([contestId, index, name, rating, tags, solvedCount]) => ({
      key: `${contestId}-${index}`,
      contestId,
      index,
      name,
      rating,
      tags,
      solvedCount,
    }));

    try {
      const info = await api(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`);
      recRating = info[0] && typeof info[0].rating === "number" ? info[0].rating : null;
    } catch (e) {
      recRating = null;
    }
  }

  function defaultRecRange() {
    let base = recRating;
    if (base === null) {
      const recent = [...problems.values()]
        .filter((p) => p.solved)
        .sort((a, b) => b.solvedAt - a.solvedAt)
        .slice(0, 20)
        .map((p) => p.rating)
        .sort((a, b) => a - b);
      base = recent.length ? recent[Math.floor(recent.length / 2)] : 800;
    }
    const clamp = (v) => Math.min(3500, Math.max(800, Math.round(v / 100) * 100));
    return [clamp(base + 100), clamp(base + 300)];
  }

  function pickSuggestions() {
    const lo = Number(recMin.value);
    const hi = Number(recMax.value);
    const sel = recTagSel.value;

    let weak = [];
    if (sel === "auto") {
      const { rows, weakCount } = tagRows(800, 3500);
      weak = rows.slice(0, weakCount).map((r) => r.tag);
    }

    const solvedNames = new Set();
    for (const p of problems.values()) if (p.solved) solvedNames.add(p.name);

    const matches = recData
      .filter((p) => {
        if (p.rating < lo || p.rating > hi) return false;
        if (sel !== "auto" && sel !== "any" && !p.tags.includes(sel)) return false;
        if (sel === "auto" && weak.length && !p.tags.some((t) => weak.includes(t))) return false;
        const mine = problems.get(p.key);
        if (mine && mine.solved) return false;
        return !solvedNames.has(p.name);
      })
      .sort((a, b) => b.solvedCount - a.solvedCount);

    const seen = new Set();
    const unique = matches.filter((p) => (seen.has(p.name) ? false : seen.add(p.name)));

    const pool = unique.slice(0, REC_POOL);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picks = pool
      .slice(0, REC_COUNT)
      .sort((a, b) => a.rating - b.rating || b.solvedCount - a.solvedCount);
    return { picks, weak, total: unique.length, lo, hi, sel };
  }

  function renderRec() {
    recOut.textContent = "";
    recBtn.classList.toggle("active", recVisible);
    recBtn.setAttribute("aria-pressed", String(recVisible));
    if (!recVisible) {
      recBox.style.display = "none";
      return;
    }
    recBox.style.display = "";
    if (recError) {
      recOut.textContent = `Could not load suggestions: ${recError}`;
      return;
    }
    if (!recData) {
      recOut.textContent = "Loading the problem list from Codeforces...";
      return;
    }

    const { picks, weak, total, lo, hi, sel } = pickSuggestions();
    let tagText = "any tag";
    if (sel === "auto") tagText = weak.length ? `weakest tags: ${weak.join(", ")}` : "any tag (no weak tags found yet)";
    else if (sel !== "any") tagText = `tag: ${sel}`;

    recOut.appendChild(
      el("div", {
        class: "cfrf-panel-sub",
        text: `For ${handle} · unsolved problems rated ${lo}–${hi} · ${tagText} · ${total} match, ${picks.length} picked at random from the most-solved · default range is current rating +100 to +300`,
      })
    );

    if (picks.length === 0) {
      recOut.appendChild(el("div", { text: "No unsolved problems match. Try a wider rating range or a different tag." }));
      return;
    }

    const table = el("table", { class: "cfrf-table" });
    table.appendChild(headRow([["Problem"], ["Rating"], ["Tags"], ["Solved by", true], ["Status"]]));
    const tbody = el("tbody");
    for (const p of picks) {
      const tried = problems.has(p.key);
      tbody.appendChild(
        el(
          "tr",
          { class: "cfrf-row" },
          problemCell(p),
          ratingCell(p.rating),
          tagsCell(p.tags),
          el("td", { class: "num", text: p.solvedCount.toLocaleString("en-GB") }),
          el("td", {}, el("span", { class: `cfrf-badge ${tried ? "tried" : "new"}`, text: tried ? "tried" : "new" }))
        )
      );
    }
    table.appendChild(tbody);
    recOut.appendChild(el("div", { class: "cfrf-scroll" }, table));
  }

  function render() {
    if (!problems) return;

    if (Number(minSel.value) > Number(maxSel.value)) maxSel.value = minSel.value;

    if (modeSel.value === "notme" && !mySolved) {
      dist.textContent = "";
      countSpan.textContent = "";
      currentItems = [];
      if (meError) {
        setListMessage(`Could not load your submissions: ${meError}`);
      } else {
        setListMessage(`Loading your submissions (${myHandle})...`);
        if (!loadingMe) {
          loadingMe = true;
          fetchUser(myHandle)
            .then((map) => {
              mySolved = new Set([...map.values()].filter((e) => e.solved).map((e) => e.key));
            })
            .catch((err) => {
              meError = err.message;
            })
            .finally(() => {
              loadingMe = false;
              render();
            });
        }
      }
      return;
    }

    const base = baseList();
    renderDistribution(base);
    renderStats();

    const lo = Number(minSel.value);
    const hi = Number(maxSel.value);
    const items = sortItems(base.filter((p) => p.rating >= lo && p.rating <= hi));
    currentItems = items;

    countSpan.textContent = `${items.length} problem${items.length === 1 ? "" : "s"}`;
    renderTable(items);
  }

  minSel.addEventListener("change", () => {
    if (Number(minSel.value) > Number(maxSel.value)) maxSel.value = minSel.value;
    render();
  });
  maxSel.addEventListener("change", () => {
    if (Number(maxSel.value) < Number(minSel.value)) minSel.value = maxSel.value;
    render();
  });
  modeSel.addEventListener("change", render);
  tagSel.addEventListener("change", render);
  sortSel.addEventListener("change", render);

  recBtn.addEventListener("click", () => {
    if (!problems) return flash("Still loading submissions, try again in a moment");
    recVisible = !recVisible;

    if (recVisible && !recData && !recLoading) {
      recLoading = true;
      recError = null;
      loadRecData()
        .then(() => {
          const [lo, hi] = defaultRecRange();
          recMin.value = String(lo);
          recMax.value = String(hi);
          const allTags = new Set();
          for (const p of recData) p.tags.forEach((t) => allTags.add(t));
          for (const t of [...allTags].sort()) recTagSel.appendChild(el("option", { value: t, text: t }));
        })
        .catch((err) => {
          recError = err.message;
          console.error("[CF Rating Filter] suggestions failed:", err);
        })
        .finally(() => {
          recLoading = false;
          renderRec();
        });
    }
    renderRec();
  });
  recMin.addEventListener("change", () => {
    if (Number(recMin.value) > Number(recMax.value)) recMax.value = recMin.value;
    renderRec();
  });
  recMax.addEventListener("change", () => {
    if (Number(recMax.value) < Number(recMin.value)) recMin.value = recMax.value;
    renderRec();
  });
  recTagSel.addEventListener("change", renderRec);
  recAgain.addEventListener("click", renderRec);

  statsBtn.addEventListener("click", () => {
    if (!problems) return flash("Still loading submissions, try again in a moment");
    statsVisible = !statsVisible;
    renderStats();
  });

  let msgTimer;
  function flash(text) {
    exportMsg.textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => (exportMsg.textContent = ""), 3000);
  }

  function exportTitle() {
    const modeText = modeSel.options[modeSel.selectedIndex].text;
    const tag = tagSel.value ? `, tag: ${tagSel.value}` : "";
    return `${handle}: ${modeText}, rating ${minSel.value}-${maxSel.value}${tag}`;
  }

  function toMarkdown(items) {
    const esc = (s) => String(s).replace(/[\\|[\]]/g, (c) => "\\" + c);
    const lines = [`### ${exportTitle()}`, "", "| # | Problem | Rating | Tags |", "|---|---|---|---|"];
    items.forEach((p, i) => {
      lines.push(
        `| ${i + 1} | [${p.contestId}${p.index} - ${esc(p.name)}](${problemUrl(p)}) | ${p.rating} | ${esc(p.tags.join(", "))} |`
      );
    });
    return lines.join("\n");
  }

  function toCsv(items) {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["contestId", "index", "name", "rating", "tags", "date", "url"].map(q).join(",")];
    for (const p of items) {
      rows.push(
        [
          p.contestId,
          p.index,
          p.name,
          p.rating,
          p.tags.join("; "),
          new Date(activityTime(p) * 1000).toISOString().slice(0, 10),
          problemUrl(p),
        ]
          .map(q)
          .join(",")
      );
    }
    return rows.join("\r\n");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = el("textarea", { style: "position:fixed;opacity:0;" });
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch (e2) {
        return false;
      }
    }
  }

  copyBtn.addEventListener("click", async () => {
    if (currentItems.length === 0) return flash("Nothing to export");
    const ok = await copyText(toMarkdown(currentItems));
    flash(ok ? `Copied ${currentItems.length} problems as Markdown` : "Copy failed");
  });

  csvBtn.addEventListener("click", () => {
    if (currentItems.length === 0) return flash("Nothing to export");
    const blob = new Blob(["﻿" + toCsv(currentItems)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = el("a", {
      href: url,
      download: `cf-${handle}-${modeSel.value}-${minSel.value}-${maxSel.value}.csv`,
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(`Downloaded ${currentItems.length} problems`);
  });

  randomBtn.addEventListener("click", () => {
    if (currentItems.length === 0) return flash("Nothing to pick from");
    const p = currentItems[Math.floor(Math.random() * currentItems.length)];
    window.open(problemUrl(p), "_blank", "noopener");
  });

  fetchUser(handle)
    .then((map) => {
      problems = map;

      const tagSet = new Set();
      for (const p of map.values()) p.tags.forEach((t) => tagSet.add(t));
      for (const t of [...tagSet].sort()) tagSel.appendChild(el("option", { value: t, text: t }));

      const solvedCount = [...map.values()].filter((p) => p.solved).length;
      summary.textContent = `${solvedCount} solved · ${map.size - solvedCount} attempted but not solved · rated problems only`;

      render();
    })
    .catch((err) => {
      setListMessage(`Could not load submissions: ${err.message}`);
    });
})();
