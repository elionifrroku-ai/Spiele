const SHIRTS = ["#e07a5f", "#3d5a80", "#7d9b76", "#d65d5d", "#c9854a"];
const PANTS = ["#3d5a80", "#5c4a3a", "#4a6fa5", "#6b4f71"];

export const MOVE_MS = {
  wave: 1400,
  jump: 820,
  dance: 1800,
  point: 1100,
};

export function paletteFor(id) {
  let h = 2166136261;
  const key = String(id || "kid");
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const shirt = SHIRTS[Math.abs(h) % SHIRTS.length];
  const pants = PANTS[Math.abs(h >> 8) % PANTS.length];
  return { shirt, pants };
}

export function createKidElement(cutout, faceUrl, options = {}) {
  const { shirt, pants } = paletteFor(cutout.id);
  const el = document.createElement("div");
  el.className = "kid";
  el.dataset.id = cutout.id;
  el.dataset.kind = "child";
  if (options.selected) el.classList.add("selected");
  el.innerHTML = `
    <div class="kid-figure">
      <div class="kid-head">
        <img class="kid-face" alt="Child" draggable="false" src="${faceUrl}" />
      </div>
      <div class="kid-torso" style="background:${shirt}">
        <div class="arm-socket wave-socket" data-side="left">
          <div class="kid-upper" style="background:${shirt}">
            <div class="kid-forearm">
              <div class="kid-hand point-hand">
                <span class="finger thumb"></span>
                <span class="finger middle"></span>
                <span class="finger index"></span>
              </div>
            </div>
          </div>
        </div>
        <div class="arm-socket point-socket" data-side="right">
          <div class="kid-upper" style="background:${shirt}">
            <div class="kid-forearm">
              <div class="kid-hand point-hand">
                <span class="finger thumb"></span>
                <span class="finger middle"></span>
                <span class="finger index"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="kid-hips">
        <div class="kid-leg left" style="background:${pants}"></div>
        <div class="kid-leg right" style="background:${pants}"></div>
      </div>
    </div>
  `;
  return el;
}

export function fillKidPreview(host, faceUrl, id = "preview") {
  const cutout = { id };
  const kid = createKidElement(cutout, faceUrl);
  kid.classList.add("preview-kid");
  host.replaceChildren(kid);
}

export function twoBoneIk(dx, dy, l1, l2, bend) {
  const dist = Math.hypot(dx, dy) || 1;
  const d = Math.min(Math.max(dist, Math.abs(l1 - l2) + 2), l1 + l2 - 2);
  const reach = Math.atan2(dy, dx);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const b = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  return {
    shoulder: reach - bend * a,
    elbow: bend * (Math.PI - b),
    dist,
  };
}

export function aimPointingArm(kidEl, targetEl, stageEl) {
  if (!kidEl || !targetEl || !stageEl) return null;
  const stageRect = stageEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const targetX = targetRect.left + targetRect.width / 2 - stageRect.left;
  const targetY = targetRect.top + targetRect.height * 0.38 - stageRect.top;

  const kidRect = kidEl.getBoundingClientRect();
  const kidCx = kidRect.left + kidRect.width / 2 - stageRect.left;
  const useRight = targetX >= kidCx;
  kidEl.classList.add("pointing");
  kidEl.classList.toggle("aim-right", useRight);
  kidEl.classList.toggle("aim-left", !useRight);

  const leftSocket = kidEl.querySelector(".wave-socket");
  const rightSocket = kidEl.querySelector(".point-socket");
  const socket = useRight ? rightSocket : leftSocket;
  const other = useRight ? leftSocket : rightSocket;
  resetArm(other);

  const joint = socket.getBoundingClientRect();
  const sx = joint.left - stageRect.left;
  const sy = joint.top - stageRect.top;
  const dx = targetX - sx;
  const dy = targetY - sy;
  const bend = useRight ? -1 : 1;
  const ik = twoBoneIk(dx, dy, 26, 42, bend);
  const cssShoulder = ik.shoulder - Math.PI / 2;
  const upper = socket.querySelector(".kid-upper");
  const forearm = socket.querySelector(".kid-forearm");
  upper.style.setProperty("--shoulder", `${cssShoulder}rad`);
  forearm.style.setProperty("--elbow", `${ik.elbow}rad`);
  socket.classList.add("aiming");
  return { sx, sy, targetX, targetY, useRight, dx, dy };
}

export function clearPointing(kidEl) {
  if (!kidEl) return;
  kidEl.classList.remove("pointing", "aim-right", "aim-left");
  kidEl.querySelectorAll(".arm-socket").forEach(resetArm);
}

function resetArm(socket) {
  if (!socket) return;
  socket.classList.remove("aiming");
  const upper = socket.querySelector(".kid-upper");
  const forearm = socket.querySelector(".kid-forearm");
  if (upper) upper.style.removeProperty("--shoulder");
  if (forearm) forearm.style.removeProperty("--elbow");
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
