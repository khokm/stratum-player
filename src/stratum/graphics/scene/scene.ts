import { Constant, Env, Enviroment, EventSubscriber, NumBool } from "stratum/env";
import { VectorDrawing, VectorDrawingElement } from "stratum/fileFormats/vdr";
import { HandleMap } from "stratum/helpers/handleMap";
import { InputWrapper, InputWrapperOptions } from "./html/inputWrapper";
import { SceneBitmap } from "./sceneBitmap";
import { SceneControl } from "./sceneControl";
import { SceneGroup } from "./sceneGroup";
import { SceneLine } from "./sceneLine";
import { SceneText } from "./sceneText";
import { BrushTool } from "./tools/brushTool";
import { DIBTool } from "./tools/dibTool";
import { FontTool } from "./tools/fontTool";
import { PenTool } from "./tools/penTool";
import { StringTool } from "./tools/stringTool";
import { TextTool } from "./tools/textTool";
import { ToolStorage } from "./tools/toolStorage";

export interface SceneMember extends Env.SceneObject {
    readonly type: SceneVisualMember["type"] | "group";
    readonly markDeleted: boolean;
    handle: number;
    name: string;

    delete(): void;
    getChildByName(name: string): number;

    // groups
    minX(): number;
    minY(): number;
    maxX(): number;
    maxY(): number;
    onParentChanged(parent: SceneGroup | null): void;
    onParentMoved(dx: number, dy: number): void;
    onParentResized(centerX: number, centerY: number, dx: number, dy: number): void;
    onParentRotated(centerX: number, centerY: number, angle: number): void;
}

export interface SceneVisualMember extends SceneMember {
    type: "line" | "bitmap" | "text" | "control";
    render(ctx: CanvasRenderingContext2D, sceneX: number, sceneY: number, layers: number): void;
    tryClick(x: number, y: number, layers: number): this | SceneGroup | undefined;
}

export interface HTMLFactory {
    textInput(options: InputWrapperOptions): InputWrapper;
}

export class Scene implements Env.Scene, ToolStorage {
    private cnv: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private html: HTMLFactory;

    private _originX: number;
    private _originY: number;
    private _scale: number;
    private layers: number;

    private fillStyle: string;
    private matrix: number[];

    private primaryObjects: (SceneLine | SceneBitmap | SceneText | SceneControl)[];

    objects: Map<number, SceneLine | SceneBitmap | SceneText | SceneControl | SceneGroup>;
    pens: Map<number, PenTool>;
    brushes: Map<number, BrushTool>;
    dibs: Map<number, DIBTool>;
    doubleDibs: Map<number, DIBTool>;
    strings: Map<number, StringTool>;
    fonts: Map<number, FontTool>;
    texts: Map<number, TextTool>;

    dirty: boolean;

    constructor(canvas: HTMLCanvasElement, html: HTMLFactory, vdr?: VectorDrawing) {
        this.cnv = canvas;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw Error("Не удалось инициализировать контекст рендеринга");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, this.cnv.width, this.cnv.height);
        this.ctx = ctx;
        this.dirty = false;
        this.html = html;

        const handler = (evt: PointerEvent) => this.pointerEventHandler(evt);
        canvas.addEventListener("pointerdown", handler);
        canvas.addEventListener("pointerup", handler);
        canvas.addEventListener("pointerleave", handler);
        canvas.addEventListener("pointermove", handler);

        this.fillStyle = "white";
        if (!vdr) {
            this._originX = 0;
            this._originY = 0;
            this._scale = 1;
            this.layers = 0;
            this.objects = new Map();
            this.primaryObjects = [];
            this.pens = new Map();
            this.brushes = new Map();
            this.dibs = new Map();
            this.doubleDibs = new Map();
            this.strings = new Map();
            this.fonts = new Map();
            this.texts = new Map();
            this.matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
            return;
        }
        // порядок важен - некоторые инструменты зависят от других.
        this.pens = new Map(vdr.penTools?.map((t) => [t.handle, new PenTool(t)]));
        this.dibs = new Map(vdr.dibTools?.map((t) => [t.handle, new DIBTool(t)]));
        this.brushes = new Map(vdr.brushTools?.map((t) => [t.handle, new BrushTool(this, t)]));
        this.doubleDibs = new Map(vdr.doubleDibTools?.map((t) => [t.handle, new DIBTool(t)]));
        this.strings = new Map(vdr.stringTools?.map((t) => [t.handle, new StringTool(t)]));
        this.fonts = new Map(vdr.fontTools?.map((t) => [t.handle, new FontTool(t)]));
        this.texts = new Map(vdr.textTools?.map((t) => [t.handle, new TextTool(this, t)]));

        if (vdr.brushHandle > 0) {
            const tool = this.brushes.get(vdr.brushHandle);
            if (tool) this.fillStyle = tool.cssColor();
        }

        this.matrix = vdr.crdSystem?.matrix.slice() || [1, 0, 0, 0, 1, 0, 0, 0, 1];

        this._originX = vdr.origin.x;
        this._originY = vdr.origin.y;
        this.layers = vdr.layers;
        this._scale = 1;

        const groups = new Set<{ g: SceneGroup; h: number[] }>();
        const mapFunc: (e: VectorDrawingElement) => [number, SceneLine | SceneBitmap | SceneText | SceneControl | SceneGroup] = (e) => {
            switch (e.type) {
                case "otGROUP2D":
                    const g = new SceneGroup(this, e);
                    groups.add({ g, h: e.childHandles });
                    return [e.handle, g];
                case "otLINE2D":
                    return [e.handle, new SceneLine(this, e)];
                case "otTEXT2D":
                    return [e.handle, new SceneText(this, e)];
                case "otCONTROL2D":
                    return [e.handle, new SceneControl(this, html, e)];
                case "otBITMAP2D":
                case "otDOUBLEBITMAP2D":
                    return [e.handle, new SceneBitmap(this, e)];
            }
        };
        this.objects = new Map(vdr.elements?.map(mapFunc));
        groups.forEach((e) => e.g.addChildren(e.h));

        this.primaryObjects = [];
        vdr.elementOrder?.forEach((handle) => {
            const obj = this.objects.get(handle);
            if (!obj || obj.type === "group") return;
            this.primaryObjects.push(obj);
        });
    }

    render() {
        if (!this.dirty) return;
        this.ctx.fillStyle = this.fillStyle;
        this.ctx.fillRect(0, 0, this.cnv.width, this.cnv.height);
        this.primaryObjects.forEach((c) => c.render(this.ctx, this._originX, this._originY, this.layers));
        this.dirty = false;
    }

    originX(): number {
        return this._originX;
    }
    originY(): number {
        return this._originY;
    }
    setOrigin(x: number, y: number): NumBool {
        this._originX = x;
        this._originY = y;
        this.dirty = true;
        return 1;
    }

    scale(): number {
        return this._scale;
    }
    setScale(ms: number): NumBool {
        this._scale = ms;
        return 1;
    }

    createLine(coords: number[], penHandle: number, brushHandle: number): number {
        const handle = HandleMap.getFreeHandle(this.objects);
        const obj = new SceneLine(this, { handle, penHandle, brushHandle, coords });
        this.objects.set(handle, obj);
        this.primaryObjects.push(obj);
        return handle;
    }
    createBitmap(originX: number, originY: number, dibHandle: number, isDouble: boolean): number {
        const handle = HandleMap.getFreeHandle(this.objects);
        const obj = new SceneBitmap(this, { handle, originX, originY, type: isDouble ? "otDOUBLEBITMAP2D" : "otBITMAP2D", dibHandle });
        this.objects.set(handle, obj);
        this.primaryObjects.push(obj);
        return handle;
    }
    createText(originX: number, originY: number, angle: number, textToolHandle: number): number {
        const handle = HandleMap.getFreeHandle(this.objects);
        const obj = new SceneText(this, { handle, originX, originY, angle, textToolHandle });
        this.objects.set(handle, obj);
        this.primaryObjects.push(obj);
        return handle;
    }
    createControl(originX: number, originY: number, width: number, height: number, className: string, text: string, style: number) {
        if (className !== "EDIT" && className !== "BUTTON" && className !== "COMBOBOX") {
            return 0;
        }
        const handle = HandleMap.getFreeHandle(this.objects);
        const obj = new SceneControl(this, this.html, { handle, originX, originY, width, height, className, text });
        this.objects.set(handle, obj);
        this.primaryObjects.push(obj);
        return handle;
    }

    createGroup(childHandles: number[]): number {
        const handle = HandleMap.getFreeHandle(this.objects);
        const obj = new SceneGroup(this, { handle }).addChildren(childHandles);
        this.objects.set(handle, obj);
        return handle;
    }
    insertVectorDrawing(x: number, y: number, flags: number, vdr: VectorDrawing): number {
        if (!vdr.elements) return 0;

        // Сохраняем текущие объекты/инструменты
        const pens = this.pens;
        const dibs = this.dibs;
        const brushes = this.brushes;
        const doubleDibs = this.doubleDibs;
        const strings = this.strings;
        const fonts = this.fonts;
        const texts = this.texts;
        const objects = this.objects;

        // Создаем новые инструменты
        this.pens = new Map(vdr.penTools?.map((t) => [t.handle, new PenTool(t)]));
        this.dibs = new Map(vdr.dibTools?.map((t) => [t.handle, new DIBTool(t)]));
        this.brushes = new Map(vdr.brushTools?.map((t) => [t.handle, new BrushTool(this, t)]));
        this.doubleDibs = new Map(vdr.doubleDibTools?.map((t) => [t.handle, new DIBTool(t)]));
        this.strings = new Map(vdr.stringTools?.map((t) => [t.handle, new StringTool(t)]));
        this.fonts = new Map(vdr.fontTools?.map((t) => [t.handle, new FontTool(t)]));
        this.texts = new Map(vdr.textTools?.map((t) => [t.handle, new TextTool(this, t)]));

        // Создаем новые объекты
        const groups = new Set<{ g: SceneGroup; h: number[] }>();
        const mapFunc: (e: VectorDrawingElement) => [number, SceneLine | SceneBitmap | SceneText | SceneControl | SceneGroup] = (e) => {
            switch (e.type) {
                case "otGROUP2D":
                    const g = new SceneGroup(this, e);
                    groups.add({ g, h: e.childHandles });
                    return [e.handle, g];
                case "otLINE2D":
                    return [e.handle, new SceneLine(this, e)];
                case "otTEXT2D":
                    return [e.handle, new SceneText(this, e)];
                case "otCONTROL2D":
                    return [e.handle, new SceneControl(this, this.html, e)];
                case "otBITMAP2D":
                case "otDOUBLEBITMAP2D":
                    return [e.handle, new SceneBitmap(this, e)];
            }
        };
        const obs = vdr.elements.map(mapFunc);
        this.objects = new Map(obs);
        groups.forEach((e) => e.g.addChildren(e.h));

        // Добавляем их на сцену
        vdr.elementOrder?.forEach((handle) => {
            const obj = this.objects.get(handle);
            if (!obj || obj.type === "group") return;
            this.primaryObjects.push(obj);
        });

        // Создаем группу либо определяем корневой объект
        const topChildren = obs.filter((o) => o[1].parentHandle() === 0).map((o) => o[1].handle);

        if (topChildren.length === 0) throw Error("Ошибка вставки изображения");

        let root: SceneMember;
        if (topChildren.length > 1) {
            const handle = HandleMap.getFreeHandle(this.objects);
            const obj = new SceneGroup(this, { handle }).addChildren(topChildren);
            this.objects.set(handle, obj);
            root = obj;
        } else {
            root = this.objects.values().next().value;
        }
        root.setOrigin(x, y);

        // Объединяем инструменты и объекты с имеющимися
        this.pens.forEach((e) => {
            const handle = HandleMap.getFreeHandle(pens);
            e.handle = handle;
            pens.set(handle, e);
        });
        this.dibs.forEach((e) => {
            const handle = HandleMap.getFreeHandle(dibs);
            e.handle = handle;
            dibs.set(handle, e);
        });
        this.brushes.forEach((e) => {
            const handle = HandleMap.getFreeHandle(brushes);
            e.handle = handle;
            brushes.set(handle, e);
        });
        this.doubleDibs.forEach((e) => {
            const handle = HandleMap.getFreeHandle(doubleDibs);
            e.handle = handle;
            doubleDibs.set(handle, e);
        });
        this.strings.forEach((e) => {
            const handle = HandleMap.getFreeHandle(strings);
            e.handle = handle;
            strings.set(handle, e);
        });
        this.fonts.forEach((e) => {
            const handle = HandleMap.getFreeHandle(fonts);
            e.handle = handle;
            fonts.set(handle, e);
        });
        this.texts.forEach((e) => {
            const handle = HandleMap.getFreeHandle(texts);
            e.handle = handle;
            texts.set(handle, e);
        });
        this.objects.forEach((e) => {
            const handle = HandleMap.getFreeHandle(objects);
            e.handle = handle;
            objects.set(handle, e);
        });

        // Возвращаем назад
        this.pens = pens;
        this.dibs = dibs;
        this.brushes = brushes;
        this.doubleDibs = doubleDibs;
        this.strings = strings;
        this.fonts = fonts;
        this.texts = texts;
        this.objects = objects;

        return root.handle;
    }
    deleteObject(hobject: number): NumBool {
        const obj = this.objects.get(hobject);
        if (!obj) return 0;
        obj.delete();
        this.objects = new Map([...this.objects].filter((c) => !c[1].markDeleted));
        this.primaryObjects = this.primaryObjects.filter((c) => !c.markDeleted);
        return 1;
    }
    deleteGroup2d(hgroup: number): NumBool {
        const obj = this.objects.get(hgroup);
        if (!obj || obj.type !== "group") return 0;
        obj.ungroup();
        this.objects.delete(hgroup);
        return 1;
    }

    getObjectZOrder(hobject: number): number {
        for (let i = 0; i < this.primaryObjects.length; ++i) {
            if (this.primaryObjects[i].handle === hobject) return i + 1;
        }
        return 0;
    }
    setObjectZOrder(hobject: number, zOrder: number): NumBool {
        if (zOrder < 1) return 0;
        const z = Math.floor(zOrder);
        const obj = this.primaryObjects.find((c) => c.handle === hobject);
        if (!obj) return 0;
        const res: SceneVisualMember[] = [];
        for (let i = 0; i < this.primaryObjects.length; ++i) {
            if (z === i + 1) res.push(obj);
            const cur = this.primaryObjects[i];
            if (cur !== obj) res.push(cur);
        }
        if (z > this.primaryObjects.length) res.push(obj);
        this.dirty = true;
        return 1;
    }
    moveObjectToTop(hobject: number): NumBool {
        const obj = this.primaryObjects.find((c) => c.handle === hobject);
        if (!obj) return 0;
        const res = this.primaryObjects.filter((c) => c !== obj);
        res.push(obj);
        this.dirty = true;
        return 1;
    }

    getObject2dByName(hgroup: number, name: string): number {
        if (name === "") return 0;
        if (hgroup) {
            const obj = this.objects.get(hgroup);
            return obj ? obj.getChildByName(name) : 0;
        }
        for (const obj of this.objects.values()) if (obj.name === name) return obj.handle;
        return 0;
    }
    setObjectName(hobject: number, name: string): NumBool {
        const obj = this.objects.get(hobject);
        if (!obj) return 0;
        obj.name = name;
        return 1;
    }

    getObjectFromPoint2d(x: number, y: number): number {
        for (let i = this.primaryObjects.length - 1; i >= 0; --i) {
            const res = this.primaryObjects[i].tryClick(x, y, this.layers);
            if (res) return res.handle;
        }
        return 0;
    }

    isIntersect(obj1: number, obj2: number): NumBool {
        const o1 = this.objects.get(obj1);
        if (!o1) return 0;
        const o2 = this.objects.get(obj2);
        if (!o2) return 0;
        return o1.maxX() >= o2.minX() && o2.maxX() >= o1.minX() && o1.maxY() >= o2.minY() && o2.maxY() >= o1.minY() ? 1 : 0;
    }

    createPenTool(style: number, width: number, color: number, rop2: number): number {
        const handle = HandleMap.getFreeHandle(this.pens);
        this.pens.set(handle, new PenTool({ handle, color, width, rop2, style }));
        return handle;
    }
    createBrushTool(style: number, hatch: number, color: number, dibHandle: number, rop2: number): number {
        const handle = HandleMap.getFreeHandle(this.brushes);
        this.brushes.set(handle, new BrushTool(this, { handle, color, hatch, dibHandle, style, rop2 }));
        return handle;
    }
    createDIBTool(img: HTMLCanvasElement): number {
        const handle = HandleMap.getFreeHandle(this.dibs);
        this.dibs.set(handle, new DIBTool({ handle, type: "ttDIB2D", img }));
        return handle;
    }
    createDoubleDIBTool(img: HTMLCanvasElement): number {
        const handle = HandleMap.getFreeHandle(this.doubleDibs);
        this.doubleDibs.set(handle, new DIBTool({ handle, type: "ttDOUBLEDIB2D", img }));
        return handle;
    }
    createStringTool(text: string): number {
        const handle = HandleMap.getFreeHandle(this.strings);
        this.strings.set(handle, new StringTool({ handle, text }));
        return handle;
    }
    createFontTool(fontName: string, size: number, style: number): number {
        const handle = HandleMap.getFreeHandle(this.fonts);
        const italic = style & 1;
        const underline = style & 2;
        const strikeOut = style & 4;
        const weight = style & 8;
        this.fonts.set(handle, new FontTool({ handle, fontName, height: -size, italic, underline, strikeOut, weight }));
        return handle;
    }
    createTextTool(fontHandle: number, stringHandle: number, fgColor: number, bgColor: number): number {
        const handle = HandleMap.getFreeHandle(this.texts);
        this.texts.set(handle, new TextTool(this, { handle, textCollection: [{ fgColor, bgColor, fontHandle, stringHandle }] }));
        return handle;
    }

    private capture: EventSubscriber | null = null;
    setCapture(sub: EventSubscriber) {
        this.capture = sub;
    }
    releaseCapture() {
        this.capture = null;
    }

    private moveSubs = new Map<EventSubscriber, number>();
    private leftButtonUpSubs = new Map<EventSubscriber, number>();
    private leftButtonDownSubs = new Map<EventSubscriber, number>();
    private rightButtonUpSubs = new Map<EventSubscriber, number>();
    private rightButtonDownSubs = new Map<EventSubscriber, number>();
    private middleButtonUpSubs = new Map<EventSubscriber, number>();
    private middleButtonDownSubs = new Map<EventSubscriber, number>();
    onMouse(sub: EventSubscriber, code: Constant, objectHandle: number) {
        switch (code) {
            case Constant.WM_MOUSEMOVE:
                this.moveSubs.set(sub, objectHandle);
                break;
            case Constant.WM_LBUTTONDOWN:
                this.leftButtonDownSubs.set(sub, objectHandle);
                break;
            case Constant.WM_LBUTTONUP:
                this.leftButtonUpSubs.set(sub, objectHandle);
                break;
            // case EventCode.WM_LBUTTONDBLCLK:
            //     break;
            case Constant.WM_RBUTTONDOWN:
                this.rightButtonDownSubs.set(sub, objectHandle);
                break;
            case Constant.WM_RBUTTONUP:
                this.rightButtonUpSubs.set(sub, objectHandle);
                break;
            // case EventCode.WM_RBUTTONDBLCLK:
            //     break;
            case Constant.WM_MBUTTONDOWN:
                this.middleButtonDownSubs.set(sub, objectHandle);
                break;
            case Constant.WM_MBUTTONUP:
                this.middleButtonUpSubs.set(sub, objectHandle);
                break;
            // case EventCode.WM_MBUTTONDBLCLK:
            //     break;
            case Constant.WM_ALLMOUSEMESSAGE:
                this.moveSubs.set(sub, objectHandle);
                this.leftButtonDownSubs.set(sub, objectHandle);
                this.leftButtonUpSubs.set(sub, objectHandle);
                this.rightButtonDownSubs.set(sub, objectHandle);
                this.rightButtonUpSubs.set(sub, objectHandle);
                this.middleButtonDownSubs.set(sub, objectHandle);
                this.middleButtonUpSubs.set(sub, objectHandle);
                break;
        }
    }

    offMouse(sub: EventSubscriber, code: Constant) {
        switch (code) {
            case Constant.WM_MOUSEMOVE:
                this.moveSubs.delete(sub);
                break;
            case Constant.WM_LBUTTONDOWN:
                this.leftButtonDownSubs.delete(sub);
                break;
            case Constant.WM_LBUTTONUP:
                this.leftButtonUpSubs.delete(sub);
                break;
            // case EventCode.WM_LBUTTONDBLCLK:
            //     break;
            case Constant.WM_RBUTTONDOWN:
                this.rightButtonDownSubs.delete(sub);
                break;
            case Constant.WM_RBUTTONUP:
                this.rightButtonUpSubs.delete(sub);
                break;
            // case EventCode.WM_RBUTTONDBLCLK:
            //     break;
            case Constant.WM_MBUTTONDOWN:
                this.middleButtonDownSubs.delete(sub);
                break;
            case Constant.WM_MBUTTONUP:
                this.middleButtonUpSubs.delete(sub);
                break;
            // case EventCode.WM_MBUTTONDBLCLK:
            //     break;
            case Constant.WM_ALLMOUSEMESSAGE:
                this.moveSubs.delete(sub);
                this.leftButtonDownSubs.delete(sub);
                this.leftButtonUpSubs.delete(sub);
                this.rightButtonDownSubs.delete(sub);
                this.rightButtonUpSubs.delete(sub);
                this.middleButtonDownSubs.delete(sub);
                this.middleButtonUpSubs.delete(sub);
                break;
        }
    }

    private blocked = false;
    private pointerEventHandler(evt: PointerEvent) {
        const rect = (evt.target as HTMLCanvasElement).getBoundingClientRect();
        const x = evt.clientX - rect.left + this.originX();
        const y = evt.clientY - rect.top + this.originY();

        const lmb = evt.buttons & 1 ? 1 : 0;
        const rmb = evt.buttons & 2 ? 2 : 0;
        const wheel = evt.buttons & 4 ? 16 : 0;
        const fwkeys = lmb | rmb | wheel;

        Enviroment.keyState[1] = lmb;
        Enviroment.keyState[2] = rmb;
        Enviroment.keyState[4] = wheel;
        switch (evt.type) {
            // https://developer.mozilla.org/ru/docs/Web/API/MouseEvent/button
            case "pointerdown": {
                this.blocked = true;
                switch (evt.button) {
                    case 0: //Левая кнопка
                        this.dispatchMouseEvent(this.leftButtonDownSubs, Constant.WM_LBUTTONDOWN, x, y, fwkeys);
                        return;
                    case 1: //Колесико
                        this.dispatchMouseEvent(this.middleButtonDownSubs, Constant.WM_MBUTTONDOWN, x, y, fwkeys);
                        return;
                    case 2: //Правая кнопка
                        this.dispatchMouseEvent(this.rightButtonDownSubs, Constant.WM_RBUTTONDOWN, x, y, fwkeys);
                        return;
                }
                return;
            }
            case "pointerup": {
                switch (evt.button) {
                    case 0:
                        this.dispatchMouseEvent(this.leftButtonUpSubs, Constant.WM_LBUTTONUP, x, y, fwkeys);
                        return;
                    case 1:
                        this.dispatchMouseEvent(this.middleButtonUpSubs, Constant.WM_MBUTTONUP, x, y, fwkeys);
                        return;
                    case 2:
                        this.dispatchMouseEvent(this.rightButtonUpSubs, Constant.WM_RBUTTONUP, x, y, fwkeys);
                        return;
                }
                return;
            }
            case "pointerleave": {
                this.dispatchMouseEvent(this.leftButtonUpSubs, Constant.WM_LBUTTONUP, x, y, 0);
                return;
            }
            case "pointermove":
                if (this.blocked) {
                    this.blocked = false;
                    return;
                }
                this.dispatchMouseEvent(this.moveSubs, Constant.WM_MOUSEMOVE, x, y, fwkeys);
                return;
        }
    }

    private dispatchMouseEvent(subs: Map<EventSubscriber, number>, code: Constant, x: number, y: number, keys: number) {
        if (this.capture) {
            this.capture.receive(code, x, y, keys);
            // return;
        }
        for (const [sub, objHandle] of subs) {
            if (objHandle === 0 || this.getObjectFromPoint2d(x, y) === objHandle) sub.receive(code, x, y, keys);
        }
    }

    private controlNotifySubs = new Map<EventSubscriber, number>();
    onControlNotify(sub: EventSubscriber, handle: number) {
        this.controlNotifySubs.set(sub, handle);
    }
    offControlNotify(sub: EventSubscriber) {
        this.controlNotifySubs.delete(sub);
    }
    dispatchControlNotifyEvent(ctrlHandle: number, notifyCode: number) {
        for (const [sub, objHandle] of this.controlNotifySubs) {
            if (objHandle === 0 || objHandle === ctrlHandle) sub.receive(Constant.WM_CONTROLNOTIFY, ctrlHandle, 0, notifyCode);
        }
    }
}
