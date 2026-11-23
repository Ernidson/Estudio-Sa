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
    panel=page.locator("#animation-editor")
    panel.locator(":scope > summary").click()
    panel.locator('[value="pullup"]').click()
    def number(n,v):
        field=panel.locator('[name="'+n+'"]');field.fill(str(v));field.press("Tab")
    number('height',310)
    number('duration',6)
    assert page.evaluate("app.currentCharacterObject.animation.keys.at(-1).time")==6
    number('duration',5)
    number('rate',1.25)
    number('rate',1)
    with page.expect_download() as d:page.click("#btn-save-project")
    project=args.capture/"Treinador-barra-fixa.rigbystudio"
    d.value.save_as(project)
    with page.expect_file_chooser() as chooser:page.click("#btn-open-project")
    chooser.value.set_files(project)
    page.wait_for_function("app.isEditPartsMode && app.currentCharacterObject.animation.exercise==='pullup'")
    for i,t in enumerate([0,1.25,2.5,3.75,5,3]):
        page.evaluate("""t=>{const cur=document.querySelector('#animation-editor [name=cursor]');
          cur.value=t;cur.dispatchEvent(new Event('input'));}""",t)
        page.wait_for_timeout(120)
        page.locator('#main-canvas').screenshot(path=args.capture/f"fase-{[0,25,50,75,100,'topo'][i]}.png")
    panel.locator('[value="start"]').click()
    assert not errors,errors
