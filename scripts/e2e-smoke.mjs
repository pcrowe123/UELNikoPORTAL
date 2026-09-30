// End-to-end smoke test: drive a real browser against the built app and launch something.
//
//   npm run e2e                            builds a demo bundle, serves it, drives it, cleans up
//   node scripts/e2e-smoke.mjs --keep      leave the browser open at the end
//   node scripts/e2e-smoke.mjs --port 4173 use a server that is already running instead
//
// It builds its OWN bundle with DEMO_BUILD=1, which blanks the Supabase values whatever
// .env.local says. So it always runs against the local demo backend (IndexedDB): no account, no
// network, and no possibility of touching the real user list or the real tile list.
//
// It proves the screens work. The database's own guarantees - the https-only check constraint, the
// RLS policies - are a different question, checked against the live project directly.
//
// Headless Edge or Chrome is driven over the DevTools Protocol directly - no Playwright, no
// Puppeteer, nothing to install. Same approach as the sibling applications.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const GIVEN_PORT = value('port', '');
const KEEP = flag('keep');

/**
 * Is anything listening here already?
 *
 * This matters more than it looks. Every sibling project's smoke test serves a build on a port in
 * this range, and a preview server left running from another one answers a fetch perfectly
 * happily - so without this check the test quietly runs against a different application and fails
 * with something baffling. `vite preview --strictPort` does exit on a clash, but its output is
 * discarded, so the clash has to be found here.
 */
// Asked by fetching rather than by binding. Binding is the obvious way and it does not work here:
// on Windows a probe can take 127.0.0.1:4191 while another server already holds [::]:4191, and
// `localhost` resolves to ::1 first - so the probe says "free" and the browser still reaches the
// other server. Fetching tests exactly what the browser will do with this origin.
async function portIsFree(port) {
  const res = await fetch(`http://localhost:${port}/`, {
    signal: AbortSignal.timeout(2000),
  }).catch(() => null);
  return res === null;
}

async function findFreePort(from) {
  for (let port = from; port < from + 40; port++) {
    if (await portIsFree(port)) return port;
  }
  console.error(`\nNo free port between ${from} and ${from + 39}.\n`);
  process.exit(2);
}

/** Without --port this serves its own demo build on a free port of its own. */
const PORT = GIVEN_PORT ? Number(GIVEN_PORT) : await findFreePort(4191);
const ORIGIN = `http://localhost:${PORT}`;

/** The narrowest phone worth designing for. The tile grid is checked against it. */
const PHONE_WIDTH = 390;

/** The preview server this script started, if it started one. */
let ownServer = null;

function buildAndServeDemo() {
  process.stdout.write('  building a demo bundle (no Supabase project in it) … ');
  const built = spawnSync('npx', ['--yes', 'vite', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, DEMO_BUILD: '1' },
  });
  if (built.status !== 0) {
    console.log('FAILED\n');
    console.error(built.stdout ?? '');
    console.error(built.stderr ?? '');
    process.exit(1);
  }
  process.stdout.write('ok\n');

  ownServer = spawn(
    'npx',
    ['--yes', 'vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' },
  );
}

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

let failures = 0;
const step = (name) => process.stdout.write(`  ${name} … `);
const pass = () => process.stdout.write('ok\n');
const fail = (why) => {
  failures++;
  process.stdout.write(`FAILED\n      ${why}\n`);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what, check, timeoutMs = 10000) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    try {
      last = await check();
      if (last) return last;
    } catch (err) {
      last = err.message;
    }
    await wait(200);
  }
  throw new Error(`timed out waiting for ${what} (last saw: ${JSON.stringify(last)})`);
}

/** Set a React-controlled input's value the way a person typing would. */
const TYPE_INTO = `
  const type = (sel, v) => {
    const el = document.querySelector(sel);
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
`;

async function main() {
  const browserPath = BROWSERS.find((p) => existsSync(p));
  if (!browserPath) {
    console.error('No Edge or Chrome found. Looked in:\n  ' + BROWSERS.join('\n  '));
    process.exit(2);
  }

  console.log(`\nSmoke test\n`);
  if (!GIVEN_PORT) buildAndServeDemo();

  // Check the server is up before starting a browser against nothing.
  await waitFor(
    'the server',
    async () => {
      const res = await fetch(ORIGIN).catch(() => null);
      return res?.ok ? true : null;
    },
    30000,
  ).catch((err) => {
    console.error(`${err.message}`);
    if (GIVEN_PORT) {
      console.error(`Nothing is serving ${ORIGIN}. Drop --port to let this build and serve its own.`);
    }
    ownServer?.kill();
    process.exit(2);
  });

  const profile = mkdtempSync(join(tmpdir(), 'uelnikoportal-e2e-'));
  const browser = spawn(
    browserPath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      `--window-size=${PHONE_WIDTH},900`,
      ORIGIN,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  // The chosen debugging port is announced on stderr.
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(
      () => reject(new Error('the browser never announced a debugging port')),
      20000,
    );
    browser.stderr.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/ws:\/\/[^\s]+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    browser.on('exit', (code) => reject(new Error(`the browser exited with code ${code}`)));
  });

  const targets = await (
    await fetch(`${new URL(wsUrl).origin.replace('ws:', 'http:')}/json/list`)
  ).json();
  const page = targets.find((t) => t.type === 'page' && t.url.startsWith(ORIGIN)) ?? targets[0];

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('could not attach to the page')), {
      once: true,
    });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const waiting = pending.get(msg.id);
    if (waiting) {
      pending.delete(msg.id);
      msg.error ? waiting.reject(new Error(msg.error.message)) : waiting.resolve(msg.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  /**
   * Run an expression in the page and give back its value.
   *
   * The wrapper is `async` so a step can `await fetch(...)` — checking the manifest and its icons
   * means asking the server for them. `awaitPromise` below then resolves the promise this returns,
   * so a step that returns a plain value is unaffected.
   */
  async function evaluate(expression) {
    const out = await send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (out.exceptionDetails) {
      throw new Error(out.exceptionDetails.exception?.description ?? 'threw in the page');
    }
    return out.result.value;
  }

  const cleanUp = async () => {
    if (!KEEP) {
      browser.kill();
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* Windows sometimes holds the profile briefly; it is a temp folder either way. */
      }
    }
    // Always stop the server this script started, even with --keep: the browser can stay open
    // against a page it has already loaded.
    ownServer?.kill();
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');

    // Windows Chrome refuses to make a window narrower than about 500px, so `--window-size=390`
    // is quietly ignored and the page lays out at ~496px. This check used to pass for that reason
    // rather than because the layout worked — it was never seeing a phone at all. The viewport has
    // to be forced through the protocol, which is not bound by the OS window.
    await send('Emulation.setDeviceMetricsOverride', {
      width: PHONE_WIDTH,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });

    // Console errors are a failure in their own right.
    const consoleErrors = [];
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    });

    step('the app loads');
    await waitFor('the page to render', () =>
      evaluate('return document.querySelector("#root")?.children.length > 0'),
    );
    pass();

    // Proved before anything is judged: a stale preview server from a sibling project answers a
    // fetch just as cheerfully as ours, and every later step would then be nonsense.
    step('the page being served is this application');
    const whose = await evaluate('return document.title');
    whose.includes('Portal')
      ? pass()
      : fail(`${ORIGIN} is serving "${whose}", not the Portal. Something else is on that port.`);

    step('it asks for a sign-in and takes one');
    await waitFor('the login card', () => evaluate('return !!document.querySelector(".login-card")'));
    await evaluate(`
      ${TYPE_INTO}
      type('#login-email', 'demo@uel.ie');
      type('#login-password', 'whatever at all');
      document.querySelector('.login-card form').requestSubmit();
      return true;
    `);
    await waitFor('the landing page', () => evaluate('return !!document.querySelector(".tiles")'));
    pass();

    step('it is running against the local demo backend');
    const demo = await evaluate('return !!document.querySelector(".demo-pill")');
    demo ? pass() : fail('expected the Demo pill - this smoke test must not run against real data');

    step('the seven seeded applications are shown');
    const names = await waitFor('the tiles', () =>
      evaluate(`
        const tiles = [...document.querySelectorAll('.tile .tile-words b')].map((e) => e.textContent);
        return tiles.length ? tiles : null;
      `),
    );
    names.length === 7 ? pass() : fail(`expected 7 tiles, saw ${names.length}: ${JSON.stringify(names)}`);

    step('no tile was rendered as broken');
    const broken = await evaluate('return document.querySelectorAll(".tile-broken").length');
    broken === 0 ? pass() : fail(`${broken} tile(s) have an address the engine refused`);

    // The whole point of the portal: every tile is a real, safe outbound link.
    step('every tile is an https link that cannot reach back into the portal');
    const hrefs = await evaluate(`
      return [...document.querySelectorAll('a.tile')].map((a) => ({
        href: a.getAttribute('href'),
        rel: a.getAttribute('rel') || '',
        target: a.getAttribute('target') || '',
      }));
    `);
    const wrong = hrefs.filter(
      (a) =>
        !/^https:\/\//.test(a.href) ||
        !a.rel.includes('noopener') ||
        !a.rel.includes('noreferrer') ||
        a.target !== '_blank',
    );
    hrefs.length === 7 && wrong.length === 0
      ? pass()
      : fail(`expected 7 https links with rel=noopener noreferrer target=_blank, wrong: ${JSON.stringify(wrong)}`);

    step('the search box narrows the list');
    await evaluate(`
      ${TYPE_INTO}
      type('#tile-search', 'warehouse');
      return true;
    `);
    const filtered = await waitFor('the list to narrow', () =>
      evaluate(`
        const tiles = [...document.querySelectorAll('.tile .tile-words b')].map((e) => e.textContent);
        return tiles.length === 1 ? tiles : null;
      `),
    ).catch(() => null);
    filtered && filtered[0].includes('Stock')
      ? pass()
      : fail(`searching "warehouse" should leave only Stock, saw ${JSON.stringify(filtered)}`);
    await evaluate(`${TYPE_INTO} type('#tile-search', ''); return true;`);

    // Three date inputs side by side once clipped a sibling app's dialog off a phone screen. The
    // cheap guard is to measure the page rather than to trust the CSS.
    step(`nothing overflows a ${PHONE_WIDTH}px screen`);
    const overflow = await evaluate(`
      const doc = document.documentElement;
      return { scroll: doc.scrollWidth, client: doc.clientWidth };
    `);
    // The viewport is asserted, not assumed: if the override ever stops working this must fail
    // loudly rather than quietly go back to measuring a 496px window.
    if (overflow.client !== PHONE_WIDTH) {
      fail(`the viewport is ${overflow.client}px, not ${PHONE_WIDTH}px — this is not testing a phone`);
    } else if (overflow.scroll > overflow.client + 1) {
      fail(`the page is ${overflow.scroll}px wide in a ${overflow.client}px viewport`);
    } else {
      pass();
    }

    // The manifest and the service worker are what make the portal installable at all (PL-09).
    step('the app is installable: a manifest is linked and complete');
    const manifest = await evaluate(`
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return null;
      const res = await fetch(link.href);
      if (!res.ok) return { status: res.status };
      const m = await res.json();
      return {
        name: m.name,
        display: m.display,
        start_url: m.start_url,
        icons: (m.icons || []).map((i) => i.sizes + (i.purpose ? ':' + i.purpose : '')),
      };
    `);
    const manifestOk =
      manifest &&
      manifest.display === 'standalone' &&
      /Portal/.test(manifest.name ?? '') &&
      manifest.icons?.includes('192x192') &&
      manifest.icons?.includes('512x512') &&
      manifest.icons?.some((i) => i.includes('maskable'));
    manifestOk ? pass() : fail(`the manifest is missing or incomplete: ${JSON.stringify(manifest)}`);

    step('every icon the manifest promises actually exists');
    const iconsOk = await evaluate(`
      const link = document.querySelector('link[rel="manifest"]');
      const m = await (await fetch(link.href)).json();
      const results = [];
      for (const icon of m.icons || []) {
        const url = new URL(icon.src, link.href).href;
        const res = await fetch(url);
        results.push({ src: icon.src, status: res.status, type: res.headers.get('content-type') });
      }
      return results;
    `);
    const badIcons = (iconsOk ?? []).filter(
      (i) => i.status !== 200 || !/image\/png/.test(i.type ?? ''),
    );
    badIcons.length === 0
      ? pass()
      : fail(`icons missing or not PNG: ${JSON.stringify(badIcons)}`);

    // Headless Chrome never fires beforeinstallprompt, so the button would never appear on its own
    // and this whole path would go untested. Synthesising the event is the only way to see it.
    step('the Install button appears when the browser offers a prompt');
    const appeared = await waitFor('the install button', () =>
      evaluate(`
        if (!window.__fakePromptFired) {
          const e = new Event('beforeinstallprompt');
          e.prompt = () => Promise.resolve();
          e.userChoice = Promise.resolve({ outcome: 'dismissed' });
          window.__fakePrompt = e;
          window.dispatchEvent(e);
          window.__fakePromptFired = true;
        }
        const btn = document.querySelector('.install-btn');
        return btn ? btn.textContent.trim() : null;
      `),
    ).catch(() => null);
    appeared && /Install/.test(appeared)
      ? pass()
      : fail(`expected an Install button, saw ${JSON.stringify(appeared)}`);

    step(`the Install button does not break a ${PHONE_WIDTH}px screen`);
    const withButton = await evaluate(`
      const doc = document.documentElement;
      const label = document.querySelector('.install-btn-label');
      return {
        scroll: doc.scrollWidth,
        client: doc.clientWidth,
        // Below 420px the word is hidden and the arrow carries the meaning, so the top bar fits.
        labelHidden: label ? label.getBoundingClientRect().width <= 1 : null,
      };
    `);
    if (withButton.client !== PHONE_WIDTH) {
      fail(`the viewport is ${withButton.client}px, not ${PHONE_WIDTH}px`);
    } else if (withButton.scroll > withButton.client + 1) {
      fail(`the page is ${withButton.scroll}px wide in a ${withButton.client}px viewport`);
    } else if (withButton.labelHidden !== true) {
      fail('the "Install" word should collapse to just the arrow on a phone, and did not');
    } else {
      pass();
    }

    step('declining the prompt puts the button away');
    await evaluate(`document.querySelector('.install-btn').click(); return true;`);
    const buttonGone = await waitFor('the button to go', () =>
      evaluate('return document.querySelector(".install-btn") ? null : "gone"'),
    ).catch(() => null);
    buttonGone
      ? pass()
      : fail('the Install button stayed after the prompt was used — the event cannot be fired twice');

    step('an administrator can add an application');
    await evaluate(`
      [...document.querySelectorAll('.topbar nav a')].find((a) => a.textContent.includes('Admin')).click();
      return true;
    `);
    await waitFor('the admin screen', () => evaluate('return !!document.querySelector(".tabs")'));
    await waitFor('the applications tab', () =>
      evaluate('return document.body.innerText.includes("Add an application")'),
    );
    await evaluate(`
      [...document.querySelectorAll('.btn')].find((b) => b.textContent.trim() === 'Add an application').click();
      return true;
    `);
    await waitFor('the dialog', () => evaluate('return !!document.querySelector("#link-name")'));
    await evaluate(`
      ${TYPE_INTO}
      type('#link-name', 'Smoke Test App');
      type('#link-url', 'smoketest.example.com');
      document.querySelector('.modal-foot .btn-primary').click();
      return true;
    `);
    const added = await waitFor('the new row', () =>
      evaluate('return document.body.innerText.includes("Smoke Test App") ? true : null'),
    ).catch(() => null);
    added ? pass() : fail('the tile was not added');

    // normaliseUrl turned a bare host into https://, rather than refusing it.
    step('a bare host was accepted and given https://');
    const host = await evaluate(`
      const row = [...document.querySelectorAll('table.table tbody tr')]
        .find((tr) => tr.textContent.includes('Smoke Test App'));
      return row ? row.textContent.includes('smoketest.example.com') : null;
    `);
    host ? pass() : fail('the bare host was not normalised into a usable address');

    // The security rule, from the outside: a javascript: URL must not be savable.
    step('a javascript: address is refused with a sentence');
    await evaluate(`
      const row = [...document.querySelectorAll('table.table tbody tr')]
        .find((tr) => tr.textContent.includes('Smoke Test App'));
      [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Edit').click();
      return true;
    `);
    await waitFor('the dialog', () => evaluate('return !!document.querySelector("#link-url")'));
    await evaluate(`
      ${TYPE_INTO}
      type('#link-url', 'javascript:alert(1)');
      document.querySelector('.modal-foot .btn-primary').click();
      return true;
    `);
    const refused = await waitFor('the refusal', () =>
      evaluate(`
        const banner = document.querySelector('.modal-body .banner-error');
        return banner ? banner.textContent : null;
      `),
    ).catch(() => null);
    refused && /https/i.test(refused)
      ? pass()
      : fail(`expected the dialog to refuse javascript:, saw ${JSON.stringify(refused)}`);
    await evaluate(`
      [...document.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent.trim() === 'Cancel').click();
      return true;
    `);

    step('an application can be removed again');
    await waitFor('the dialog to close', () => evaluate('return !document.querySelector(".modal")'));
    await evaluate(`
      const row = [...document.querySelectorAll('table.table tbody tr')]
        .find((tr) => tr.textContent.includes('Smoke Test App'));
      [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Remove').click();
      return true;
    `);
    await waitFor('the confirmation', () =>
      evaluate('return document.body.innerText.includes("Remove it") ? true : null'),
    );
    await evaluate(`
      [...document.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent.trim() === 'Remove it').click();
      return true;
    `);
    const gone = await waitFor('the row to go', () =>
      evaluate('return !document.body.innerText.includes("Smoke Test App") ? "gone" : null'),
    ).catch(() => null);
    gone ? pass() : fail('the never-opened tile was not removed outright');

    step('the landing page is back to the seven seeded applications');
    await evaluate(`
      [...document.querySelectorAll('.topbar nav a')].find((a) => a.textContent.includes('Applications')).click();
      return true;
    `);
    const backTo = await waitFor('the tiles', () =>
      evaluate(`
        const n = document.querySelectorAll('.tile').length;
        return n > 0 ? n : null;
      `),
    );
    backTo === 7 ? pass() : fail(`expected 7 tiles again, saw ${backTo}`);

    step('nothing was logged as a console error');
    const real = consoleErrors.filter((e) => !/favicon|DevTools/i.test(e));
    real.length === 0 ? pass() : fail(real.join('\n      '));
  } catch (err) {
    fail(err.message);
  } finally {
    await cleanUp();
  }

  console.log(failures ? `\n${failures} step(s) failed.\n` : '\nAll steps passed.\n');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
