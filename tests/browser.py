from pathlib import Path
import json
import os
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
expected = json.loads((ROOT / "data/deck.json").read_text())
checks = []
errors = []


def check(value, label):
    assert value, label
    checks.append(label)


server = subprocess.Popen(
    ["node", "scripts/serve.mjs"], cwd=ROOT,
    env={**os.environ, "PORT": "0"}, stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT, text=True,
)
try:
    line = server.stdout.readline().strip()
    check(line.startswith("Flashcards: http://"), "preview server starts")
    url = line.removeprefix("Flashcards: ")
    executable = os.environ.get("BROWSER_EXECUTABLE")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True, **({"executable_path": executable} if executable else {})
        )
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("pageerror", lambda error: errors.append(str(error)))
        response = page.goto(url)
        check(response.status == 200, "HTTP entry point")
        page.wait_for_function("document.documentElement.classList.contains('deck-ready')")
        cards = page.evaluate("CARDS")
        size = len(cards)
        check(cards == expected["cards"], "every card matches source data")
        check(page.evaluate("DOMAINS") == expected["domains"], "domain metadata")
        check(not page.locator("#readingDeck").is_visible(), "fallback hidden after initialization")
        check(page.locator("#countFront").inner_text() == f"1 / {size}", "initial counter")
        check(page.locator("#prevBtn").is_disabled(), "previous disabled at start")
        page.locator("#flipBtn").click()
        check(page.evaluate("flipped && card.classList.contains('flipped')"), "flip button")
        page.locator("#card").click()
        check(page.evaluate("!flipped"), "card click")
        page.evaluate("document.body.tabIndex=-1; document.body.focus()")
        page.keyboard.press("Space")
        check(page.evaluate("flipped"), "spacebar")
        page.locator("#nextBtn").click()
        check(page.evaluate("idx===1 && !flipped"), "next resets question")
        page.locator("#prevBtn").click()
        check(page.evaluate("idx===0"), "previous")
        page.evaluate("document.body.focus()")
        page.keyboard.press("ArrowRight")
        check(page.evaluate("idx===1"), "right arrow")
        page.keyboard.press("ArrowLeft")
        check(page.evaluate("idx===0"), "left arrow")
        page.evaluate("goTo(CARDS.length-1)")
        check(page.locator("#nextBtn").is_disabled(), "next disabled at end")
        page.keyboard.press("ArrowRight")
        page.evaluate("goTo(-1); goTo(CARDS.length)")
        check(page.evaluate("idx===CARDS.length-1"), "navigation boundaries")
        page.evaluate("goTo(0); document.body.focus()")
        page.keyboard.down("Alt")
        check(page.locator("#flipLabel").inner_text() == "Random card", "Alt random label")
        page.keyboard.press("ArrowRight")
        check(page.evaluate("idx===0"), "Alt suppresses arrow navigation")
        page.evaluate("window.beforeRandom=idx")
        page.locator("#flipBtn").click()
        page.wait_for_function("!dealing && idx!==window.beforeRandom")
        check(page.locator(".dealing-card").count() == 0, "random animation cleanup")
        check(page.evaluate("!flipped && !stage.classList.contains('is-dealing')"), "random state resets")
        page.emulate_media(reduced_motion="reduce")
        page.evaluate("window.beforeRandom=idx")
        page.locator("#flipBtn").click()
        page.wait_for_function("idx!==window.beforeRandom")
        check(page.locator(".dealing-card").count() == 0, "reduced motion random")
        page.keyboard.up("Alt")
        check(page.locator("#flipLabel").inner_text() == "Flip card", "Alt release")
        page.keyboard.down("Alt")
        page.evaluate("window.dispatchEvent(new Event('blur'))")
        check(page.evaluate("!optionHeld"), "blur releases Alt")
        page.keyboard.up("Alt")
        page.keyboard.down("Alt")
        page.evaluate("""Object.defineProperty(document,'hidden',{configurable:true,value:true});
          document.dispatchEvent(new Event('visibilitychange')); delete document.hidden;""")
        check(page.evaluate("!optionHeld"), "hidden page releases Alt")
        page.keyboard.up("Alt")
        page.evaluate("""goTo(0); window.testInput=document.createElement('input');
          document.body.appendChild(window.testInput); window.testInput.focus();""")
        page.keyboard.press("ArrowRight")
        page.keyboard.press("Space")
        check(page.evaluate("idx===0 && !flipped"), "editable input keyboard guard")
        page.evaluate("window.testInput.remove()")
        failures = page.evaluate("""() => {
          const failures=[];
          CARDS.forEach((item,index)=>{
            goTo(index);
            if(questionText.textContent!==item.q || answerText.textContent!==item.a) failures.push(item.id+': text');
            if(domainTagFront.textContent!==DOMAINS[item.d].label || domainTagBack.textContent!==DOMAINS[item.d].label) failures.push(item.id+': domain');
            if(sourceTagFront.textContent!==(item.source==='yt'?'*Guide from YT course':'*Guide from docx')) failures.push(item.id+': source');
            if(examTagFront.textContent!==item.exam || examTagBack.textContent!==item.exam) failures.push(item.id+': exam');
            if(countFront.textContent!==(index+1)+' / '+CARDS.length || countBack.textContent!==countFront.textContent) failures.push(item.id+': counter');
          });
          goTo(0); return failures;
        }""")
        check(not failures, "render every card, domain, source label, exam label, and counter")
        for width, height in [(1280, 900), (390, 844), (320, 740)]:
            page.set_viewport_size({"width": width, "height": height})
            check(page.evaluate("document.documentElement.scrollWidth<=innerWidth"), f"page fits {width}px")
        mobile = browser.new_context(**p.devices["iPhone 13"])
        touch = mobile.new_page()
        touch.on("pageerror", lambda error: errors.append(str(error)))
        touch.goto(url)
        touch.wait_for_function("document.documentElement.classList.contains('deck-ready')")
        touch.locator("#card").tap()
        check(touch.evaluate("flipped"), "touch flips card")
        touch.locator("#nextBtn").tap()
        check(touch.evaluate("idx===1 && !flipped"), "touch next")
        touch.locator("#prevBtn").tap()
        check(touch.evaluate("idx===0"), "touch previous")
        touch.locator("#flipBtn").tap()
        check(touch.evaluate("flipped"), "touch flip button")
        mobile.close()
        fallback = browser.new_context(
            java_script_enabled=False, offline=True, **p.devices["iPhone 13"]
        )
        reading = fallback.new_page()
        reading.goto((ROOT / "index.html").as_uri())
        check(reading.locator(".reading-card[open]").count() == size, "all fallback answers start open")
        check(reading.locator(".reading-question").all_text_contents() == [card["q"] for card in cards], "all offline questions")
        check(reading.locator(".reading-answer p").all_text_contents() == [card["a"] for card in cards], "all offline answers")
        check(not reading.locator(".controls").is_visible(), "script controls hidden without JavaScript")
        reading.locator(".reading-card summary").first.tap()
        check(reading.locator(".reading-card[open]").count() == size-1, "native fallback toggle")
        check(reading.locator(".reading-footer em").all_text_contents() == [
            "*Guide from YT course" if card["source"] == "yt" else "*Guide from docx" for card in cards
        ], "offline source labels")
        check(reading.locator(".reading-domain").count() == len(expected["domains"]), "offline domains")
        fallback.close()
        check(not errors, "no JavaScript runtime errors")
        browser.close()
    print(json.dumps({"cards": len(expected["cards"]), "checks_passed": len(checks), "runtime_errors": errors}, indent=2))
finally:
    server.terminate()
    server.wait(timeout=5)
