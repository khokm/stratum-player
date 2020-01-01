import { equal } from "assert";
import { loadProjectData, openZipFromUrl } from "~/fileReader/fileReaderHelpers";
import { GraphicSpace } from "~/graphics/graphicSpace/graphicSpace";
import { GroupObject } from "~/graphics/graphicSpace/objects";
import { SimpleImageLoader } from "~/graphics/graphicSpace/simpleImageLoader";
import { FabricScene } from "~/graphics/renderers/fabricRenderer/fabricScene";
import { createComposedScheme } from "~/helpers/graphics";
import { WindowSystem } from "~/graphics/windowSystem";

(async function() {
    const zip = await openZipFromUrl(["/test_projects/balls.zip", "/data/library.zip"]);
    const { collection } = await loadProjectData(zip);
    const cl = collection.get("WorkSpace")!;
    const cdata = cl.childs!;
    const oldvdr = cl.scheme!;
    const vdr = createComposedScheme(oldvdr, cdata, collection);
    const cv = document.getElementById("canvas") as HTMLCanvasElement;
    const ws = new WindowSystem({ onWindowCreated: wname => (document.title = wname), globalCanvas: cv });
    const globalImgLoader = new SimpleImageLoader();
    ws.createSchemeWindow("Test Window", "", canvas =>
        GraphicSpace.fromVdr(vdr, globalImgLoader, new FabricScene({ canvas, view: vdr.origin }))
    );
    const space = ws.getSpace(1)!;
    globalImgLoader.getPromise().then(() => {
        space.scene.forceRender();
    });
    setTimeout(() => {
        space.setOrigin(30, 30);
        equal(space.getObjectHandleFromPoint(40, 40), 0);
        space.getObject(33)!.setPosition(32, 32);
        equal(space.getObjectHandleFromPoint(40, 40), 33);
        space.scene.render();
        console.log("graphic instance test 2/2 completed");
    }, 1500);
    space.scene.render();
    const elements = vdr.elements!;
    for (const elem of elements) {
        const obj = space.getObject(elem.handle)!;
        equal(obj.type, elem.type);
        equal(obj.handle, elem.handle);
        equal(obj.name, elem.name);
        if (elem.type === "otGROUP2D") {
            equal([...(obj as GroupObject).items].length, elem.childHandles.length);
            for (const child of elem.childHandles) {
                equal(space.getObject(child)!.parent, obj);
            }
        }
    }
    console.log("graphic instance test 1/2 completed");
})();