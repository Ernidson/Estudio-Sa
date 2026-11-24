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
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
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
    page.evaluate("""()=>{const o=app.currentCharacterObject;o.pullup.correct=false;o.armJointPatches=false;
      app.renderer.fitToObjects(app.scene.getVisibleObjects());}""")
    stats=[]
    for rise in [0,80,160,240,310]:
        for enabled in [False,True]:
            page.evaluate("""([rise,enabled])=>{const o=app.currentCharacterObject;
              o.pullup.localMesh=enabled; const root=o.rig.getRoot();
              root.setLocalPosition(root.localPosition.x,o.pullup.restY-rise);}""",[rise,enabled])
            page.wait_for_timeout(100)
            page.locator('#main-canvas').screenshot(path=str(args.capture/f'mesh-{rise}-{int(enabled)}.png'))
            stats.append(page.evaluate('app.partRenderer.meshStats'))
    from PIL import Image,ImageChops
    first=[Image.open(args.capture/f'mesh-0-{i}.png').convert('RGB') for i in [0,1]]
    assert ImageChops.difference(*first).getbbox() is None,'rest pose changed'
    assert all(s['folds']==0 for s in stats),stats
    # Dense sweep catches folds between the five screenshot poses.
    sweep=page.evaluate("""async()=>{
      const o=app.currentCharacterObject;let folds=0;
      for(let i=0;i<=100;i++) {
        o.rig.getRoot().setLocalPosition(o.rig.getRoot().localPosition.x,o.pullup.restY-310*i/100);
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        folds+=app.partRenderer.meshStats.folds;
      }
      const p=o.partManager.getAllParts().find(p=>p.boneId==='cotovelo_esquerdo');
      p.localPosition.x+=5;p.updateLocalTransform();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return {folds,skipped:app.partRenderer.meshStats.skippedEdits};
    }""")
    assert sweep['folds']==0 and sweep['skipped']>0,sweep
    print(stats,sweep)
    with page.expect_download() as download:
        page.click('#btn-save-project')
    saved=Path(tmp)/'mesh-project.rigbystudio';download.value.save_as(saved)
    with page.expect_file_chooser() as chooser:
        page.click('#btn-open-project')
    chooser.value.set_files(saved)
    page.wait_for_function('app.isEditPartsMode && app.currentCharacterObject?.pullup?.localMesh')
    assert not errors,errors
