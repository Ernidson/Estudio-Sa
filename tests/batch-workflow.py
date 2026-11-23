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
    def batch():
        page.click("#generate-all")
        page.wait_for_function("!document.querySelector('#generate-all').disabled")
    batch()
    count = page.evaluate("app.partManager.parts.size")
    assert count==15, page.locator("#batch-report").inner_text()
    ids = page.evaluate("app.partManager.getAllParts().map(p=>p.id)")
    batch()
    assert ids == page.evaluate("app.partManager.getAllParts().map(p=>p.id)")
    page.click("#undo-batch")
    assert page.evaluate("app.partManager.parts.size")==0
    batch()
    assert page.evaluate("""app.partManager.getAllParts().every(p=>p.imageElement.complete &&
      p.mask.type==='raster' && p.boneId===app.pieceMap.getRegion(p.regionId).boneId)""")
    assert page.evaluate("""()=> {
      const o=app.currentCharacterObject, c=document.createElement('canvas');
      c.width=o.imageWidth;c.height=o.imageHeight;
      const ctx=c.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(o.imageElement,0,0);
      const source=ctx.getImageData(0,0,c.width,c.height).data;
      const used=new Uint8Array(c.width*c.height);
      for(const p of o.partManager.getAllParts()){
        ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(p.imageElement,0,0);
        const data=ctx.getImageData(0,0,p.imageWidth,p.imageHeight).data;
        for(let k=0;k<data.length;k+=4){
          if(!data[k+3])continue;
          const x=(k/4)%p.imageWidth+p.mask.bounds.x-2;
          const y=Math.floor(k/4/p.imageWidth)+p.mask.bounds.y-2;
          const i=y*c.width+x;
          if(used[i]++ || data[k+3]!==source[i*4+3])return false;
          if(data[k+3]===255 && [0,1,2].some(j=>data[k+j]!==source[i*4+j]))return false;
        }
      }
      return true;
    }""")
    page.click("#btn-exit-piece-map")
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
    assert page.evaluate("app.isEditPartsMode && app.partManager===app.scene.objects[0].partManager")
    assert not errors,errors
    print("15 regiões, repetição, desfazer e reabertura direta passaram.")
