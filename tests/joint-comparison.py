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
    import base64
    for bone in ["ombro_esquerdo","cotovelo_esquerdo","pulso_esquerdo"]:
        for angle in [0,30,65,90]:
            for enabled in [False,True]:
                image=page.evaluate("""([id,angle,enabled])=>{
                  const obj=app.currentCharacterObject, rig=obj.rig, bone=rig.getBone(id);
                  bone.poseAt(angle);rig.computeWorldTransforms();
                  obj.armJointPatches=enabled;
                  const c=document.createElement('canvas');c.width=c.height=128;
                  const pt=bone.getWorldPoint();
                  const identity=obj.transform.clone();identity.reset();const matrix=identity.clone().translate(64-pt.x,64-pt.y);
                  const painter=new app.partRenderer.constructor({ctx:c.getContext('2d'),viewport:matrix});
                  painter.drawParts(obj.partManager,{transform:identity,armJointPatches:enabled});
                  bone.restorePose();return c.toDataURL().split(',')[1];
                }""",[bone,angle,enabled])
                (args.capture/f"{bone}-{angle}-{int(enabled)}.png").write_bytes(base64.b64decode(image))
    assert not errors,errors
