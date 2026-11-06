const $ = id => document.getElementById(id);
let filled = false;
async function render() {
  const state = await chrome.runtime.sendMessage({ type: "getState" });
  $("bridge").innerHTML = state.wsOk ? '<span class="dot on" style="display:inline-block"></span> Connected to api.nndigitals.com' : '<span class="dot" style="display:inline-block"></span> Backend not connected';
  $("rows").innerHTML = "";
  for (const [key, platform] of Object.entries(state.status)) {
    const row = document.createElement("div"); row.className = "row";
    const dot = document.createElement("span"); dot.className = "dot" + (platform.connected ? " on" : "");
    const name = document.createElement("span"); name.className = "name"; name.textContent = platform.name;
    const button = document.createElement("button"); button.textContent = platform.connected ? "Signed in" : "Connect"; button.disabled = platform.connected;
    button.addEventListener("click", () => chrome.runtime.sendMessage({ type: "connect", platform: key }));
    row.append(dot, name, button); $("rows").appendChild(row);
  }
  if (!filled) {
    $("serverUrl").value = state.settings.serverUrl;
    $("mcpToken").value = state.settings.mcpToken;
    $("bridgeToken").value = state.settings.bridgeToken;
    $("auto").checked = state.settings.autoSubmit;
    filled = true;
  }
}
$("save").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "saveSettings", settings: {
    serverUrl: $("serverUrl").value.trim().replace(/\/$/, ""),
    mcpToken: $("mcpToken").value.trim(), bridgeToken: $("bridgeToken").value.trim(), autoSubmit: $("auto").checked
  }});
  $("saved").textContent = response?.ok ? "Saved. Reconnecting…" : (response?.error || "Could not save");
  setTimeout(() => $("saved").textContent = "", 2500);
});
render(); setInterval(render, 2500);
