const reveal = () => document.body.classList.add("ready");

function start() {
  setTimeout(reveal, 5000);
  Promise.all([...document.images].map((img) => (img.decode ? img.decode().catch(() => {}) : null))).then(reveal);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
