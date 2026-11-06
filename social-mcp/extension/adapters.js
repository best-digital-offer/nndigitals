(() => {
  if (window.__socialMcp) return;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(find, timeout = 18000, label = "composer") {
    const start = Date.now();
    while (Date.now() - start < timeout) { const element = find(); if (element) return element; await sleep(250); }
    throw new Error("Could not find " + label + ". The platform may have changed its page layout.");
  }
  const byText = (selector, regex, root = document) => [...root.querySelectorAll(selector)].find(el => regex.test((el.innerText || el.getAttribute("aria-label") || "").trim()));
  const enabled = el => el && !el.disabled && el.getAttribute("aria-disabled") !== "true";
  function typeText(element, value) {
    element.focus();
    const lines = value.split("\n");
    lines.forEach((line, index) => { if (index) document.execCommand("insertParagraph"); if (line) document.execCommand("insertText", false, line); });
  }
  const ready = message => ({ ok: true, status: "composer_ready", message });
  const adapters = {
    async linkedin({ text, submit }) {
      const opener = await waitFor(() => document.querySelector("button.share-box-feed-entry__trigger") || byText("button", /^start a post$/i), 20000, "LinkedIn Start a post button");
      opener.click();
      const editor = await waitFor(() => document.querySelector('.ql-editor[contenteditable="true"]') || document.querySelector('div[role="textbox"][contenteditable="true"]'), 12000, "LinkedIn post editor");
      typeText(editor, text); await sleep(600);
      if (!submit) return ready("Post prepared in LinkedIn. Review it and click Post.");
      const button = await waitFor(() => { const b = document.querySelector("button.share-actions__primary-action") || byText('div[role="dialog"] button', /^post$/i); return enabled(b) ? b : null; }, 8000, "LinkedIn Post button");
      button.click(); await sleep(2500); return { ok: true, status: "submitted", message: "Submitted to LinkedIn." };
    },
    async facebook({ text, submit }) {
      const opener = await waitFor(() => byText('div[role="button"]', /what's on your mind/i) || byText('span', /what's on your mind/i), 20000, "Facebook post composer");
      opener.click();
      const editor = await waitFor(() => document.querySelector('div[role="dialog"] div[role="textbox"][contenteditable="true"]'), 12000, "Facebook editor");
      typeText(editor, text); await sleep(700);
      if (!submit) return ready("Post prepared in Facebook. Review it and click Post.");
      const button = await waitFor(() => { const b = document.querySelector('div[role="dialog"] div[aria-label="Post"][role="button"]'); return enabled(b) ? b : null; }, 8000, "Facebook Post button");
      button.click(); await sleep(2500); return { ok: true, status: "submitted", message: "Submitted to Facebook." };
    },
    async instagram({ text, submit }) {
      const create = await waitFor(() => byText('svg[aria-label]', /^new post$/i) || document.querySelector('a[href="/create/select/"]') || byText('div[role="button"]', /^create$/i), 20000, "Instagram Create control");
      create.click();
      const next = await waitFor(() => document.querySelector('button') && byText('button', /^select from computer$/i), 10000, "Instagram media picker");
      if (next) throw new Error("Instagram requires an image or video to create a post. Text-only publishing is not supported by this extension yet. Use LinkedIn or Facebook for text-only posts.");
      return { ok: false, error: "Instagram post creation requires media selection. Media upload is not implemented in this first release." };
    }
  };
  window.__socialMcp = { async run(platform, payload) {
    try { if (!adapters[platform]) throw new Error("No adapter for " + platform); return await adapters[platform](payload); }
    catch (error) { return { ok: false, error: String(error?.message || error) }; }
  }};
})();
