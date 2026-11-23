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
    def action(name):
        panel.locator(f'button[value="{name}"]').click()
    def angle():
        return page.evaluate("app.currentCharacterObject.rig.getBone('cotovelo_esquerdo').getLocalRotation()")
    panel.get_by_text("Transformação do osso",exact=True).click()
    panel.locator('[name="bone"]').select_option("cotovelo_esquerdo")
    for channel,desired in [('x',-36),('scaleX',1.15)]:
        f=panel.locator(f'[name="{channel}"]')
        original=f.input_value()
        f.fill(str(desired));f.press("Tab")
        value=page.evaluate("""key=>{const m=app.currentCharacterObject.rig.getBone('cotovelo_esquerdo').localTransform.m;
          return key==='x'?m[4]:Math.hypot(m[0],m[1])}""",channel)
        assert abs(value-desired)<.0001
        f.fill(original);f.press("Tab")
    panel.get_by_text("Transformação do osso",exact=True).click()
    base=angle()
    action("demo")
    data=page.evaluate("app.currentCharacterObject.animation")
    assert [k['time'] for k in data['keys']]==[0,1,2,3]
    for t,value in [(1,30),(2,65),(3,0)]:
        panel.locator('[name="keys"]').select_option(str(t))
        assert abs(angle()-base-value)<.001
    action("start")
    page.evaluate("""()=>{window.frameGaps=[];let last=performance.now();function frame(t){
        if(t>last) frameGaps.push(t-last);last=t;if(frameGaps.length<400)requestAnimationFrame(frame);
    }requestAnimationFrame(frame)}""")
    panel.locator('[name="loop"]').check()
    action("play")
    page.wait_for_timeout(3400)
    action("pause")
    assert 0<angle()-base<30
    panel.locator('[name="loop"]').uncheck()
    action("stop")
    assert angle()==base
    panel.locator('[name="fps"]').select_option("24")
    action("play")
    page.wait_for_function("""document.querySelector('#animation-editor output').textContent==='3.00 s'""")
    assert angle()==base
    assert page.evaluate("""()=>{const o=app.currentCharacterObject,p=o.animation.keys[0].pose;
      return o.rig.getAllBones().every(b=>b.localTransform.m.every((v,i)=>v===p.bones[b.id][i])) &&
        o.partManager.getAllParts().every(b=>[b.localPosition.x,b.localPosition.y,b.localRotation,b.localScale.x,b.localScale.y,b.pivot.x,b.pivot.y]
            .every((v,i)=>v===p.pieces[b.id][i]));}""")
    gaps=page.evaluate("frameGaps")
    print("Callback FPS",round(1000*len(gaps)/sum(gaps),1),"samples",len(gaps),flush=True)
    panel.locator('[name="keys"]').select_option("1")
    action("copy")
    panel.locator('[name="keys"]').select_option("2")
    action("paste")
    assert abs(angle()-base-30)<.001
    action("add")
    action("remove")
    assert len(page.evaluate("app.currentCharacterObject.animation.keys"))==3
    action("reset")
    action("demo")
    page.screenshot(path=args.capture/"timeline.png")
    demo_base=angle()
    expected=page.evaluate("app.currentCharacterObject.animation")
    with page.expect_download() as download:
        page.click("#btn-save-project")
    exported=Path(tmp)/"animation.rigbystudio"
    download.value.save_as(exported)
    with page.expect_file_chooser() as chooser:
        page.click("#btn-open-project")
    chooser.value.set_files(exported)
    page.wait_for_function("document.body.innerText.includes('Projeto aberto:')")
    assert expected==page.evaluate("app.currentCharacterObject.animation")
    action("play")
    page.wait_for_timeout(500)
    assert angle()>base
    action("stop")
    assert abs(angle()-demo_base)<.001
    assert not errors,errors
    print("Timeline, ciclos, pose, edição e persistência verificadas.")
