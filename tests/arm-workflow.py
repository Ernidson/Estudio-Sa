"""Run after npm run build. Requires Python Playwright and the original trainer PNG."""
import argparse
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("png", type=Path)
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
        page.click("#btn-import-png")
    chooser.value.set_files(args.png)
    page.wait_for_function("app.selectionManager.getSelectedObject()?.imageElement")
    page.click("#btn-prepare-character")
    page.wait_for_selector("#btn-calibrate-armor")
    assert page.evaluate("app.currentCharacterObject.rig.getAllBones().length") == 17
    page.click("#btn-calibrate-armor")

    page.click("#calib-tool-recognize")
    page.click("#btn-start-recognition")
    page.wait_for_function("app.recognitionResult",timeout=120000)
    page.click("#btn-apply-recognition")
    page.click("#btn-exit-calibration")
    page.click("#btn-piece-map")
    ids=["ombro_esquerdo","cotovelo_esquerdo","pulso_esquerdo"]
    for i,region in enumerate([*ids[:2],"mao_esquerda"]):
        if i:
            page.click("#btn-piece-map")
        page.locator(f'.region-list-item[data-region-id="{region}"]').click(position={"x":12,"y":12})
        page.click("#btn-generate-piece")
        page.wait_for_function("n=>app.partManager.parts.size===n",arg=i+1)
    page.click("#btn-edit-parts")
    parts=page.evaluate("app.partManager.getAllParts().map(p=>[p.id,p.boneId,app.partManager.rig.getBone(p.boneId).parentId])")
    print(parts,flush=True)
    assert [p[1] for p in parts]==ids
    assert [p[2] for p in parts]==["peito",*ids[:2]]
    def select(i):
        page.locator(f'.part-list-item[data-part-id="{parts[i][0]}"]').click(position={"x":12,"y":12})
    select(0)
    for w,h in [(1366,768),(1680,930),(1920,1080)]:
        page.set_viewport_size({"width":w,"height":h})
        page.wait_for_timeout(100)
        canvas=page.locator("#main-canvas").bounding_box()
        select(1)
        assert canvas==page.locator("#main-canvas").bounding_box()
        assert page.evaluate("""()=>[...document.querySelectorAll('#edit-parts-toolbar .toolbar-group > *')].every(e=>{
        const r=e.getBoundingClientRect();return r.width>0 && e.scrollWidth<=e.clientWidth+1 && e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})"""), (w,h)
        assert "Nenhuma" not in page.locator("#edit-parts-status").inner_text()
        page.screenshot(path=args.capture/f"editor-{w}.png")
    page.locator("#part-prop-x").fill("12")
    page.locator("#part-prop-x").press("Tab")
    page.locator("#part-prop-rotation").fill("23")
    page.locator("#part-prop-scale-x").fill("1.4")
    page.locator("#part-prop-scale-x").press("Tab")
    corner="""()=>{const p=app.partManager.getSelectedPart();return p.localTransform.transformPoint(-p.pivot.x*p.imageWidth,-p.pivot.y*p.imageHeight)}"""
    before=page.evaluate(corner)
    page.get_by_text("Pivô na articulação",exact=True).click()
    after=page.evaluate(corner)
    assert max(abs(before[k]-after[k]) for k in before)<.0001
    assert page.evaluate("app.partManager.getSelectedPart().localPosition")=={"x":0,"y":0}
    page.select_option("#edit-target","joint")
    def matrices():
        return page.evaluate("app.partManager.getAllParts().map(p=>Array.from(app.partManager.rig.getBone(p.boneId).worldTransform.clone().multiply(p.localTransform).m))")
    for i in range(3):
        select(i)
        before=matrices()
        page.locator("#joint-angle").fill("35")
        page.wait_for_timeout(100)
        after=matrices()
        assert [a!=b for a,b in zip(before,after)]==[j>=i for j in range(3)]
        page.click("#reset-chain")
        page.wait_for_timeout(100)
        assert max(abs(a-b) for m,n in zip(before,matrices()) for a,b in zip(m,n))<.001
    page.locator("#joint-angle").fill("17")
    with page.expect_download() as download:
        page.click("#btn-save-project")
    exported=Path(tmp)/"treinador.rigbystudio"
    download.value.save_as(exported)
    before=page.evaluate("app.scene.objects[0].toJSON()")
    with page.expect_file_chooser() as chooser:
        page.click("#btn-open-project")
    chooser.value.set_files(exported)
    page.wait_for_function("document.body.innerText.includes('Projeto aberto:')")
    assert before==page.evaluate("app.scene.objects[0].toJSON()")
    assert page.evaluate("app.scene.objects[0].partManager.getAllParts().every(p=>p.imageElement.complete)")
    restored = page.evaluate("""()=> {
      const obj=app.scene.objects[0], bone=obj.rig.getBone('pulso_esquerdo');
      const posed=bone.getLocalRotation();
      bone.restorePose();
      obj.rig.computeWorldTransforms();
      return [posed,bone.getLocalRotation()];
    }""")
    assert abs(restored[0]-17)<.001 and abs(restored[1])<.001
    assert not errors, errors
    print("Fluxo completo, sem erros de página ou pedidos externos.")
    browser.close()
