const MAX_MESSAGES = 10;
const MESSAGE_LIFETIME = 15000;
const DEFAULT_COLOR = "#fff";

const USER_BLACKLIST = new Set(["streamelements", "nightbot", "moobot", "wizebot", "streamlabs", "jeetbot", "vsestream"]);

const EVENT_COLORS = {
  follow: "#4cc9f0",
  subscriber: "#f7b801",
  raid: "#9b5de5",
};

const EVENT_TYPES = {
  firstMessage: "first message",
  follow: "new follow",
  subscriber: "new sub",
  raid: "raid",
};

const EVENT_TEXTS = {
  follow: [
    "дарова, аннигилятор",
    "добро пожаловать в убежище",
    "проходи, не стесняйся",
    "ещё один боец в строю",
    "располагайся поудобнее",
    "рады видеть на борту",
    "залетай в движ",
    "теперь ты один из нас",
  ],
  subscriber: [
    "добро пожаловать в элиту",
    "уважение за поддержку",
    "саб-комьюнити стало сильнее",
    "легендарное решение",
    "статус повышен",
    "теперь с VIP-пропуском",
    "официально в клубе",
    "респект за подписку",
  ],
  raid: [
    "дарова, аннигиляторы",
    "портал открыт",
    "подкрепление прибыло",
    "новый отряд на позиции",
    "рейдеры замечены",
    "десант успешно высадился",
    "боевой отряд прибыл",
  ],
};

const ALLOWED_EVENTS = new Set(Object.keys(EVENT_TYPES));

const chat = document.getElementById("chat");
const template = document.getElementById("message-template");

const nodePool = [];

let messageQueue = [];
let rafPending = false;

window.addEventListener("onEventReceived", ({ detail }) => {
  const { listener, event } = detail;

  if (!event) return;

  if (listener === "message") {
    const { data } = event;
    if (!data) return;

    const username = (data.nick || data.displayName || "").toLowerCase();

    if (USER_BLACKLIST.has(username)) return;

    messageQueue.push({ listener, data, receivedAt: Date.now() });
  } else if (listener === "event") {
    const { data, type } = event;

    if (!data || !ALLOWED_EVENTS.has(type)) return;

    messageQueue.push({ listener, data, type, receivedAt: Date.now() });
  } else if (listener === "delete-message") {
    removeWhere("msgId", event.msgId);
    return;
  } else if (listener === "delete-messages") {
    removeWhere("userId", event.userId);
    return;
  } else {
    return;
  }

  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(flushQueue);
  }
});

// One predicate for flushed nodes (dataset) and items still waiting for the rAF flush,
// so a delete can't race the flush. Events carry no ids and are never matched.
function removeWhere(key, value) {
  if (!value) return;

  messageQueue = messageQueue.filter((item) => item.listener !== "message" || item.data[key] !== value);

  for (const node of [...chat.children]) {
    if (node.dataset[key] === value) recycleNode(node);
  }
}

function flushQueue() {
  rafPending = false;

  // rAF is paused while the source is hidden: don't replay messages that already expired.
  const now = Date.now();
  const items = messageQueue.filter((item) => now - item.receivedAt < MESSAGE_LIFETIME).slice(-MAX_MESSAGES);
  messageQueue = [];

  const fragment = document.createDocumentFragment();

  for (const item of items) fragment.appendChild(item.listener === "event" ? createEvent(item) : createMessage(item.data));

  chat.appendChild(fragment);

  while (chat.children.length > MAX_MESSAGES) {
    recycleNode(chat.firstElementChild);
  }
}

function getNode() {
  if (nodePool.length) return nodePool.pop();

  const node = template.content.firstElementChild.cloneNode(true);
  node._baseClassName = node.className;
  node._refs = {
    username: node.querySelector(".username"),
    usernameText: node.querySelector(".username-text"),
    badges: node.querySelector(".badges"),
    text: node.querySelector(".text"),
    eventText: node.querySelector(".event-text"),
  };
  return node;
}

function recycleNode(node) {
  clearTimeout(node._timeoutId);
  clearTimeout(node._exitTimeoutId);

  const { username, usernameText, badges, text, eventText } = node._refs;

  node.className = node._baseClassName;
  delete node.dataset.msgId;
  delete node.dataset.userId;
  username.style.color = "";
  username.style.removeProperty("--user-color");

  for (const el of [usernameText, badges, text, eventText]) el.replaceChildren();

  node.remove();

  if (nodePool.length < MAX_MESSAGES) nodePool.push(node);
}

function setupRemoval(node) {
  const token = (setupRemoval._counter = (setupRemoval._counter ?? 0) + 1);
  node._removalToken = token;

  node._timeoutId = setTimeout(() => {
    if (node._removalToken !== token) return;
    node.classList.add("message-removing");

    node._exitTimeoutId = setTimeout(() => {
      if (node.parentNode) recycleNode(node);
    }, 300);
  }, MESSAGE_LIFETIME);
}

// Built with DOM APIs (no HTML strings), so nothing needs escaping.
function renderBadges(badges = []) {
  return badges
    .filter((badge) => badge.url)
    .map((badge) => {
      const img = new Image();
      img.alt = "";
      img.src = badge.url;
      return img;
    });
}

// Emotes are matched by name (like the default SE template), not by start/end:
// no sorting, bounds or code point vs UTF-16 problems.
function renderMessageContent(text = "", emotes = []) {
  const byName = new Map(emotes.map((emote) => [emote.name, emote]));
  const fragment = document.createDocumentFragment();

  for (const part of text.split(/(\s+)/)) {
    const emote = byName.get(part);
    const src = emote?.urls?.["2"] ?? emote?.urls?.["1"] ?? emote?.urls?.["4"];

    if (src) {
      const img = new Image();
      img.className = "chat-emote";
      img.alt = emote.name;
      img.src = src;
      fragment.append(img);
    } else if (part) {
      fragment.append(part);
    }
  }

  return fragment;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function applyUserStyle(node, data, colorOverride) {
  const color = colorOverride || data.displayColor || DEFAULT_COLOR;

  const { username, usernameText } = node._refs;
  username.style.color = color;
  username.style.setProperty("--user-color", color);
  usernameText.textContent = data.displayName || "";
}

function createMessage(data) {
  const node = getNode();
  const { badges, text, eventText } = node._refs;

  if (data.msgId) node.dataset.msgId = data.msgId;
  if (data.userId) node.dataset.userId = data.userId;

  applyUserStyle(node, data);
  badges.append(...renderBadges(data.badges));
  text.append(renderMessageContent(data.text, data.emotes));

  if (data.tags?.["first-msg"] === "1") {
    node.classList.add("with-event");
    eventText.textContent = EVENT_TYPES.firstMessage;
  }

  setupRemoval(node);
  return node;
}

function createEvent({ data, type }) {
  const node = getNode();
  const { badges, text, eventText } = node._refs;

  applyUserStyle(node, data, EVENT_COLORS[type]);
  text.textContent = randomFrom(EVENT_TEXTS[type] ?? [""]);
  node.classList.add("with-event");

  eventText.textContent = type === "raid" ? `${EVENT_TYPES[type]} × ${data.amount}` : EVENT_TYPES[type];

  setupRemoval(node);
  return node;
}
