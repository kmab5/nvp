"""Click through every mode in a real browser and screenshot each state."""
import sys, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = "/home/claude/shots"
errors = []

def prep(page, tag):
    # No outbound network in this sandbox: block the Google Fonts request so
    # pages settle. Layout still gets checked; the fallback stack keeps the
    # sans/mono distinction.
    page.route("**fonts.googleapis.com/**", lambda r: r.abort())
    page.route("**fonts.gstatic.com/**", lambda r: r.abort())
    watch(page, tag)


def watch(page, tag):
    page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"[{tag}] console.{m.type}: {m.text}")
            if m.type == "error" else None)

def shot(page, name):
    page.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)

def type_code(page, code):
    for ch in code:
        page.click(f".pad__keys .key:has-text('{ch}')")

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------------- menu + rules ----------------
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    prep(page, "menu")
    page.goto(BASE, wait_until="load")
    page.wait_for_selector(".keyword")
    shot(page, "01-menu")
    page.click("button:has-text('How to play')")
    page.wait_for_selector(".worked")
    shot(page, "02-rules")
    page.click("button:has-text('Back to the menu')")

    # ---------------- vs CPU ----------------
    page.click(".mode:has-text('Play the CPU')")
    page.wait_for_selector(".choice")
    page.locator(".choice").nth(2).click()  # Ace ("Racer" also contains "ace")
    shot(page, "03-cpu-setup")
    page.click("button:has-text('Start match')")
    page.wait_for_selector(".pad__keys")
    type_code(page, "1234")
    shot(page, "04-secret-entry")
    page.click("button:has-text('Lock it in')")
    page.wait_for_selector(".console__grid", timeout=5000)
    shot(page, "05-cpu-play")

    # play a few rounds — the CPU can end it early, so don't insist on a full three
    for guess in ["5678", "9512", "3467"]:
        if page.locator(".overlay__card").count():
            break
        try:
            page.wait_for_selector(".console--live .pad__keys .key:not([disabled])", timeout=8000)
        except Exception:
            break
        type_code(page, guess)
        page.click("button:has-text('Submit guess')")
        time.sleep(1.6)
    shot(page, "06-cpu-midgame")

    # notes pad (only present while a turn is live)
    if page.locator(".notes").count():
        page.click(".notes .pip-btn:has-text('7')")
        page.click(".notes .pip-btn:has-text('7')")
        page.click(".notes .pip-btn:has-text('3')")
        shot(page, "07-notes")

    # force an end: walk distinct valid codes until somebody cracks one
    import itertools
    codes = ["".join(c) for c in itertools.permutations("123456789", 4)]
    for code in codes[7::113][:30]:
        if page.locator(".overlay__card").count():
            break
        try:
            page.wait_for_selector(".console--live .pad__keys .key:not([disabled])", timeout=6000)
        except Exception:
            break
        page.keyboard.type(code)
        page.keyboard.press("Enter")
        time.sleep(1.4)
    page.wait_for_selector(".overlay__card", timeout=15000)
    shot(page, "08-cpu-result")
    print("cpu result:", page.locator(".overlay__title").inner_text())

    page.click(".overlay__actions button:has-text('Main menu')")
    page.wait_for_selector(".keyword")

    # ---------------- pass and play ----------------
    page.click(".mode:has-text('Pass and play')")
    page.wait_for_selector(".roster")
    page.fill(".roster input >> nth=0", "Sami")
    page.fill(".roster input >> nth=1", "Nardos")
    page.click("button:has-text('Start match')")
    page.wait_for_selector(".pad__keys")
    type_code(page, "1357")
    shot(page, "09-local-masked")
    page.click("button:has-text('Lock it in')")
    page.wait_for_selector(".overlay__card", timeout=4000)
    shot(page, "10-handoff")
    page.click(".overlay__card button")
    page.wait_for_selector(".pad__keys")
    type_code(page, "2468")
    page.click("button:has-text('Lock it in')")
    page.wait_for_selector(".overlay__card", timeout=4000)
    page.click(".overlay__card button")  # hand back to Sami
    page.wait_for_selector(".console--live", timeout=4000)
    shot(page, "11-local-play")
    type_code(page, "2468")
    page.click("button:has-text('Submit guess')")
    page.wait_for_selector(".overlay__card", timeout=4000)
    shot(page, "12-local-handoff-turn")
    page.click(".overlay__card button")
    page.wait_for_selector(".console--live", timeout=4000)
    type_code(page, "1357")
    page.click("button:has-text('Submit guess')")
    page.wait_for_selector(".overlay__title", timeout=4000)
    shot(page, "13-local-result")
    print("local result:", page.locator(".overlay__title").inner_text())
    page.click(".overlay__actions button:has-text('Main menu')")

    # ---------------- mobile menu ----------------
    mob = browser.new_page(viewport={"width": 390, "height": 844})
    prep(mob, "mobile")
    mob.goto(BASE, wait_until="load")
    mob.wait_for_selector(".keyword")
    shot(mob, "14-mobile-menu")

    # mobile play surface
    mob.click(".mode:has-text('Play the CPU')")
    mob.wait_for_selector(".choice")
    mob.click("button:has-text('Start match')")
    mob.wait_for_selector(".pad__keys")
    mob.keyboard.type("1234")
    mob.keyboard.press("Enter")
    mob.wait_for_selector(".console__grid", timeout=6000)
    mob.keyboard.type("5678")
    mob.keyboard.press("Enter")
    time.sleep(1.8)
    shot(mob, "14b-mobile-play")

    # ---------------- online, two browsers ----------------
    host = browser.new_page(viewport={"width": 1100, "height": 900})
    prep(host, "host")
    host.goto(BASE, wait_until="load")
    host.click(".mode:has-text('Play online')")
    host.wait_for_selector("input[placeholder='Player 1']")
    host.fill("input[placeholder='Player 1']", "Sami")
    shot(host, "15-online-lobby")
    host.click("button:has-text('Open a new room')")
    host.wait_for_selector(".roomcode__value", timeout=8000)
    room = host.locator(".roomcode__value").inner_text().strip()
    print("room:", room)
    shot(host, "16-online-waiting")

    guest = browser.new_context().new_page()
    guest.set_viewport_size({"width": 1100, "height": 900})
    prep(guest, "guest")
    guest.goto(f"{BASE}/?room={room}", wait_until="load")
    guest.wait_for_selector("input[placeholder='Player 1']")
    guest.fill("input[placeholder='Player 1']", "Nardos")
    guest.click(".joinrow button:has-text('Join')")

    host.wait_for_selector(".pad__keys", timeout=10000)
    guest.wait_for_selector(".pad__keys", timeout=10000)
    for pg, code in ((host, "1234"), (guest, "9876")):
        for ch in code:
            pg.click(f".pad__keys .key:has-text('{ch}')")
        pg.click("button:has-text('Lock it in')")

    host.wait_for_selector(".console--live", timeout=12000)
    shot(host, "17-online-host-turn")
    shot(guest, "18-online-guest-waiting")

    type_code(host, "9876")           # host cracks immediately
    host.click("button:has-text('Submit guess')")
    guest.wait_for_selector(".console--live", timeout=12000)
    type_code(guest, "1111".replace("1111", "1592"))
    guest.click("button:has-text('Submit guess')")
    host.wait_for_selector(".overlay__title", timeout=12000)
    shot(host, "19-online-result-host")
    guest.wait_for_selector(".overlay__title", timeout=12000)
    shot(guest, "20-online-result-guest")
    print("online host:", host.locator(".overlay__title").inner_text())
    print("online guest:", guest.locator(".overlay__title").inner_text())

    # rematch handshake
    host.locator(".overlay__actions button:has-text('Rematch')").click()
    time.sleep(1.0)
    shot(host, "21-online-rematch-pending")
    guest.locator(".overlay__actions button:has-text('Accept rematch')").click()
    host.wait_for_selector(".pad__keys", timeout=12000)
    guest.wait_for_selector(".pad__keys", timeout=12000)
    shot(host, "22-online-rematch-fresh")
    print("rematch ok")

    browser.close()

print("\n--- console/page errors ---")
for e in errors:
    print(e)
print("none" if not errors else f"{len(errors)} issue(s)")
