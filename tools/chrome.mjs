// Finds a local Chrome/Chromium for the developer tools (icons, guide images, the release check). Nothing is downloaded.
// Set CHROME_PATH to use a specific browser.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

export function chromePath() {
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    local && `${local}/Google/Chrome/Application/chrome.exe`, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find(p => p && fs.existsSync(p));
  if (!found) throw new Error('No Chrome found: set CHROME_PATH to a Chrome or Chromium executable');
  return found;
}
export const launchChrome = (options = {}) => chromium.launch({ executablePath: chromePath(), headless: true, ...options });
/** A fresh, empty profile with the unpacked extension in `extensionDir` installed exactly as "Load unpacked" would install it. */
export async function launchWithExtension(extensionDir, profileDir, options = {}) {
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath(), headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'], ...options
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: extensionDir });
  return { context, extensionId: id };
}
export { chromium };
