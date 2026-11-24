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
    result=page.evaluate("""async ()=>{
      const o=app.currentCharacterObject, root=o.rig.getRoot(), bar=app.station.bar(), base=root.localPosition.y;
      const result={drift:0,length:0,flip:false}, lengths={};
      for(const h of [0,25,100,200,280,220,150,50,0]){
        root.setLocalPosition(root.localPosition.x,base-h);
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        for(const [i,s] of ['esquerdo','direito'].entries()){
          const [a,b,c]=['ombro','cotovelo','pulso'].map(n=>o.rig.getBone(n+'_'+s).getWorldPoint());
          const l=[Math.hypot(b.x-a.x,b.y-a.y),Math.hypot(c.x-b.x,c.y-b.y)];
          lengths[s]??=l;
          result.length=Math.max(result.length,...l.map((v,j)=>Math.abs(v-lengths[s][j])));
          const sign=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
          result.flip ||= i===0 ? sign < -0.01 : sign > 0.01;
          const k=o.pullup.contacts[i], grip=o.pullup.grips[i], target=bar.transform.transformPoint(grip.x,grip.y);
          const hand=o.transform.transformPoint(c.x+k.point.x-k.wrist.x,c.y+k.point.y-k.wrist.y);
          result.drift=Math.max(result.drift,Math.hypot(hand.x-target.x,hand.y-target.y));
        }
      }
      return result;
    }""")
    print(result)
    assert result["drift"]<.01 and result["length"]<.01 and not result["flip"] and not errors
    extra=page.evaluate("""async ()=>{
      const o=app.currentCharacterObject,c=o.pullup,rig=o.rig,b=rig.getRoot(),hand=o.partManager.getAllParts().find(p=>p.boneId==='pulso_esquerdo');
      const next=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      b.setLocalPosition(b.localPosition.x,c.restY-120);await next();
      c.fixed=false;
      const wrist=rig.getBone(hand.boneId), before=wrist.getWorldPoint();
      b.setLocalPosition(b.localPosition.x,b.localPosition.y-10);await next();
      const free=Math.abs(wrist.getWorldPoint().y-before.y);
      c.grips[0].x-=12;c.fixed=true;
      hand.setLocalPosition(hand.localPosition.x+3,hand.localPosition.y-2);
      const saved={...hand.localPosition};await next();
      const pt=o.transform.clone().multiply(wrist.worldTransform).multiply(hand.localTransform)
        .transformPoint((.5-hand.pivot.x)*hand.imageWidth,(.45-hand.pivot.y)*hand.imageHeight);
      const g=c.grips[0],target=app.station.bar().transform.transformPoint(g.x,g.y);
      return {free,drift:Math.hypot(pt.x-target.x,pt.y-target.y),saved:saved.x===hand.localPosition.x && saved.y===hand.localPosition.y};
    }""")
    assert abs(extra['free']-10)<.001 and extra['drift']<.001 and extra['saved'],extra
