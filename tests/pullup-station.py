"""Run after npm run build. Requires Python Playwright and a project with all trainer pieces."""
import argparse
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("project", type=Path)
parser.add_argument("--chromium")
parser.add_argument("--capture", type=Path, required=True)
parser.add_argument("--bar",type=Path,required=True)
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
    panel=page.locator("#pullup-station")
    panel.locator("summary").click()
    panel.locator('[name="structure"]').set_input_files(args.bar)
    page.wait_for_function("app.currentCharacterObject.pullup")
    assert page.evaluate("app.scene.objects[0].locked && app.scene.objects[0].id===app.currentCharacterObject.pullup.barId")
    panel.locator('[name="locked"]').uncheck()
    field=panel.locator('[name="barX"]')
    x=field.input_value();field.fill("24");field.press("Tab")
    assert page.evaluate("app.scene.objects[0].transform.m[4]")==24
    field.fill(x);field.press("Tab")
    panel.locator('[name="locked"]').check()
    page.screenshot(path=args.capture/"station.png")
    with page.expect_download() as d:
        page.click("#btn-save-project")
    d.value.save_as(args.capture/"station.rigbystudio")
    assert not errors,errors
