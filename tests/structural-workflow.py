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
    page.evaluate("window.character=app.currentCharacterObject")
    for width,height in [(1366,768),(1680,930),(1920,1080)]:
        page.set_viewport_size({"width":width,"height":height})
        for mode in ['prepare','calibrate','map','edit','animation']:
            page.click(f'#mode-navigation [data-mode="{mode}"]')
            page.wait_for_timeout(120)
            r=page.evaluate("""() => {
              const o=window.character;
              const modes=[app.isRiggingMode,app.isCalibrationMode,app.isPieceMapMode,app.isEditPartsMode].filter(Boolean).length;
              const nav=[...document.querySelectorAll('#mode-navigation button')].map(b=>{
                const r=b.getBoundingClientRect();return r.width>0&&r.right<=innerWidth&&r.bottom<innerHeight;
              });
              return {modes,nav,parts:o.partManager.getAllParts().length,bones:o.rig.getAllBones().length};
            }""")
            assert r['modes']==1 and all(r['nav']) and r['parts']==15 and r['bones']==17,r
        page.evaluate("app.renderer.fitToObjects(app.scene.getVisibleObjects())")
        page.screenshot(path=str(args.capture/f'modes-{width}.png'))
    page.locator('#pullup-station > summary').click()
    page.locator('[name="diagnostic"]').check()
    sample=page.evaluate("""async () => {
      const o=window.character,root=o.rig.getRoot(),rest=root.localPosition.y;
      const bar=app.scene.objects.find(b=>b.id===o.pullup.barId);
      const samples=[];
      for(const mode of ['prepare','map','edit']) {
        document.querySelector(`#mode-navigation [data-mode="${mode}"]`).click();
        for(const rise of [0,50,150,280,150,0]) {
          root.setLocalPosition(root.localPosition.x,rest-rise);
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          for(const [i,side] of ['esquerdo','direito'].entries()) {
            const hand=o.partManager.getAllParts().find(p=>p.boneId==='pulso_'+side);
            const wrist=o.rig.getBone(hand.boneId),uv=o.pullup.contacts[i].uv??{x:.5,y:.45};
            const actual=o.transform.clone().multiply(wrist.worldTransform).multiply(hand.localTransform)
              .transformPoint((uv.x-hand.pivot.x)*hand.imageWidth,(uv.y-hand.pivot.y)*hand.imageHeight);
            const g=o.pullup.grips[i],target=bar.transform.transformPoint(g.x,g.y);
            samples.push(Math.hypot(actual.x-target.x,actual.y-target.y));
          }
        }
      }
      return Math.max(...samples);
    }""")
    assert sample<.01,sample
    # A user-selected texel must replace the historical hard-coded point.
    page.locator('#pullup-station').evaluate('(p)=>p.open=true')
    page.locator('[name="hand-preview"]').click(position={"x":120,"y":63})
    uv=page.evaluate('character.pullup.contacts[0].uv')
    assert uv and 0<=uv['x']<=1 and 0<=uv['y']<=1
    page.screenshot(path=str(args.capture/'diagnostic.png'))
    with page.expect_download() as download:
        page.click('#btn-save-project')
    saved=Path(tmp)/'roundtrip.rigbystudio'
    download.value.save_as(saved)
    with page.expect_file_chooser() as chooser:
        page.click('#btn-open-project')
    chooser.value.set_files(saved)
    page.wait_for_function('app.isEditPartsMode && app.currentCharacterObject?.pullup?.contacts[0].uv')
    assert page.evaluate('app.currentCharacterObject.pullup.contacts[0].uv')==uv
    assert not errors,errors
    print({'contact_drift_all_modes':sample,'viewports':3,'transitions':15,'roundtrip':'passed','errors':errors})
