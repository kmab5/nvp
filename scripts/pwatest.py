"""
Verifies the installable/offline layer, which unit tests can't reach — service
workers only exist in a real browser.

Checks, in order:
  1. the worker registers and precaches the whole shell
  2. with the server killed, the app still boots and plays a full CPU match
  3. losing connectivity disables online mode and says why
  4. changing a file produces a new version and the update prompt appears

Run with the dev server NOT already running — this script starts and kills it.

    python3 scripts/pwatest.py
"""

import pathlib
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "http://localhost:3000"
failures = []


def check(label, condition, detail=""):
    status = "ok  " if condition else "FAIL"
    print(f"  [{status}] {label}{f' — {detail}' if detail else ''}")
    if not condition:
        failures.append(label)


def serve():
    subprocess.run(["node", "scripts/gen-precache.mjs"], cwd=ROOT, capture_output=True)
    proc = subprocess.Popen(
        ["node", "scripts/dev-server.mjs"], cwd=ROOT,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)
    return proc


server = serve()

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        # No outbound network in CI sandboxes; the font request would just hang.
        page.route("**fonts.g*/**", lambda r: r.abort())
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        print("service worker")
        page.goto(BASE, wait_until="load")
        page.wait_for_timeout(2500)
        state = page.evaluate("""async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            const keys = await caches.keys();
            let entries = 0;
            for (const k of keys) entries += (await (await caches.open(k)).keys()).length;
            return {active: !!(reg && reg.active), controller: !!navigator.serviceWorker.controller,
                    entries};
        }""")
        check("worker is active", state["active"])
        check("page is controlled", state["controller"])
        check("shell is precached", state["entries"] > 15, f"{state['entries']} entries")
        check("no page errors", not errors, "; ".join(errors))

        print("offline play (server killed)")
        server.terminate()
        server.wait(timeout=10)
        time.sleep(1.0)

        page.reload(wait_until="load")
        page.wait_for_timeout(1200)
        check("menu boots from cache", page.locator(".keyword").count() > 0)

        page.click(".mode:has-text('Play the CPU')")
        page.wait_for_selector(".choice", timeout=6000)
        page.locator(".choice").nth(0).click()
        page.click("button:has-text('Start match')")
        page.wait_for_selector(".pad__keys", timeout=6000)
        page.keyboard.type("1234")
        page.keyboard.press("Enter")
        page.wait_for_selector(".console__grid", timeout=8000)
        page.keyboard.type("5678")
        page.keyboard.press("Enter")
        time.sleep(2.0)
        check("CPU match plays with no server", page.locator(".ledger .row").count() >= 2)

        print("connectivity awareness")
        server = serve()
        page.goto(BASE, wait_until="load")
        page.wait_for_timeout(1200)
        ctx.set_offline(True)
        page.evaluate("window.dispatchEvent(new Event('offline'))")
        page.wait_for_timeout(400)
        check("offline pill shown", page.locator(".pill--warn").count() == 1)
        check("online mode disabled", page.locator(".mode--off").count() == 1)
        ctx.set_offline(False)
        page.evaluate("window.dispatchEvent(new Event('online'))")
        page.wait_for_timeout(400)
        check("recovers when back online", page.locator(".mode--off").count() == 0)

        print("update prompt")
        css = ROOT / "styles" / "app.css"
        original = css.read_text()
        try:
            css.write_text(original + "\n/* update probe */\n")
            subprocess.run(["node", "scripts/gen-precache.mjs"], cwd=ROOT, capture_output=True)
            time.sleep(0.4)
            page.evaluate(
                "async () => { const r = await navigator.serviceWorker.getRegistration();"
                " await r.update(); }"
            )
            page.wait_for_timeout(3000)
            check("update prompt appears", page.locator(".pill--action").count() == 1)
        finally:
            css.write_text(original)
            subprocess.run(["node", "scripts/gen-precache.mjs"], cwd=ROOT, capture_output=True)

        browser.close()
finally:
    if server.poll() is None:
        server.terminate()

print()
if failures:
    print(f"{len(failures)} check(s) failed: {', '.join(failures)}")
    sys.exit(1)
print("all pwa checks passed")
