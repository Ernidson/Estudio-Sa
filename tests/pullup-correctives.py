"""Run after npm run build. Requires Python Playwright and a project with all trainer pieces."""
import argparse
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("project", type=Path)
parser.add_argument("--chromium")
parser.add_argument("--capture", type=Path, required=True)
args = parser.parse_args()
args.capture.mkdir(parents=True, exist_ok=True)
errors = []

with sync_playwright() as pw, TemporaryDirectory() as tmp:
    browser = pw.chromium.launch(executable_path=args.chromium,
        args=["--no-sandbox", "--no-zygote", "--single-process", "--disable-gpu"])
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.set_default_timeout(9000)
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.on("dialog", lambda d: d.accept())
    page.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker")
    # Serve the actual production assets in-process, without a second HTTP server.
    def serve(route):
        url = route.request.url
        base = "http://rigby.test/"
        if not url.startswith(base):
            errors.append("External request " + url)
            return route.abort()
        route.fulfill(path=Path("dist") / (url[len(base):] or "index.html"))
    page.route("**/*", serve)
    page.goto("http://rigby.test/")
    page.wait_for_function("window.app?.renderer")
    with page.expect_file_chooser() as chooser:
        page.click("#btn-open-project")
    chooser.value.set_files(args.project)
    page.wait_for_function("app.isEditPartsMode")
    for h in [0,90,180,280]:
        for flag in [0,1]:
            page.evaluate("""([h,on])=>{const o=app.currentCharacterObject,b=o.rig.getRoot();
                b.setLocalPosition(b.localPosition.x,o.pullup.restY-h);o.pullup.correct=!!on;}""",[h,flag])
            page.wait_for_timeout(160)
            page.locator('#main-canvas').screenshot(path=args.capture/f"compare-{h}-{flag}.png")
    page.evaluate("()=>{const o=app.currentCharacterObject,b=o.rig.getRoot();b.setLocalPosition(b.localPosition.x,o.pullup.restY)}")
    page.wait_for_timeout(100)
    from PIL import Image,ImageChops
    for h in [0,90,180,280]:
        a,b=[Image.open(args.capture/f"compare-{h}-{i}.png").convert('RGB') for i in [0,1]]
        bounds=ImageChops.difference(a,b).getbbox()
        assert (bounds is None)==(h==0),(h,bounds)
    assert not errors, errors
