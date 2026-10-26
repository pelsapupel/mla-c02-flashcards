from pathlib import Path
import json
import os
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ENGINE = os.environ.get("BROWSER_ENGINE", "chromium")
checks = []
errors = []


def check(condition, label):
    assert condition, label
    checks.append(label)


server = subprocess.Popen(
    ["node", "scripts/serve.mjs"], cwd=ROOT, env={**os.environ, "PORT": "0"},
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
)
try:
    url = server.stdout.readline().strip().removeprefix("Flashcards: ")
    with sync_playwright() as p:
        executable = os.environ.get("BROWSER_EXECUTABLE")
        browser = getattr(p, ENGINE).launch(
            headless=True, **({"executable_path": executable} if executable else {})
        )
        desktop = browser.new_page(viewport={"width": 390, "height": 844})
        desktop.goto(url)
        desktop.wait_for_function("document.documentElement.classList.contains('deck-ready')")
        check(desktop.evaluate("!phoneMode"), "narrow PC keeps desktop mode")
        check(desktop.locator(".controls").is_visible(), "PC buttons remain available")
        desktop.close()

        context = browser.new_context(**p.devices["iPhone 13"])
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url)
        page.wait_for_function("phoneMode && document.documentElement.classList.contains('deck-ready')")
        page.emulate_media(reduced_motion="reduce")
        check(not page.locator(".controls").is_visible(), "phone replaces buttons with gestures")
        check("two fingers up" in page.locator("#deckHint").inner_text(), "phone gesture instructions")
        cdp = context.new_cdp_session(page) if ENGINE == "chromium" else None

        def dispatch(kind, active, changed):
            return page.evaluate("""({kind,active,changed}) => {
              const event=new Event(kind,{bubbles:true,cancelable:true});
              const points=list=>list.map(point=>({
                identifier:point.id,clientX:point.x,clientY:point.y,
              }));
              Object.defineProperties(event,{
                touches:{value:points(active)}, changedTouches:{value:points(changed)},
              });
              return !document.getElementById('card').dispatchEvent(event);
            }""", {"kind": kind, "active": active, "changed": changed})

        def points_at(dx=0, dy=0, fingers=1):
            box = page.locator("#card").bounding_box()
            return [
                {"id": i + 1, "x": box["x"] + box["width"] / 2 + (i - (fingers - 1) / 2) * 60 + dx,
                 "y": box["y"] + box["height"] * 0.65 + dy}
                for i in range(fingers)
            ]

        def swipe(dx, dy, fingers=1, native=True):
            start = points_at(fingers=fingers)
            if cdp and native:
                cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": start})
                for step in range(1, 7):
                    moved = [
                        {**point, "x": point["x"] + dx * step / 6, "y": point["y"] + dy * step / 6}
                        for point in start
                    ]
                    cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": moved})
                cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            else:
                dispatch("touchstart", start, start)
                for step in range(1, 7):
                    moved = [
                        {**point, "x": point["x"] + dx * step / 6, "y": point["y"] + dy * step / 6}
                        for point in start
                    ]
                    dispatch("touchmove", moved, moved)
                dispatch("touchend", [], moved)

        swipe(-100, 0)
        check(page.evaluate("idx===1 && !flipped"), "left swipe advances one card")
        swipe(100, 0)
        check(page.evaluate("idx===0"), "right swipe returns one card")
        swipe(0, -100)
        check(page.evaluate("flipped"), "up swipe reveals answer")
        swipe(0, -100)
        check(page.evaluate("!flipped"), "up swipe closes answer")
        page.evaluate("goTo(1); setFlipped(true)")
        swipe(-100, 0)
        check(page.evaluate("idx===2 && !flipped"), "swipe navigation resets answer")
        page.evaluate("goTo(0)")
        swipe(100, 0)
        check(page.evaluate("idx===0"), "previous boundary")
        page.evaluate("goTo(CARDS.length-1)")
        swipe(-100, 0)
        check(page.evaluate("idx===CARDS.length-1"), "next boundary")

        page.evaluate("goTo(0); window.originalRandom=Math.random; Math.random=()=>0")
        swipe(0, -100, fingers=2)
        page.wait_for_function("!dealing")
        check(page.evaluate("idx===1 && !flipped && !optionHeld"), "two fingers up deals random without Alt")
        page.evaluate("goTo(0)")
        start = points_at(fingers=2)
        end = [{**point, "y": point["y"] - 100} for point in start]
        dispatch("touchstart", start, start)
        dispatch("touchmove", end, end)
        dispatch("touchend", [end[1]], [end[0]])
        check(page.evaluate("idx===0 && !flipped"), "first finger release does not act early")
        dispatch("touchend", [], [end[1]])
        check(page.evaluate("idx===1 && !flipped"), "last finger release deals once")

        page.evaluate("goTo(0)")
        for dx, dy, fingers, label in [
            (0, 100, 1, "downward swipe"),
            (-100, -100, 1, "ambiguous diagonal"),
            (15, 0, 1, "short movement"),
            (-100, 0, 2, "two-finger horizontal movement"),
            (0, -100, 3, "three-finger gesture"),
        ]:
            swipe(dx, dy, fingers, native=False)
            check(page.evaluate("idx===0 && !flipped"), label + " does not trigger an action")
        start = points_at(fingers=2)
        end = [{**start[0], "y": start[0]["y"] - 100}, {**start[1], "y": start[1]["y"] + 100}]
        dispatch("touchstart", start, start)
        dispatch("touchmove", end, end)
        dispatch("touchend", [], end)
        check(page.evaluate("idx===0 && !flipped"), "opposing fingers do not trigger random")

        start = points_at()
        end = [{**start[0], "y": start[0]["y"] - 100}]
        dispatch("touchstart", start, start)
        dispatch("touchmove", end, end)
        dispatch("touchcancel", [], end)
        check(page.evaluate("idx===0 && !flipped && gesture===null"), "cancelled gesture is discarded")
        swipe(-100, 0)
        check(page.evaluate("idx===1"), "gesture after cancellation works")

        page.evaluate("goTo(0)")
        page.emulate_media(reduced_motion="no-preference")
        swipe(0, -100, fingers=2, native=False)
        check(page.evaluate("dealing"), "random uses existing deal animation")
        swipe(-100, 0, native=False)
        page.wait_for_function("!dealing")
        check(page.evaluate("idx===1 && !flipped"), "gestures during dealing do not queue navigation")
        check(page.locator(".dealing-card").count() == 0, "phone deal animation cleans up")
        page.emulate_media(reduced_motion="reduce")

        page.evaluate("goTo(0)")
        check(dispatch("touchstart", points_at(), points_at()), "phone touch start prevents browser defaults")
        check(dispatch("touchend", [], points_at()), "phone touch end prevents browser defaults")
        page.evaluate("setFlipped(false)")
        page.touchscreen.tap(195, 400)
        page.touchscreen.tap(195, 400)
        check(page.evaluate("visualViewport.scale===1"), "double tap does not zoom")
        check(page.evaluate("getComputedStyle(document.body).touchAction==='none'"), "phone touch action disables browser gestures")
        if ENGINE == "chromium":
            page.mouse.wheel(0, 500)
        page.evaluate("window.scrollTo(0,500)")
        check(page.evaluate("scrollX===0 && scrollY===0"), "phone page cannot scroll")

        for width, height in [(390, 844), (320, 568), (844, 390), (568, 320)]:
            page.set_viewport_size({"width": width, "height": height})
            page.evaluate("new Promise(requestAnimationFrame)")
            check(page.evaluate("document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight"),
                  f"phone viewport fits {width}x{height}")
            failures = page.evaluate("""() => {
              const failures=[];
              card.style.transition='none';
              CARDS.forEach((item,index)=>{
                goTo(index);
                for(const paragraph of [questionText,answerText]){
                  const body=paragraph.parentElement,style=getComputedStyle(body);
                  const height=body.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
                  if(paragraph.scrollHeight>height+1) failures.push(item.id);
                }
              });
              goTo(0); card.style.transition=''; return [...new Set(failures)];
            }""")
            check(not failures, f"all phone card text fits {width}x{height}: {failures[:5]}")
        check(not errors, "no phone JavaScript errors")
        context.close()
        browser.close()
    print(json.dumps({"engine": ENGINE, "checks_passed": len(checks), "runtime_errors": errors}, indent=2))
finally:
    server.terminate()
    server.wait(timeout=5)
