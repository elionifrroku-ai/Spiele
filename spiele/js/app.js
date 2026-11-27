import { deleteCutout, listCutouts, newId, saveCutout } from "./db.js";
import {
  canvasToBlob,
  loadImageFile,
  loadImageUrl,
  tapCutout,
  traceCutout,
  warmupTapMagic,
} from "./extract.js";
import { registerOffline } from "./offline.js";

const stage = document.getElementById("stage");
const tray = document.getElementById("tray");
const overlay = document.getElementById("overlay");
const fileInput = document.getElementById("file-input");
const photoCanvas = document.getElementById("photo-canvas");
const photoWrap = document.getElementById("photo-wrap");
const traceCanvas = document.getElementById("trace-canvas");
const busy = document.getElementById("busy");
const emptyHint = document.getElementById("empty-hint");
const playHint = document.getElementById("play-hint");
const installHint = document.getElementById("install-hint");
const offlinePill = document.getElementById("offline-pill");
const sheetTitle = document.getElementById("sheet-title");
const sheetCopy = document.getElementById("sheet-copy");
const sampleRow = document.getElementById("sample-row");
const pickDevice = document.getElementById("pick-device");
const tapActions = document.getElementById("tap-actions");
const previewActions = document.getElementById("preview-actions");
const traceActions = document.getElementById("trace-actions");
const kindActions = document.getElementById("kind-actions");

const POINT_HAND_SVG = `
  <svg class="point-hand" viewBox="0 0 64 64" aria-hidden="true">
    <path fill="#f0c7a0" stroke="#c48b6a" stroke-width="2"
      d="M10 38c0-6 5-10 12-10h8c2-8 6-16 12-18 4-1 8 2 8 6 0 3-2 6-4 10 6-1 12 3 12 9 0 3-2 6-5 8 5 1 8 5 8 9 0 6-6 10-14 10H24c-8 0-14-6-14-14z"/>
    <path fill="#f0c7a0" stroke="#c48b6a" stroke-width="2"
      d="M42 12c2-6 8-10 16-8 3 1 4 5 2 8-3 6-10 10-16 12z"/>
  </svg>
`;

const state = {
  cutouts: [],
  objectUrls: new Map(),
  source: null,
  preview: null,
  pendingKind: null,
  mode: "closed",
  pointerId: null,
  tracePoints: [],
  dragging: null,
  selectedId: null,
  targetId: null,
};

registerOffline((status) => {
  offlinePill.textContent = status.text;
  offlinePill.className = `offline-pill ${status.level}`;
});

if (!window.matchMedia("(display-mode: standalone)").matches && !navigator.standalone) {
  installHint.hidden = false;
}

warmupTapMagic();
refreshFromDb();

document.getElementById("add-photo").addEventListener("click", () => {
  openChooser();
});
document.getElementById("pick-device").addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const source = await loadImageFile(file);
  beginTap(source);
});

sampleRow.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-sample]");
  if (!btn) return;
  const source = await loadImageUrl(btn.dataset.sample);
  beginTap(source);
});

document.getElementById("cancel-sheet").addEventListener("click", closeSheet);
document.getElementById("start-trace").addEventListener("click", () => beginTrace());
document.getElementById("try-again").addEventListener("click", () => {
  if (!state.source) return;
  beginTap(state.source);
});
document.getElementById("use-cutout").addEventListener("click", () => askKind());
document.getElementById("finish-trace").addEventListener("click", finishTrace);
document.getElementById("clear-trace").addEventListener("click", () => {
  state.tracePoints = [];
  drawTrace();
});
document.getElementById("kind-child").addEventListener("click", () => commitCutout("child"));
document.getElementById("kind-friend").addEventListener("click", () => commitCutout("friend"));

photoCanvas.addEventListener("pointerdown", onPhotoTap, { passive: false });
traceCanvas.addEventListener("pointerdown", onTracePointer, { passive: false });
traceCanvas.addEventListener("pointermove", onTracePointer, { passive: false });
traceCanvas.addEventListener("pointerup", onTracePointer, { passive: false });
traceCanvas.addEventListener("pointercancel", onTracePointer, { passive: false });

stage.addEventListener("pointermove", onStageMove);
stage.addEventListener("pointerup", onStageUp);
stage.addEventListener("pointercancel", onStageUp);

async function refreshFromDb() {
  state.cutouts = await listCutouts();
  renderClassroom();
  renderTray();
}

function openChooser() {
  state.mode = "choose";
  state.source = null;
  state.preview = null;
  overlay.hidden = false;
  sampleRow.hidden = false;
  pickDevice.hidden = false;
  tapActions.hidden = false;
  document.getElementById("start-trace").hidden = true;
  previewActions.hidden = true;
  traceActions.hidden = true;
  kindActions.hidden = true;
  traceCanvas.hidden = true;
  busy.hidden = true;
  photoWrap.hidden = true;
  sheetTitle.textContent = "Add from a photo";
  sheetCopy.textContent =
    "Choose a photo from this iPhone, or try a sample. Then tap who to lift.";
  clearCanvas(photoCanvas);
}

function beginTap(source) {
  state.mode = "tap";
  state.source = source;
  state.preview = null;
  overlay.hidden = false;
  sampleRow.hidden = true;
  pickDevice.hidden = true;
  tapActions.hidden = false;
  document.getElementById("start-trace").hidden = false;
  previewActions.hidden = true;
  traceActions.hidden = true;
  kindActions.hidden = true;
  traceCanvas.hidden = true;
  busy.hidden = true;
  photoWrap.hidden = false;
  sheetTitle.textContent = "Tap who to lift";
  sheetCopy.textContent =
    "If two children are in the photo, tap just one. Tracing is there if tap misses.";
  drawSource(source);
}

function beginTrace() {
  if (!state.source) return;
  state.mode = "trace";
  state.tracePoints = [];
  sampleRow.hidden = true;
  pickDevice.hidden = true;
  tapActions.hidden = true;
  previewActions.hidden = true;
  traceActions.hidden = false;
  kindActions.hidden = true;
  traceCanvas.hidden = false;
  sheetTitle.textContent = "Trace with your finger";
  sheetCopy.textContent =
    "Draw all the way around the person or toy, then lift your finger.";
  drawSource(state.source);
  sizeTraceCanvas();
  drawTrace();
}

async function onPhotoTap(event) {
  if (state.mode !== "tap" || !state.source) return;
  event.preventDefault();
  const { nx, ny } = canvasPoint(photoCanvas, event);
  busy.hidden = false;
  busy.textContent = "Lifting…";
  await new Promise((r) => requestAnimationFrame(r));
  const cut = await tapCutout(state.source, nx, ny);
  busy.hidden = true;
  if (!cut) {
    sheetCopy.textContent =
      "Could not lift that spot. Try tapping the middle, or trace with your finger.";
    return;
  }
  showPreview(cut);
}

function showPreview(cut) {
  state.mode = "preview";
  state.preview = cut;
  sampleRow.hidden = true;
  pickDevice.hidden = true;
  tapActions.hidden = true;
  previewActions.hidden = false;
  traceActions.hidden = true;
  kindActions.hidden = true;
  traceCanvas.hidden = true;
  sheetTitle.textContent = "Is this the one?";
  sheetCopy.textContent = "Use cutout if it looks right. Try again or trace if two subjects merged.";
  const ctx = photoCanvas.getContext("2d");
  photoCanvas.width = cut.canvas.width;
  photoCanvas.height = cut.canvas.height;
  drawChecker(ctx, cut.canvas.width, cut.canvas.height);
  ctx.drawImage(cut.canvas, 0, 0);
}

function askKind() {
  if (!state.preview) return;
  state.mode = "kind";
  previewActions.hidden = true;
  kindActions.hidden = false;
  sheetTitle.textContent = "Who did you lift?";
  sheetCopy.textContent = "Only a child can point. A puppy, animal, or toy can be pointed at.";
}

async function commitCutout(kind) {
  if (!state.preview) return;
  const blob = await canvasToBlob(state.preview.canvas);
  const count = state.cutouts.length;
  const cutout = {
    id: newId(),
    kind,
    blob,
    width: state.preview.width,
    height: state.preview.height,
    x: [50, 18, 82][count % 3],
    y: 82,
    createdAt: Date.now(),
  };
  await saveCutout(cutout);
  closeSheet();
  await refreshFromDb();
}

function closeSheet() {
  overlay.hidden = true;
  state.mode = "closed";
  state.source = null;
  state.preview = null;
  state.tracePoints = [];
}

function finishTrace() {
  if (!state.source) return;
  const cut = traceCutout(state.source, state.tracePoints);
  if (!cut) {
    sheetCopy.textContent = "Draw a bigger loop around the subject, then try again.";
    return;
  }
  showPreview(cut);
}

function onTracePointer(event) {
  if (state.mode !== "trace") return;
  event.preventDefault();
  const { nx, ny } = canvasPoint(traceCanvas, event);
  if (event.type === "pointerdown") {
    traceCanvas.setPointerCapture(event.pointerId);
    state.tracePoints = [{ x: nx, y: ny }];
    drawTrace();
    return;
  }
  if (event.type === "pointermove" && event.buttons) {
    const last = state.tracePoints[state.tracePoints.length - 1];
    if (!last || Math.hypot(last.x - nx, last.y - ny) > 0.004) {
      state.tracePoints.push({ x: nx, y: ny });
      drawTrace();
    }
  }
}

function drawSource(source) {
  photoCanvas.width = source.width;
  photoCanvas.height = source.height;
  photoCanvas.getContext("2d").drawImage(source.canvas, 0, 0);
}

function sizeTraceCanvas() {
  const rect = photoCanvas.getBoundingClientRect();
  traceCanvas.width = Math.max(1, Math.round(rect.width * devicePixelRatio));
  traceCanvas.height = Math.max(1, Math.round(rect.height * devicePixelRatio));
}

function drawTrace() {
  const ctx = traceCanvas.getContext("2d");
  ctx.clearRect(0, 0, traceCanvas.width, traceCanvas.height);
  if (state.tracePoints.length < 2) return;
  ctx.strokeStyle = "#e07a5f";
  ctx.fillStyle = "rgba(224, 122, 95, 0.18)";
  ctx.lineWidth = 6 * devicePixelRatio;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  state.tracePoints.forEach((p, i) => {
    const x = p.x * traceCanvas.width;
    const y = p.y * traceCanvas.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawChecker(ctx, w, h) {
  const s = 16;
  for (let y = 0; y < h; y += s) {
    for (let x = 0; x < w; x += s) {
      ctx.fillStyle = ((x / s + y / s) | 0) % 2 ? "#eee" : "#fff";
      ctx.fillRect(x, y, s, s);
    }
  }
}

function clearCanvas(canvas) {
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f6e2c4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    nx: (event.clientX - rect.left) / rect.width,
    ny: (event.clientY - rect.top) / rect.height,
  };
}

function renderClassroom() {
  for (const url of state.objectUrls.values()) URL.revokeObjectURL(url);
  state.objectUrls.clear();
  stage.replaceChildren();
  emptyHint.hidden = state.cutouts.length > 0;
  playHint.hidden = state.cutouts.length < 2;
  for (const cutout of state.cutouts) {
    const url = URL.createObjectURL(cutout.blob);
    state.objectUrls.set(cutout.id, url);
    const el = document.createElement("div");
    el.className = "cutout";
    el.dataset.id = cutout.id;
    el.style.left = `${cutout.x}%`;
    el.style.top = `${cutout.y}%`;
    el.style.zIndex = String(
      Math.round(cutout.y) + (state.selectedId === cutout.id ? 200 : 0)
    );
    if (state.selectedId === cutout.id) el.classList.add("selected");
    const img = document.createElement("img");
    img.className = "sprite";
    img.alt = cutout.kind === "child" ? "Child" : "Friend";
    img.draggable = false;
    img.src = url;
    el.appendChild(img);
    el.addEventListener("pointerdown", (event) => onCutoutDown(event, cutout, el));
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.skipClick) return;
      handlePointTap(cutout);
    });
    stage.appendChild(el);
  }
  const pointer = state.cutouts.find((c) => c.id === state.selectedId);
  const target = state.cutouts.find((c) => c.id === state.targetId);
  if (pointer && target) {
    const wrap = document.createElement("div");
    wrap.className = "point-hand-wrap";
    const angle = pointingAngle(pointer, target);
    const towardRight = Math.cos(angle) >= 0;
    const rest = -Math.PI / 4;
    wrap.style.left = `${pointer.x}%`;
    wrap.style.top = `${pointer.y}%`;
    wrap.style.zIndex = "400";
    wrap.dataset.side = towardRight ? "right" : "left";
    wrap.insertAdjacentHTML("beforeend", POINT_HAND_SVG);
    const hand = wrap.querySelector(".point-hand");
    hand.style.transform = `rotate(${angle - rest}rad)`;
    hand.dataset.angle = String(angle);
    stage.appendChild(wrap);
  }
}

function pointingAngle(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.atan2(dy, dx);
}

function renderTray() {
  tray.replaceChildren();
  for (const cutout of state.cutouts) {
    const url = state.objectUrls.get(cutout.id);
    const btn = document.createElement("button");
    btn.className = "tray-item";
    btn.type = "button";
    btn.title = "Remove from classroom";
    btn.style.backgroundImage = `url("${url}")`;
    btn.addEventListener("click", async () => {
      await deleteCutout(cutout.id);
      if (state.selectedId === cutout.id) state.selectedId = null;
      if (state.targetId === cutout.id) state.targetId = null;
      await refreshFromDb();
    });
    tray.appendChild(btn);
  }
}

function onCutoutDown(event, cutout, el) {
  event.stopPropagation();
  el.setPointerCapture(event.pointerId);
  state.skipClick = false;
  state.dragging = {
    id: cutout.id,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    origX: cutout.x,
    origY: cutout.y,
    moved: false,
  };
}

function onStageMove(event) {
  if (!state.dragging || event.pointerId !== state.dragging.pointerId) return;
  const dx = event.clientX - state.dragging.startX;
  const dy = event.clientY - state.dragging.startY;
  if (Math.hypot(dx, dy) > 8) state.dragging.moved = true;
  if (!state.dragging.moved) return;
  const rect = stage.getBoundingClientRect();
  const cutout = state.cutouts.find((c) => c.id === state.dragging.id);
  cutout.x = clamp(state.dragging.origX + (dx / rect.width) * 100, 8, 92);
  cutout.y = clamp(state.dragging.origY + (dy / rect.height) * 100, 40, 92);
  const el = stage.querySelector(`[data-id="${cutout.id}"]`);
  if (el) {
    el.style.left = `${cutout.x}%`;
    el.style.top = `${cutout.y}%`;
    el.style.zIndex = String(Math.round(cutout.y));
  }
}

async function onStageUp(event) {
  if (!state.dragging || event.pointerId !== state.dragging.pointerId) return;
  const drag = state.dragging;
  state.dragging = null;
  const cutout = state.cutouts.find((c) => c.id === drag.id);
  if (!cutout) return;
  if (drag.moved) {
    state.skipClick = true;
    await saveCutout(cutout);
    return;
  }
  handlePointTap(cutout);
  state.skipClick = true;
}

function handlePointTap(cutout) {
  if (state.selectedId && state.selectedId !== cutout.id) {
    const pointer = state.cutouts.find((c) => c.id === state.selectedId);
    if (pointer && pointer.kind === "child") {
      state.targetId = cutout.id;
      playHint.hidden = false;
      playHint.textContent = "They're pointing! Tap someone else to turn the hand.";
      renderClassroom();
      wiggle(cutout.id);
      return;
    }
  }
  if (cutout.kind !== "child") {
    playHint.hidden = false;
    playHint.textContent = "Tap a child first, then tap who they point to.";
    return;
  }
  state.selectedId = cutout.id;
  state.targetId = null;
  playHint.hidden = false;
  playHint.textContent = "Now tap who they point to.";
  renderClassroom();
}

function wiggle(id) {
  const el = stage.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  el.classList.remove("wiggle");
  void el.offsetWidth;
  el.classList.add("wiggle");
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
