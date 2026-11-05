const stimValueEl = document.getElementById("stim-value");
const clickPowerEl = document.getElementById("click-power");
const spsValueEl = document.getElementById("sps-value");

const overloadFillEl = document.getElementById("overload-fill");
const hypeFillEl = document.getElementById("hype-fill");
const driftFillEl = document.getElementById("drift-fill");

const tapBtn = document.getElementById("tap-btn");
const statusLineEl = document.getElementById("status-line");
const shopListEl = document.getElementById("shop-list");
const shopItemTemplate = document.getElementById("shop-item-template");
const fxLayerEl = document.getElementById("fx-layer");
const toastEl = document.getElementById("toast");
const muteToggleEl = document.getElementById("mute-toggle");
const clickToggleEl = document.getElementById("click-toggle");
const purchaseToggleEl = document.getElementById("purchase-toggle");

let audioCtx = null;
const shopNodes = [];
const soundState = {
  master: true,
  click: true,
  purchase: true
};

const game = {
  stim: 0,
  clickPower: 1,
  sps: 0,
  overload: 0,
  hype: 5,
  drift: 10,
  totalClicks: 0
};

const upgrades = [
  {
    key: "energyDrink",
    name: "Energy Drink Stack",
    desc: "+1 stimulation per click",
    baseCost: 25,
    scale: 1.35,
    level: 0,
    justPurchased: false,
    apply: () => { game.clickPower += 1; }
  },
  {
    key: "shortsFeed",
    name: "Short-Form Feed",
    desc: "+1 stimulation per second",
    baseCost: 45,
    scale: 1.42,
    level: 0,
    justPurchased: false,
    apply: () => { game.sps += 1; }
  },
  {
    key: "notificationStorm",
    name: "Notification Storm",
    desc: "+4 stimulation per second, +8 overload",
    baseCost: 140,
    scale: 1.55,
    level: 0,
    justPurchased: false,
    apply: () => {
      game.sps += 4;
      game.overload = Math.min(100, game.overload + 8);
    }
  },
  {
    key: "doomscrollBot",
    name: "Doomscroll Bot",
    desc: "+8 stimulation per second",
    baseCost: 310,
    scale: 1.67,
    level: 0,
    justPurchased: false,
    apply: () => { game.sps += 8; }
  },
  {
    key: "brainSplit",
    name: "Second Screen Brain",
    desc: "x1.35 click power",
    baseCost: 520,
    scale: 1.72,
    level: 0,
    justPurchased: false,
    apply: () => { game.clickPower = Math.ceil(game.clickPower * 1.35); }
  }
];

// Saves stay in this browser; derived power is stored to preserve purchase order.
const SAVE_KEY = "stimulation-spiral-save-v1";

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      game: { ...game },
      upgrades: Object.fromEntries(upgrades.map(upgrade => [upgrade.key, upgrade.level])),
      sound: { ...soundState }
    }));
    return true;
  } catch {
    return false;
  }
}

function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== 1 || !saved.game || !saved.upgrades || !saved.sound) return false;
    const nextGame = {};
    for (const key of Object.keys(game)) {
      const value = saved.game[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return false;
      nextGame[key] = value;
    }
    if (nextGame.clickPower < 1 || !Number.isSafeInteger(nextGame.totalClicks)) return false;
    if (["overload", "hype", "drift"].some(key => nextGame[key] > 100)) return false;
    const levels = upgrades.map(upgrade => saved.upgrades[upgrade.key]);
    if (levels.some(level => !Number.isSafeInteger(level) || level < 0)) return false;
    if (Object.keys(soundState).some(key => typeof saved.sound[key] !== "boolean")) return false;
    // Validate everything before changing live state. Never replay apply().
    Object.assign(game, nextGame);
    upgrades.forEach((upgrade, index) => { upgrade.level = levels[index]; });
    for (const key of Object.keys(soundState)) soundState[key] = saved.sound[key];
    return true;
  } catch {
    return false;
  }
}

function formatNumber(value) {
  if (value < 1000) return String(Math.floor(value));
  if (value < 1000000) return `${(value / 1000).toFixed(1)}K`;
  return `${(value / 1000000).toFixed(2)}M`;
}

function getUpgradeCost(upgrade) {
  return Math.floor(upgrade.baseCost * Math.pow(upgrade.scale, upgrade.level));
}

function pulseAt(x, y) {
  const pulse = document.createElement("span");
  pulse.className = "fx-pulse";
  pulse.style.left = `${x}px`;
  pulse.style.top = `${y}px`;
  fxLayerEl.appendChild(pulse);
  window.setTimeout(() => pulse.remove(), 520);
}

function floatTextAt(x, y, text) {
  const floaty = document.createElement("span");
  floaty.className = "fx-float";
  floaty.textContent = text;
  floaty.style.left = `${x}px`;
  floaty.style.top = `${y}px`;
  fxLayerEl.appendChild(floaty);
  window.setTimeout(() => floaty.remove(), 900);
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.clearTimeout(showToast._hideTimer);
  showToast._hideTimer = window.setTimeout(() => {
    toastEl.classList.remove("show");
  }, 1200);
}

function playPurchaseSound() {
  if (!soundState.master || !soundState.purchase) return;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(760, now + 0.12);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}

function playClickSound() {
  if (!soundState.master || !soundState.click) return;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(640, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.06);
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.09);
}

function setSoundButton(btn, label, isOn) {
  btn.textContent = `${label}: ${isOn ? "On" : "Off"}`;
  btn.classList.toggle("is-off", !isOn);
  btn.setAttribute("aria-pressed", String(!isOn));
}

function renderSoundControls() {
  setSoundButton(muteToggleEl, "Sound", soundState.master);
  setSoundButton(clickToggleEl, "Click", soundState.click);
  setSoundButton(purchaseToggleEl, "Buy", soundState.purchase);
}

function initSoundControls() {
  muteToggleEl.addEventListener("click", () => {
    soundState.master = !soundState.master;
    renderSoundControls();
    saveGame();
  });
  clickToggleEl.addEventListener("click", () => {
    soundState.click = !soundState.click;
    renderSoundControls();
    saveGame();
  });
  purchaseToggleEl.addEventListener("click", () => {
    soundState.purchase = !soundState.purchase;
    renderSoundControls();
    saveGame();
  });
  renderSoundControls();
}

function tap(event) {
  game.stim += game.clickPower;
  game.totalClicks += 1;

  game.hype = Math.min(100, game.hype + 2.8);
  game.overload = Math.min(100, game.overload + 0.9);
  game.drift = Math.min(100, game.drift + 0.5);

  playClickSound();
  pulseAt(event.clientX, event.clientY);
  render();
}

function buyUpgrade(index, event) {
  const upgrade = upgrades[index];
  const cost = getUpgradeCost(upgrade);
  if (game.stim < cost) return;

  game.stim -= cost;
  upgrade.level += 1;
  upgrade.apply();
  upgrade.justPurchased = true;
  game.hype = Math.min(100, game.hype + 6);
  game.overload = Math.min(100, game.overload + 3);
  saveGame();
  showToast(`Purchased ${upgrade.name}`);
  playPurchaseSound();
  if (event) {
    floatTextAt(event.clientX, event.clientY - 10, "+UPGRADE");
  }
  render();
  window.setTimeout(() => {
    upgrade.justPurchased = false;
    render();
  }, 520);
}

function getStateLine() {
  if (game.overload > 90) return "Sensory overload imminent. Eyes open. Click faster.";
  if (game.hype > 85) return "Dopamine wave detected. Keep feeding the spiral.";
  if (game.sps > 20) return "Autopilot stimulation machine is online.";
  if (game.totalClicks < 8) return "Every click wakes the feed.";
  return "The loop is warm. Push it harder.";
}

function renderShop() {
  upgrades.forEach((upgrade, index) => {
    const shopNode = shopNodes[index];
    if (!shopNode) return;
    const { node, nameEl, descEl, buyBtn } = shopNode;
    const cost = getUpgradeCost(upgrade);
    nameEl.textContent = `${upgrade.name} Lv.${upgrade.level}`;
    descEl.textContent = upgrade.desc;
    buyBtn.textContent = upgrade.justPurchased ? "Bought!" : `Buy ${formatNumber(cost)}`;
    buyBtn.disabled = game.stim < cost;

    if (upgrade.justPurchased) {
      node.classList.add("purchased");
      buyBtn.classList.add("purchased");
    } else {
      node.classList.remove("purchased");
      buyBtn.classList.remove("purchased");
    }
  });
}

function initShop() {
  shopListEl.innerHTML = "";
  upgrades.forEach((upgrade, index) => {
    const node = shopItemTemplate.content.firstElementChild.cloneNode(true);
    const nameEl = node.querySelector(".name");
    const descEl = node.querySelector(".desc");
    const buyBtn = node.querySelector(".buy-btn");
    buyBtn.addEventListener("click", (event) => buyUpgrade(index, event));

    shopNodes[index] = { node, nameEl, descEl, buyBtn };
    shopListEl.appendChild(node);
  });
}

function renderMeters() {
  overloadFillEl.style.width = `${game.overload}%`;
  hypeFillEl.style.width = `${game.hype}%`;
  driftFillEl.style.width = `${game.drift}%`;

  document.body.classList.toggle("overloaded", game.overload >= 65);
  document.body.classList.toggle("meltdown", game.overload >= 88);
}

function render() {
  stimValueEl.textContent = formatNumber(game.stim);
  clickPowerEl.textContent = formatNumber(game.clickPower);
  spsValueEl.textContent = formatNumber(game.sps);
  statusLineEl.textContent = getStateLine();
  renderMeters();
  renderShop();
}

function tick() {
  game.stim += game.sps / 10;
  game.hype = Math.max(0, game.hype - 0.35);
  game.drift = Math.max(0, game.drift - 0.22);

  if (game.overload > 0) {
    game.overload -= 0.12 + (game.drift > 70 ? 0.08 : 0);
  }

  game.overload = Math.max(0, game.overload);
  render();
}

tapBtn.addEventListener("click", tap);

const restored = loadGame();
initShop();
initSoundControls();
render();
window.setInterval(tick, 100);
window.setInterval(saveGame, 5000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame();
});
window.addEventListener("pagehide", saveGame);
if (restored) showToast("Progress restored");
