const DEFAULT_COLOR = "#fff";
const FIRST_MESSAGE_LABEL = "first message";

let MAX_MESSAGES = 10;
let MESSAGE_LIFETIME = 15000;
let USER_BLACKLIST = new Set(["streamelements", "nightbot", "moobot", "wizebot", "streamlabs", "jeetbot", "vsestream"]);

const EVENTS = {
  follow: {
    color: "#4cc9f0",
    label: "new follow",
    texts: [
      "дарова, аннигилятор",
      "добро пожаловать в убежище",
      "проходи, не стесняйся",
      "ещё один боец в строю",
      "располагайся поудобнее",
      "рады видеть на борту",
      "залетай в движ",
      "теперь ты один из нас",
    ],
  },
  subscriber: {
    color: "#f7b801",
    label: "new sub",
    texts: [
      "добро пожаловать в элиту",
      "уважение за поддержку",
      "саб-комьюнити стало сильнее",
      "легендарное решение",
      "статус повышен",
      "теперь с VIP-пропуском",
      "официально в клубе",
      "респект за подписку",
    ],
  },
  raid: {
    color: "#9b5de5",
    label: "raid",
    texts: [
      "дарова, аннигиляторы",
      "портал открыт",
      "подкрепление прибыло",
      "новый отряд на позиции",
      "рейдеры замечены",
      "десант успешно высадился",
      "боевой отряд прибыл",
    ],
  },
};

const chat = document.getElementById("chat");
const template = document.getElementById("message-template");

const nodePool = [];

let messageQueue = [];
let rafPending = false;

window.addEventListener("onEventReceived", ({ detail }) => {
  const { listener, event } = detail;

  if (!event) return;

  // SE docs put "widget-button" in detail.listener, but real payloads carry it in detail.event.listener.
  if (listener === "widget-button" || event.listener === "widget-button") {
    if (Object.hasOwn(TESTS, event.field)) TESTS[event.field]();
    return;
  }

  if (listener === "message") {
    const { data } = event;
    if (!data) return;

    const username = (data.nick || data.displayName || "").toLowerCase();

    if (USER_BLACKLIST.has(username)) return;

    messageQueue.push({ listener, data, receivedAt: Date.now() });
  } else if (listener === "event") {
    const { data, type } = event;

    if (!data || !Object.hasOwn(EVENTS, type)) return;

    messageQueue.push({ listener, data, type, receivedAt: Date.now() });
  } else if (listener === "delete-message") {
    removeWhere("msgId", event.msgId);
    return;
  } else if (listener === "delete-messages") {
    removeWhere("userId", event.userId);
    return;
  } else if (listener === "widget-button") {
    if (Object.hasOwn(TESTS, event.field)) TESTS[event.field]();
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
  node._timeoutId = setTimeout(() => {
    node.classList.add("message-removing");
    node._exitTimeoutId = setTimeout(() => recycleNode(node), 300);
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
    eventText.textContent = FIRST_MESSAGE_LABEL;
  }

  setupRemoval(node);
  return node;
}

function createEvent({ data, type }) {
  const node = getNode();
  const { text, eventText } = node._refs;
  const { color, label, texts } = EVENTS[type];

  applyUserStyle(node, data, color);
  text.textContent = randomFrom(texts);
  node.classList.add("with-event");

  eventText.textContent = type === "raid" ? `${label} × ${data.amount}` : label;

  setupRemoval(node);
  return node;
}

// Settings from Fields (edited in the SE panel instead of the code).
window.addEventListener("onWidgetLoad", ({ detail }) => {
  const fields = detail.fieldData;

  MAX_MESSAGES = Number(fields.maxMessages) || MAX_MESSAGES;
  MESSAGE_LIFETIME = (Number(fields.messageLifetime) || MESSAGE_LIFETIME / 1000) * 1000;

  if (typeof fields.userBlacklist === "string") {
    USER_BLACKLIST = new Set(
      fields.userBlacklist
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)
    );
  }
});

// Test buttons (Fields: type "button"): emulate SE events right in the editor.
let lastTestMsgId = null;

function emulate(listener, event) {
  window.dispatchEvent(new CustomEvent("onEventReceived", { detail: { listener, event } }));
}

const TESTS = {
  testMessage: () => {
    lastTestMsgId = `test-${Date.now()}`;
    emulate("message", {
      data: {
        nick: "tester",
        displayName: "Tester",
        userId: "test-user",
        msgId: lastTestMsgId,
        text: "Test message",
        emotes: [],
        badges: [],
        tags: {},
      },
    });
  },
  testDelete: () => emulate("delete-message", { msgId: lastTestMsgId }),
  testFollow: () => emulate("event", { type: "follow", data: { displayName: "Tester" } }),
  testRaid: () => emulate("event", { type: "raid", data: { displayName: "Tester", amount: 42 } }),
};
