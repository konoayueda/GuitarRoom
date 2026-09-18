// Bootstrap lets the page stop OCR even before Tesseract finishes initialization.
const channel = new BroadcastChannel(
  new URL(self.location.href).searchParams.get("channel"),
);
let timer;
function stop() {
  clearTimeout(timer);
  channel.close();
  self.close();
}
channel.onmessage = (event) => {
  if (event.data === "cancel") stop();
};
channel.postMessage({ type: "ready" });
timer = setTimeout(() => {
  channel.postMessage({ type: "error" });
  stop();
}, 45000);
const send = self.postMessage.bind(self);
self.postMessage = (message, ...transfer) => {
  send(message, ...transfer);
  if (message.status === "resolve" && message.action === "initialize")
    clearTimeout(timer);
  if (
    message.status === "reject" &&
    ["load", "loadLanguage", "initialize"].includes(message.action)
  )
    setTimeout(stop, 0);
};
self.addEventListener("error", () => {
  channel.postMessage({ type: "error" });
  stop();
});
try {
  importScripts("/ocr/worker.min.js");
} catch {
  channel.postMessage({ type: "error" });
  stop();
}
