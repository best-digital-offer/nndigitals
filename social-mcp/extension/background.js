const PLATFORMS = {
  linkedin: { name: "LinkedIn", login: "https://www.linkedin.com/login", compose: "https://www.linkedin.com/feed/", cookie: { domain: "linkedin.com", name: "li_at" } },
  facebook: { name: "Facebook", login: "https://www.facebook.com/login", compose: "https://www.facebook.com/", cookie: { domain: "facebook.com", name: "c_user" } },
  instagram: { name: "Instagram", login: "https://www.instagram.com/accounts/login/", compose: "https://www.instagram.com/", cookie: { domain: "instagram.com", name: "sessionid" } }
};
const DEFAULTS = { serverUrl: "https://api.nndigitals.com", mcpToken: "", bridgeToken: "", autoSubmit: false };
const getSettings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) });
async function isConnected(key) {
  const c = PLATFORMS[key].cookie;
  return (await chrome.cookies.getAll({ domain: c.domain, name: c.name })).length > 0;
}
async function statusAll() {
  const out = {};
  for (const key of Object.keys(PLATFORMS)) out[key] = { name: PLATFORMS[key].name, connected: await isConnected(key) };
  return out;
}
let ws = null, pingTimer = null;
async function connectBridge() {
  const settings = await getSettings();
  if (!settings.bridgeToken || !settings.serverUrl) return;
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  try {
    const base = new URL(settings.serverUrl);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    base.pathname = "/bridge";
    base.search = "?token=" + encodeURIComponent(settings.bridgeToken);
    ws = new WebSocket(base.toString());
  } catch { return; }
  ws.onopen = () => {
    clearInterval(pingTimer);
    pingTimer = setInterval(() => ws?.readyState === 1 && ws.send(JSON.stringify({ type: "ping" })), 20000);
  };
  ws.onclose = () => { ws = null; clearInterval(pingTimer); };
  ws.onerror = () => {};
  ws.onmessage = async (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === "pong") return;
    try {
      const result = await handle(message.action, message.payload || {});
      ws?.send(JSON.stringify({ id: message.id, ok: true, result }));
    } catch (error) {
      ws?.send(JSON.stringify({ id: message.id, ok: false, error: String(error?.message || error) }));
    }
  };
}
chrome.alarms.create("bridge-keepalive", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(connectBridge);
chrome.runtime.onStartup.addListener(connectBridge);
chrome.runtime.onInstalled.addListener(connectBridge);
chrome.storage.onChanged.addListener(() => { ws?.close(); setTimeout(connectBridge, 400); });
connectBridge();

async function handle(action, payload) {
  if (action === "status") return statusAll();
  if (action === "connect") {
    const platform = PLATFORMS[payload.platform];
    if (!platform) throw new Error("Unsupported platform");
    await chrome.tabs.create({ url: platform.login, active: true });
    return { message: "Opened " + platform.name + " sign-in. Sign in normally, then check connections again." };
  }
  if (action === "publish_post") return publish(payload.platform, payload);
  throw new Error("Unknown action: " + action);
}
async function publish(key, payload) {
  const platform = PLATFORMS[key];
  if (!platform) throw new Error("Unsupported platform");
  if (!(await isConnected(key))) throw new Error(platform.name + " is not signed in. Call connect_platform first.");
  const settings = await getSettings();
  const submit = payload.submit === true && settings.autoSubmit === true;
  const tab = await chrome.tabs.create({ url: platform.compose, active: true });
  await waitForLoad(tab.id);
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["adapters.js"] });
  const [response] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (name, data) => window.__socialMcp.run(name, data),
    args: [key, { text: payload.text, submit }]
  });
  const result = response?.result;
  if (!result) throw new Error("No result from the social composer.");
  if (!result.ok) throw new Error(result.error);
  if (payload.submit && !submit) result.note = "Automatic submission is disabled. Review the prepared post and publish it manually.";
  return result;
}
function waitForLoad(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("Timed out loading social platform.")); }, timeout);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); setTimeout(resolve, 1200);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(tab => { if (tab.status === "complete") listener(tabId, { status: "complete" }); }).catch(reject);
  });
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "getState") {
      const settings = await getSettings();
      sendResponse({ wsOk: ws?.readyState === WebSocket.OPEN, status: await statusAll(), settings });
    } else if (message.type === "connect") {
      const platform = PLATFORMS[message.platform];
      if (!platform) throw new Error("Unsupported platform");
      await chrome.tabs.create({ url: platform.login, active: true });
      sendResponse({ ok: true });
    } else if (message.type === "saveSettings") {
      await chrome.storage.local.set(message.settings);
      sendResponse({ ok: true });
    }
  })().catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});
