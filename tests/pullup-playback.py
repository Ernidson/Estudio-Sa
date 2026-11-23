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
    def action(v):
        panel.locator(f'button[value="{v}"]').click()
    for fps in [24,30]:
        panel.locator('[name="fps"]').select_option(str(fps))
        action('start')
        page.evaluate("""()=>{
          const o=app.currentCharacterObject,bar=app.station.bar(),config=o.pullup;
          const base=bar.transform.m.slice(),rig=o.rig, lengths={},prev={};
          const monitor=window.results={drift:0,bar:0,length:0,flip:false,angles:0,updates:0,
            frames:0,first:null,last:null,initial:null,final:null,peak:0,prev:null,broken:false};
          const rest=rig.getRoot().localPosition.y;
          function frame(t){
            if(window.stopSampling)return;
            const at=Number(document.querySelector('#animation-editor output').textContent.split(' ')[0]);
            if(at!==monitor.prev){
              if(monitor.first===null && at>0)monitor.first=t;
              monitor.updates++;monitor.prev=at;
            }
            if(monitor.first!==null){monitor.frames++;monitor.last=t;}
            monitor.peak=Math.max(monitor.peak,rest-rig.getRoot().localPosition.y);
            monitor.bar=Math.max(monitor.bar,...base.map((v,i)=>Math.abs(v-bar.transform.m[i])));
            for(const [i,s] of ['esquerdo','direito'].entries()){
              const bones=['ombro','cotovelo','pulso'].map(n=>rig.getBone(n+'_'+s)), [a,b,c]=bones.map(j=>j.getWorldPoint());
              const seg=[Math.hypot(a.x-b.x,a.y-b.y),Math.hypot(b.x-c.x,b.y-c.y)];
              lengths[s]??=seg;
              monitor.length=Math.max(monitor.length,...seg.map((v,j)=>Math.abs(v-lengths[s][j])));
              const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
              if((i===0 && cross<-.01)||(i===1 && cross>.01))monitor.flip=true;
              const p=o.partManager.getAllParts().find(part=>part.boneId===bones[2].id);
              const actual=o.transform.clone().multiply(bones[2].worldTransform).multiply(p.localTransform)
                .transformPoint((.5-p.pivot.x)*p.imageWidth,(.45-p.pivot.y)*p.imageHeight);
              const g=config.grips[i],target=bar.transform.transformPoint(g.x,g.y);
              monitor.drift=Math.max(monitor.drift,Math.hypot(actual.x-target.x,actual.y-target.y));
              const angles=bones.map(j=>j.getLocalRotation());prev[s]??=angles;
              monitor.angles=Math.max(monitor.angles,...angles.map((v,j)=>Math.abs((v-prev[s][j]+540)%360-180)));prev[s]=angles;
            }
            const matrices=rig.getAllBones().flatMap(b=>b.worldTransform.m);
            monitor.initial??=matrices;
            if(at>=5){monitor.final=matrices;return;}
            requestAnimationFrame(frame);
          }
          window.stopSampling=false;requestAnimationFrame(frame);
        }""")
        action('play')
        page.wait_for_function("window.results.final",timeout=12000)
        r=page.evaluate("results")
        elapsed=(r['last']-r['first'])/1000
        end=max(abs(a-b) for a,b in zip(r['initial'],r['final']))
        print(f"{fps} FPS: {r['updates']} instantes, {elapsed:.3f} s, {r['frames']/elapsed:.1f} callbacks/s, erro contacto {r['drift']:.6f}, variação máxima {r['angles']:.2f}°, pico {r['peak']:.2f} px, erro final {end:.8f}",flush=True)
        assert r['drift']<.01 and r['length']<.01 and r['bar']==0 and not r['flip'] and end<.001
        assert 4.8<elapsed<5.2 and r['peak']>309 and r['angles']<15
    panel.locator('[name="loop"]').check()
    action('play');page.wait_for_timeout(5250);action('pause')
    elapsed=float(panel.locator('output').inner_text().split()[0])
    assert 0<elapsed<1
    action('stop')
    assert not errors,errors
