// Image Bench landing: the tour carousel, the action rims, the install tabs and the copy buttons.

// ---------------------------------------------------------------- links

// Embedded in an iframe, links open in a new tab; standalone, they navigate in the same tab.
// Anchors of this page stay in the frame and scroll it.
(function links() {
  let embedded;
  try { embedded = window.self !== window.top; } catch { embedded = true; }   // a cross-origin parent throws
  if (!embedded) return;
  for (const a of document.querySelectorAll("a[href]")) {
    if (a.getAttribute("href").startsWith("#")) continue;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
})();

// ---------------------------------------------------------------- tour

(function tour() {
  const root = document.getElementById("tour");
  const shots = [...root.querySelectorAll(".tour-shots img")];
  const part = (name) => root.querySelector(`[data-tour="${name}"]`);
  const pills = part("pills");
  const caption = root.querySelector(".tour-caption");
  const num = (i) => String(i + 1).padStart(2, "0");
  let current = 0;

  const buttons = shots.map((img, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pill";
    b.textContent = num(i);
    b.title = img.dataset.title;
    b.setAttribute("aria-label", img.dataset.title);
    b.addEventListener("click", () => show(i, true));
    pills.append(b);
    return b;
  });

  function show(i, user) {
    current = (i + shots.length) % shots.length;
    const img = shots[current];
    shots.forEach((s, k) => { s.hidden = k !== current; });
    buttons.forEach((b, k) => b.setAttribute("aria-current", String(k === current)));
    part("title").textContent = part("name").textContent = img.dataset.title;
    part("num").textContent = num(current);
    part("desc").textContent = img.dataset.desc;
    pointNotch();
    if (user) {
      caption.classList.remove("flash");
      void caption.offsetWidth;  // restarts the animation
      caption.classList.add("flash");
    }
    // the neighbours load ahead, so stepping through never waits
    for (const k of [current + 1, current - 1]) shots[(k + shots.length) % shots.length].loading = "eager";
    if (user) history.replaceState(null, "", `#tour-${num(current)}`);
  }

  // the caption's notch points at the selected pill
  function pointNotch() {
    const b = buttons[current].getBoundingClientRect();
    caption.style.setProperty("--notch-x", `${b.left + b.width / 2 - caption.getBoundingClientRect().left}px`);
  }
  addEventListener("resize", pointNotch);
  document.fonts.ready.then(pointNotch);  // the pills move once the mono font is in

  part("prev").addEventListener("click", () => show(current - 1, true));
  part("next").addEventListener("click", () => show(current + 1, true));

  // ←/→ while the tour is on screen
  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.4 }).observe(root);
  document.addEventListener("keydown", (e) => {
    if (!visible || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === "ArrowLeft") show(current - 1, true);
    else if (e.key === "ArrowRight") show(current + 1, true);
  });

  // swipe on touch screens
  let x0 = null;
  const frame = root.querySelector(".tour-shots");
  frame.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") x0 = e.clientX; });
  frame.addEventListener("pointerup", (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) show(current + (dx < 0 ? 1 : -1), true);
  });
  frame.addEventListener("pointercancel", () => { x0 = null; });

  // deep links: #tour-05
  const deep = /^#tour-(\d\d)$/.exec(location.hash);
  show(deep ? Math.min(Math.max(+deep[1] - 1, 0), shots.length - 1) : 0, false);
  if (deep) root.scrollIntoView();
})();

// ---------------------------------------------------------------- action rims

// The action rim of an Image tray card, as ActionRim.vue draws it: groups clockwise from the top (parameters,
// send, trays, Delete, generate), wider gaps between groups, Delete rotated to the bottom. Icons from icons.js.
const ICONS = {
  params: "M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7M3 15l4-4 4 4M13 8.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M14 17a4 4 0 1 0 8 0a4 4 0 1 0-8 0M18 18.5v-1.5M18 15.3h.01",
  comment: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  imageIn: "M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.8 0L6 21M14 19l3 3 3-3M17 22v-6M7 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  brush: "M11 10l3 3M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21zM9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031",
  controlnet: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 15l3-4 3 3 4-5",
  photoshop: "M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM7.5 16V8h2.5a2 2 0 0 1 0 4H7.5M16.8 11.3c-.4-.5-1-.8-1.8-.8-.9 0-1.5.5-1.5 1.1 0 1.5 3.5.9 3.5 2.6 0 .7-.7 1.3-1.8 1.3-.8 0-1.5-.3-1.9-.8",
  compare: "M8 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3M16 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3M12 3v18",
  concept: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  steps: "M6 20v-4M12 20v-9M18 20V4",
  upscale: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
  denoise: "M22 17l-8.5-8.5-5 5L2 7M16 17h6v-6",
};
const GROUP_COLORS = { params: "#7aa2ff", generate: "#ffb547", send: "#c084fc", trays: "#34d399", del: "#ef4444" };
const ACTIONS = [   // [group, label, key, icon]
  ["params", "Generation parameters", "I", "params"], ["params", "Comment", "C", "comment"],
  ["send", "Send to img2img", "M", "imageIn"], ["send", "Send to the inpaint upload image", "B", "brush"],
  ["send", "Send to ControlNet", "N", "controlnet"], ["send", "Send to Photoshop as a new document", "P", "photoshop"],
  ["trays", "Add to compare", "A", "compare"], ["trays", "Add to concept tray", "Y", "concept"],
  ["del", "Delete", "Del", "trash"],
  ["generate", "Generate with steps", "G", "steps"], ["generate", "Upscale with the current Forge Neo settings", "U", "upscale"],
  ["generate", "Upscale with denoising", "D", "denoise"],
];

const SVG_NS = "http://www.w3.org/2000/svg";
const svgEl = (parent, tag, attrs) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.append(el);
  return el;
};
const rgba = (hex, a) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16},${v >> 8 & 255},${v & 255},${a})`;
};

// sector angles in degrees clockwise from the top, Delete centered at the bottom
const SECTORS = (() => {
  const GROUP_GAP = 4, ITEM_GAP = 1.2, n = ACTIONS.length;
  const isEnd = (i) => ACTIONS[i][0] !== ACTIONS[(i + 1) % n][0];
  const gaps = ACTIONS.filter((a, i) => isEnd(i)).length;
  const span = (360 - gaps * GROUP_GAP) / n;
  let angle = 0;
  const s = ACTIONS.map((a, i) => {
    const sector = [angle + ITEM_GAP / 2, angle + span - ITEM_GAP / 2];
    angle += span + (isEnd(i) ? GROUP_GAP : 0);
    return sector;
  });
  const del = s[ACTIONS.findIndex((a) => a[0] === "del")];
  const shift = 180 - (del[0] + del[1]) / 2;
  return s.map(([a, b]) => [a + shift, b + shift]);
})();

// Draws a rim into svg: center c, outer radius R, inner radius r, icon size, the growth and the edge width.
// Returns setHighlight(index | -1).
function drawRim(svg, { c, R, r, icon, grow, edge, iconStroke }) {
  const xy = (rad, deg) => {
    const t = deg * Math.PI / 180;
    return [c + rad * Math.sin(t), c - rad * Math.cos(t)];
  };
  const pt = (rad, deg) => xy(rad, deg).map((v) => v.toFixed(1)).join(" ");
  const ring = (rad) => `M${c - rad} ${c}a${rad} ${rad} 0 1 0 ${2 * rad} 0a${rad} ${rad} 0 1 0 ${-2 * rad} 0`;
  svgEl(svg, "path", { d: ring(R) + ring(r), fill: "rgba(10,12,18,0.72)", "fill-rule": "evenodd" });

  const sectors = ACTIONS.map(([group, , , iconName], i) => {
    const color = GROUP_COLORS[group];
    const g = svgEl(svg, "g", {});
    const fill = svgEl(g, "path", {});
    const rimEdge = svgEl(g, "path", { fill: "none", stroke: color, "stroke-width": edge });
    const glyph = svgEl(g, "path", {
      d: ICONS[iconName], fill: "none", stroke: "#ffffff", "stroke-width": iconStroke,
      "stroke-linecap": "round", "stroke-linejoin": "round",
    });
    const draw = (on) => {
      const [s0, s1] = SECTORS[i];
      const Ro = R + (on ? grow : 0), e = Ro - edge / 2;
      fill.setAttribute("d", `M${pt(Ro, s0)} A${Ro} ${Ro} 0 0 1 ${pt(Ro, s1)} L${pt(r, s1)} A${r} ${r} 0 0 0 ${pt(r, s0)} Z`);
      fill.setAttribute("fill", rgba(color, on ? 0.75 : group === "del" ? 0.45 : 0.3));
      rimEdge.setAttribute("d", `M${pt(e, s0)} A${e} ${e} 0 0 1 ${pt(e, s1)}`);
      const [ix, iy] = xy((R + r) / 2 + (on ? grow / 2 : 0), (s0 + s1) / 2);
      glyph.setAttribute("transform", `translate(${(ix - icon / 2).toFixed(1)} ${(iy - icon / 2).toFixed(1)}) scale(${(icon / 24).toFixed(3)})`);
    };
    draw(false);
    return { g, fill, draw };
  });

  let lit = -1;
  return (i) => {
    if (i === lit) return;
    if (lit >= 0) sectors[lit].draw(false);
    if (i >= 0) sectors[i].draw(true);
    lit = i;
  };
}

(function rims() {
  const big = document.querySelector('[data-rim="big"]');
  const highlight = drawRim(big, { c: 170, R: 106, r: 70, icon: 19, grow: 4, edge: 4, iconStroke: 2.3 });
  const box = big.parentElement;
  const label = box.querySelector(".rim-label");
  const hover = (i) => {
    highlight(i);
    label.hidden = i < 0;
    if (i >= 0) {
      label.querySelector("[data-rim-label]").textContent = ACTIONS[i][1];
      label.querySelector("[data-rim-key]").textContent = ACTIONS[i][2];
    }
  };
  // a transparent hit area per sector, on top, so hovering the icon or the edge counts too
  const hits = big.querySelectorAll("g > path:first-child");
  hits.forEach((path, i) => {
    const hit = svgEl(big, "path", { d: path.getAttribute("d"), fill: "transparent", class: "rim-sector" });
    hit.addEventListener("pointerenter", () => hover(i));
    hit.addEventListener("click", () => hover(i));   // touch: a tap shows the label
  });
  big.addEventListener("pointerleave", () => hover(-1));

  // the small rim of the before/after card, Upscale highlighted
  const mini = document.querySelector('[data-rim="mini"]');
  drawRim(mini, { c: 75, R: 66, r: 42, icon: 12, grow: 4, edge: 3, iconStroke: 2.4 })(ACTIONS.findIndex((a) => a[3] === "upscale"));
})();

// ---------------------------------------------------------------- comfyui mapping

// Lines from the nodes of the workflow drawing (data-map) to the controls of the Generate tab (data-spot).
// Both sit on transformed planes, so the ends are taken from the projected boxes and redrawn on resize.
(function comfyMap() {
  const fig = document.querySelector("[data-cm]");
  if (!fig) return;
  const svg = fig.querySelector("[data-cm-lines]");
  const NS = "http://www.w3.org/2000/svg";
  const center = (el, box) => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];
  };

  function draw() {
    svg.replaceChildren();
    if (getComputedStyle(svg).display === "none") return;
    const box = fig.getBoundingClientRect();
    for (const spot of fig.querySelectorAll("[data-spot]")) {
      const from = fig.querySelector(`[data-map="${spot.dataset.spot}"]`);
      if (!from) continue;
      // marked nodes: from under the marker; traced ones: from the title
      const mk = from.querySelector(".mk");
      let [x1, y1] = center(mk ?? from, box);
      if (mk) y1 = mk.getBoundingClientRect().bottom - box.top + 2;
      const [x2, y2] = center(spot, box);
      const color = spot.style.getPropertyValue("--mk").trim();
      const path = document.createElementNS(NS, "path");
      const bend = (y2 - y1) * 0.45;
      path.setAttribute("d", `M${x1} ${y1}C${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`);
      if (color) path.setAttribute("stroke", color);
      else path.classList.add("traced");
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", x1); dot.setAttribute("cy", y1); dot.setAttribute("r", color ? 3 : 2.5);
      dot.setAttribute("fill", color || "#71717a");
      svg.append(path, dot);
    }
  }

  new ResizeObserver(draw).observe(fig);
  window.addEventListener("load", draw);
})();

// ---------------------------------------------------------------- install tabs, copy buttons

(function install() {
  const tabs = [...document.querySelectorAll('#install [role="tab"]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    }
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });

  // the text of the code block next to the button, without the "$ " prompts
  for (const button of document.querySelectorAll(".copy")) {
    button.addEventListener("click", async () => {
      const block = button.previousElementSibling.cloneNode(true);
      block.querySelectorAll(".prompt").forEach((p) => p.remove());
      try {
        await navigator.clipboard.writeText(block.textContent.trim());
        button.textContent = "Copied";
      } catch {
        button.textContent = "Select and copy";
      }
      clearTimeout(button.timer);
      button.timer = setTimeout(() => { button.textContent = "Copy"; }, 1600);
    });
  }
})();
