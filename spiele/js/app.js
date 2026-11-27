import {
  aimPointingArm,
  clearPointing,
  createKidElement,
  fillKidPreview,
  MOVE_MS,
} from "./character.js";
import { deleteCutout, listCutouts, newId, saveCutout } from "./db.js";
import {
  canvasToBlob,
  cropFace,
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
const cropLayer = document.getElementById("crop-layer");
const cropRing = document.getElementById("crop-ring");
const cropTools = document.getElementById("crop-tools");
const cropSize = document.getElementById("crop-size");
const cropActions = document.getElementById("crop-actions");
const kidPreview = document.getElementById("kid-preview");
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
const sequenceList = document.getElementById("sequence-list");

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
  crop: { nx: 0.5, ny: 0.38, radius: 0.13 },
  cropDrag: null,
  sequence: [],
  playing: false,
  previewFaceUrl: null,
  waitForPointTarget: false,
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
renderSequence();

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
document.getElementById("use-face").addEventListener("click", () => commitChildFromCrop());
document.getElementById("lift-friend").addEventListener("click", liftFriendFromTap);
document.getElementById("finish-trace").addEventListener("click", finishTrace);
document.getElementById("clear-trace").addEventListener("click", () => {
  state.tracePoints = [];
  drawTrace();
});
document.getElementById("kind-child").addEventListener("click", () => commitCutout("child"));
document.getElementById("kind-friend").addEventListener("click", () => commitCutout("friend"));
document.getElementById("play-moves").addEventListener("click", () => playSequence());
document.getElementById("clear-moves").addEventListener("click", () => {
  state.sequence = [];
  renderSequence();
});
document.querySelector(".moves").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-move]");
  if (!btn) return;
  addMove(btn.dataset.move);
});
sequenceList.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-index]");
  if (!chip) return;
  state.sequence.splice(Number(chip.dataset.index), 1);
  renderSequence();
});

cropSize.addEventListener("input", () => {
  state.crop.radius = Number(cropSize.value) / 100;
  scheduleCropPreview();
});
cropLayer.addEventListener("pointerdown", onCropPointer, { passive: false });
cropLayer.addEventListener("pointermove", onCropPointer, { passive: false });
cropLayer.addEventListener("pointerup", onCropPointer, { passive: false });
cropLayer.addEventListener("pointercancel", onCropPointer, { passive: false });

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
  cropActions.hidden = true;
  cropTools.hidden = true;
  cropLayer.hidden = true;
  kidPreview.hidden = true;
  traceActions.hidden = true;
  kindActions.hidden = true;
  traceCanvas.hidden = true;
  busy.hidden = true;
  photoWrap.hidden = true;
  photoWrap.classList.remove("cropping");
  sheetTitle.textContent = "Add from a photo";
  sheetCopy.textContent =
    "Choose a photo from this iPhone, or try a sample. Tap a face to make a child, or lift a puppy or toy.";
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
  cropActions.hidden = true;
  cropTools.hidden = true;
  cropLayer.hidden = true;
  kidPreview.hidden = true;
  traceActions.hidden = true;
  kindActions.hidden = true;
  traceCanvas.hidden = true;
  busy.hidden = true;
  photoWrap.hidden = false;
  photoWrap.classList.remove("cropping");
  sheetTitle.textContent = "Tap a face or a toy";
  sheetCopy.textContent =
    "Tap one face, then drag the circle to fit. Pets and toys stay as scene partners.";
  drawSource(source);
}

function beginCrop(nx, ny) {
  state.mode = "crop";
  state.crop.nx = nx;
  state.crop.ny = ny;
  state.crop.radius = Number(cropSize.value) / 100;
  sampleRow.hidden = true;
  pickDevice.hidden = true;
  tapActions.hidden = false;
  document.getElementById("start-trace").hidden = false;
  previewActions.hidden = true;
  cropActions.hidden = false;
  cropTools.hidden = false;
  cropLayer.hidden = false;
  kidPreview.hidden = false;
  traceActions.hidden = true;
  kindActions.hidden = true;
  traceCanvas.hidden = true;
  photoWrap.classList.add("cropping");
  sheetTitle.textContent = "Adjust the face";
  sheetCopy.textContent =
    "Drag the circle and use Face size until it sits on the head. Then make a child, or lift a puppy or toy.";
  updateCropRing();
  updateCropPreview();
}

function beginTrace() {
  if (!state.source) return;
  state.mode = "trace";
  state.tracePoints = [];
  sampleRow.hidden = true;
  pickDevice.hidden = true;
  tapActions.hidden = true;
  previewActions.hidden = true;
  cropActions.hidden = true;
  cropTools.hidden = true;
  cropLayer.hidden = true;
  kidPreview.hidden = true;
  traceActions.hidden = false;
  kindActions.hidden = true;
  traceCanvas.hidden = false;
  photoWrap.classList.remove("cropping");
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
  beginCrop(nx, ny);
}

function onCropPointer(event) {
  if (state.mode !== "crop") return;
  event.preventDefault();
  const { nx, ny } = canvasPoint(photoCanvas, event);
  if (event.type === "pointerdown") {
    cropLayer.setPointerCapture(event.pointerId);
    state.cropDrag = { pointerId: event.pointerId };
    state.crop.nx = nx;
    state.crop.ny = ny;
    scheduleCropPreview();
    return;
  }
  if (event.type === "pointermove" && state.cropDrag && event.pointerId === state.cropDrag.pointerId) {
    state.crop.nx = nx;
    state.crop.ny = ny;
    scheduleCropPreview();
    return;
  }
  if (event.type === "pointerup" || event.type === "pointercancel") {
    state.cropDrag = null;
  }
}

let cropRaf = 0;
function scheduleCropPreview() {
  updateCropRing();
  if (cropRaf) return;
  cropRaf = requestAnimationFrame(() => {
    cropRaf = 0;
    updateCropPreview();
  });
}

function updateCropRing() {
  const rect = photoCanvas.getBoundingClientRect();
  const radiusPx = state.crop.radius * Math.min(rect.width, rect.height);
  cropRing.style.width = `${Math.max(36, radiusPx * 2)}px`;
  cropRing.style.height = `${Math.max(36, radiusPx * 2)}px`;
  cropRing.style.left = `${state.crop.nx * 100}%`;
  cropRing.style.top = `${state.crop.ny * 100}%`;
}

function updateCropPreview() {
  if (!state.source || state.mode !== "crop") return;
  const face = cropFace(state.source, state.crop.nx, state.crop.ny, state.crop.radius);
  if (state.previewFaceUrl) URL.revokeObjectURL(state.previewFaceUrl);
  state.previewFaceUrl = URL.createObjectURL(
    dataUrlToBlob(face.canvas.toDataURL("image/png"))
  );
  fillKidPreview(kidPreview, state.previewFaceUrl);
}

function showPreview(cut) {
  state.mode = "preview";
  state.preview = cut;
  sampleRow.hidden = true;
  pickDevice.hidden = true;
  tapActions.hidden = true;
  previewActions.hidden = false;
  cropActions.hidden = true;
  cropTools.hidden = true;
  cropLayer.hidden = true;
  kidPreview.hidden = true;
  traceActions.hidden = true;
  kindActions.hidden = true;
  traceCanvas.hidden = true;
  photoWrap.classList.remove("cropping");
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
  sheetCopy.textContent = "A child gets a cartoon body. A puppy, animal, or toy can be a partner.";
}

async function liftFriendFromTap() {
  if (!state.source) return;
  busy.hidden = false;
  busy.textContent = "Lifting…";
  await new Promise((r) => requestAnimationFrame(r));
  const cut = await tapCutout(state.source, state.crop.nx, state.crop.ny);
  busy.hidden = true;
  if (!cut) {
    sheetCopy.textContent =
      "Could not lift that spot. Try tapping the middle, or trace with your finger.";
    return;
  }
  showPreview(cut);
}

async function commitChildFromCrop() {
  if (!state.source) return;
  const face = cropFace(state.source, state.crop.nx, state.crop.ny, state.crop.radius);
  state.preview = face;
  await commitCutout("child");
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
  if (kind === "child") {
    cutout.body = "cartoon";
    cutout.crop = { ...state.crop };
  }
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
  photoWrap.classList.remove("cropping");
  if (state.previewFaceUrl) {
    URL.revokeObjectURL(state.previewFaceUrl);
    state.previewFaceUrl = null;
  }
  kidPreview.replaceChildren();
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
    nx: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    ny: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

function renderClassroom() {
  for (const url of state.objectUrls.values()) URL.revokeObjectURL(url);
  state.objectUrls.clear();
  stage.replaceChildren();
  emptyHint.hidden = state.cutouts.length > 0;
  playHint.hidden = state.cutouts.length < 1;
  for (const cutout of state.cutouts) {
    const url = URL.createObjectURL(cutout.blob);
    state.objectUrls.set(cutout.id, url);
    const el =
      cutout.kind === "child"
        ? createKidElement(cutout, url, { selected: state.selectedId === cutout.id })
        : createFriendElement(cutout, url);
    el.style.left = `${cutout.x}%`;
    el.style.top = `${cutout.y}%`;
    el.style.zIndex = String(
      Math.round(cutout.y) + (state.selectedId === cutout.id ? 200 : 0)
    );
    if (state.selectedId === cutout.id) el.classList.add("selected");
    el.addEventListener("pointerdown", (event) => onCutoutDown(event, cutout, el));
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.skipClick) return;
      handlePointTap(cutout);
    });
    stage.appendChild(el);
  }
  updatePointingLive();
}

function createFriendElement(cutout, url) {
  const el = document.createElement("div");
  el.className = "cutout";
  el.dataset.id = cutout.id;
  el.dataset.kind = "friend";
  const img = document.createElement("img");
  img.className = "sprite";
  img.alt = "Friend";
  img.draggable = false;
  img.src = url;
  el.appendChild(img);
  return el;
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
      state.sequence = state.sequence.filter((move) => move.targetId !== cutout.id);
      await refreshFromDb();
      renderSequence();
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
    el.classList.add("dragging");
  }
  updatePointingLive();
}

async function onStageUp(event) {
  if (!state.dragging || event.pointerId !== state.dragging.pointerId) return;
  const drag = state.dragging;
  state.dragging = null;
  const cutout = state.cutouts.find((c) => c.id === drag.id);
  const el = cutout && stage.querySelector(`[data-id="${cutout.id}"]`);
  if (el) el.classList.remove("dragging");
  if (!cutout) return;
  if (drag.moved) {
    state.skipClick = true;
    await saveCutout(cutout);
    updatePointingLive();
    return;
  }
  handlePointTap(cutout);
  state.skipClick = true;
}

function handlePointTap(cutout) {
  if (state.waitForPointTarget && state.selectedId && state.selectedId !== cutout.id) {
    state.targetId = cutout.id;
    state.waitForPointTarget = false;
    const last = state.sequence[state.sequence.length - 1];
    if (last && last.type === "point") last.targetId = cutout.id;
    playHint.hidden = false;
    playHint.textContent = "They're pointing! Drag anyone — the hand stays on the arm.";
    renderClassroom();
    wiggle(cutout.id);
    return;
  }
  if (state.selectedId && state.selectedId !== cutout.id) {
    const pointer = state.cutouts.find((c) => c.id === state.selectedId);
    if (pointer && pointer.kind === "child") {
      state.targetId = cutout.id;
      playHint.hidden = false;
      playHint.textContent = "They're pointing! Drag anyone — the hand stays on the arm.";
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
  playHint.textContent = "Now tap who they point to, or add Wave, Jump, Dance, Point.";
  renderClassroom();
}

function selectedChild() {
  return (
    state.cutouts.find((c) => c.id === state.selectedId && c.kind === "child") ||
    state.cutouts.find((c) => c.kind === "child")
  );
}

function addMove(type) {
  const kid = selectedChild();
  if (!kid) {
    playHint.hidden = false;
    playHint.textContent = "Add a child from a photo first, then add moves.";
    return;
  }
  state.selectedId = kid.id;
  const move = { type };
  if (type === "point") {
    if (!state.targetId) {
      state.waitForPointTarget = true;
      playHint.hidden = false;
      playHint.textContent = "Tap a puppy, toy, or friend. The arm will point at them.";
    } else {
      move.targetId = state.targetId;
    }
  }
  state.sequence.push(move);
  renderSequence();
  if (type !== "point" || move.targetId) {
    playHint.hidden = false;
    playHint.textContent = "Moves added. Tap Play to replay them.";
  }
  if (!state.playing && !(type === "point" && !state.targetId)) {
    const el = stage.querySelector(`.kid[data-id="${kid.id}"]`);
    if (el) playMove(el, kid, move);
  }
}

function renderSequence() {
  sequenceList.replaceChildren();
  state.sequence.forEach((move, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "seq-chip";
    chip.dataset.index = String(index);
    chip.textContent = `${index + 1}. ${labelFor(move.type)}`;
    chip.title = "Remove this move";
    sequenceList.appendChild(chip);
  });
}

function labelFor(type) {
  return { wave: "Wave", jump: "Jump", dance: "Dance", point: "Point" }[type] || type;
}

async function playSequence() {
  if (state.playing) return;
  const kid = selectedChild();
  if (!kid) {
    playHint.hidden = false;
    playHint.textContent = "Add a child from a photo first.";
    return;
  }
  if (!state.sequence.length) {
    playHint.hidden = false;
    playHint.textContent = "Add Wave, Jump, Dance, or Point, then Play.";
    return;
  }
  state.selectedId = kid.id;
  state.playing = true;
  playHint.hidden = false;
  playHint.textContent = "Playing your moves…";
  const el = stage.querySelector(`.kid[data-id="${kid.id}"]`);
  if (!el) {
    state.playing = false;
    return;
  }
  for (const move of state.sequence) {
    await playMove(el, kid, move);
  }
  state.playing = false;
  playHint.textContent = "Tap Play to replay, or add more moves.";
}

function playMove(el, kid, move) {
  return new Promise((resolve) => {
    el.classList.remove("playing-wave", "playing-jump", "playing-dance", "playing-point");
    void el.offsetWidth;
    if (move.type !== "point") clearPointing(el);
    if (move.type === "point") {
      const target =
        state.cutouts.find((c) => c.id === (move.targetId || state.targetId)) ||
        state.cutouts.find((c) => c.id !== kid.id);
      if (target) {
        state.targetId = target.id;
        const targetEl = stage.querySelector(`[data-id="${target.id}"]`);
        el.classList.add("playing-point");
        if (targetEl) aimPointingArm(el, targetEl, stage);
        wiggle(target.id);
      }
    } else {
      el.classList.add(`playing-${move.type}`);
    }
    setTimeout(() => {
      el.classList.remove(`playing-${move.type}`);
      resolve();
    }, MOVE_MS[move.type] || 800);
  });
}

function updatePointingLive() {
  const pointer = state.cutouts.find((c) => c.id === state.selectedId);
  const target = state.cutouts.find((c) => c.id === state.targetId);
  if (!pointer || !target || pointer.kind !== "child") return;
  const kidEl = stage.querySelector(`.kid[data-id="${pointer.id}"]`);
  const targetEl = stage.querySelector(`[data-id="${target.id}"]`);
  if (kidEl && targetEl) {
    kidEl.classList.toggle("dragging", Boolean(state.dragging));
    aimPointingArm(kidEl, targetEl, stage);
  }
}

function wiggle(id) {
  const el = stage.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  el.classList.remove("wiggle");
  void el.offsetWidth;
  el.classList.add("wiggle");
}

function dataUrlToBlob(dataUrl) {
  const [header, body] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(header)[1];
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
