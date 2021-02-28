import { NumBool } from "stratum/env";
import { BitmapElement, DoubleBitmapElement } from "stratum/fileFormats/vdr";
import { Scene } from ".";
import { SceneVisualMember } from "./scene";
import { SceneGroup } from "./sceneGroup";
import { DIBTool } from "./tools/dibTool";
import { ToolSubscriber } from "./tools/toolSubscriber";

export interface SceneBitmapArgs {
    handle: number;
    options?: number;
    name?: string;
    originX: number;
    originY: number;
    width?: number;
    height?: number;
    cropX?: number;
    cropY?: number;
    cropW?: number;
    cropH?: number;
    type: BitmapElement["type"] | DoubleBitmapElement["type"];
    hidden?: boolean;
    dibHandle: number;
}

export class SceneBitmap implements SceneVisualMember, ToolSubscriber {
    readonly type = "bitmap";
    private scene: Scene;

    private dib: DIBTool | null;

    private _originX: number;
    private _originY: number;
    private _width: number;
    private _height: number;
    private hardHidden: boolean;
    private _visible: number;
    private _selectable: number;
    private _layer: number;
    private _parent: SceneGroup | null;

    private cropX: number;
    private cropY: number;
    private cropW: number;
    private cropH: number;

    private isDouble: boolean;

    handle: number;
    name: string;
    markDeleted: boolean;

    constructor(
        scene: Scene,
        { handle, name, options, hidden, originX, originY, type, dibHandle, width, height, cropX, cropY, cropW, cropH }: SceneBitmapArgs
    ) {
        this.scene = scene;
        this.handle = handle;
        this.name = name || "";

        this.markDeleted = false;
        scene.dirty = true;

        this.isDouble = type !== "otBITMAP2D";
        const dib = (this.isDouble ? scene.doubleDibs : scene.dibs).get(dibHandle);
        dib?.subscribe(this);
        this.dib = dib || null;

        this._originX = originX;
        this._originY = originY;
        const dibW = dib?.width() || 0;
        const dibH = dib?.height() || 0;
        this._width = hidden ? 1 : width || dibW;
        this._height = hidden ? 1 : height || dibH;
        this.hardHidden = !!hidden;

        this.cropX = cropX || 0;
        this.cropY = cropY || 0;
        this.cropW = cropW || dibW;
        this.cropH = cropH || dibH;

        const opts = options || 0;
        // this._visible = opts & 1 ? 0 : 1;
        this._visible = 1;
        this._selectable = opts & 8 ? 0 : 1;
        const layerNumber = (opts >> 8) & 0b11111;
        this._layer = 1 << layerNumber;
        this._parent = null;
    }

    toolChanged() {
        this.scene.dirty = true;
    }

    parentHandle(): number {
        return this._parent?.handle || 0;
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
        this._parent?.updateBorders();
        this.scene.dirty = true;
        return 1;
    }

    width(): number {
        return this._width;
    }
    actualWidth(): number {
        return this._width;
    }
    height(): number {
        return this._height;
    }
    actualHeight(): number {
        return this._height;
    }
    setSize(width: number, height: number): NumBool {
        if (width < 0 || height < 0) return 0;
        const w = this._width;
        const h = this._height;
        if (w === 0 || h === 0) return 1;
        this.onParentResized(this._originX, this._originY, width / w, height / h);
        this._parent?.updateBorders();
        return 1;
    }

    angle(): number {
        return 0;
    }
    rotate(centerX: number, centerY: number, angle: number): NumBool {
        if (angle === 0) return 1;
        this.onParentRotated(centerX, centerY, angle);
        this._parent?.updateBorders();
        return 1;
    }

    setShow(visible: number): NumBool {
        this._visible = visible;
        this.scene.dirty = true;
        return 1;
    }

    // bitmap methods
    setBitmapRect(x: number, y: number, width: number, height: number): NumBool {
        if (x < 0 || y < 0 || width < 0 || height < 0) return 0;
        this.cropX = x;
        this.cropY = y;
        this.cropW = width;
        this.cropH = height;
        this.scene.dirty = true;
        return 1;
    }
    dibHandle(): number {
        return !this.isDouble && this.dib ? this.dib.handle : 0;
    }
    doubleDIBHandle(): number {
        return this.isDouble && this.dib ? this.dib.handle : 0;
    }

    // scene
    delete() {
        this.dib?.unsubscribe(this);
        this._parent?.removeChild(this);
        this.markDeleted = true;
        this.scene.dirty = true;
    }

    getChildByName(name: string): number {
        return this.name === name ? this.handle : 0;
    }

    minX(): number {
        return this._originX;
    }
    minY(): number {
        return this._originY;
    }
    maxX(): number {
        return this._originX + this._width;
    }
    maxY(): number {
        return this._originY + this._height;
    }
    onParentChanged(parent: SceneGroup | null) {
        if (parent === this._parent) return;
        this._parent?.removeChild(this);
        this._parent = parent;
    }
    onParentMoved(dx: number, dy: number) {
        this._originX += dx;
        this._originY += dy;
        this.scene.dirty = true;
    }
    onParentResized(centerX: number, centerY: number, dx: number, dy: number) {
        this._originX = centerX + (this._originX - centerX) * dx;
        this._originY = centerY + (this._originY - centerY) * dy;
        this._width *= dx;
        this._height *= dy;
        this.scene.dirty = true;
    }
    onParentRotated(centerX: number, centerY: number, angle: number) {
        const s = Math.sin(angle);
        const c = Math.cos(angle);

        // translate point back to origin:
        const posx = this._originX - centerX;
        const posy = this._originY - centerY;

        // rotate point
        const xnew = posx * c - posy * s;
        const ynew = posx * s + posy * c;

        // translate point back:
        this._originX = xnew + centerX;
        this._originY = ynew + centerY;
        this.scene.dirty = true;
    }

    render(ctx: CanvasRenderingContext2D, sceneX: number, sceneY: number, layers: number) {
        if (this.hardHidden || !this.dib || this._visible === 0 || (this._layer & layers) !== 0) return;
        const x = this._originX - sceneX;
        const y = this._originY - sceneY;
        this.dib.render(ctx, this.cropX, this.cropY, this.cropW, this.cropH, x, y, this._width, this._height);
    }

    tryClick(x: number, y: number, layers: number): this | SceneGroup | undefined {
        if (this.hardHidden || !this.dib || this._visible === 0 || (this._layer & layers) !== 0 || this._selectable === 0) return undefined;

        const ox = x - this._originX;
        const oy = y - this._originY;
        if (ox < 0 || oy < 0 || ox > this._width || oy > this._height) return undefined;

        const dx = ox * (this.cropW / this._width) + this.cropX;
        const dy = oy * (this.cropH / this._height) + this.cropY;

        if (!this.dib.tryClick(dx, dy)) return undefined;
        // if (this.ctx2.getImageData(ox, oy, 1, 1).data[3] === 0) return undefined;

        return this._parent ? this._parent.root() : this;
    }

    //#region stubs
    pointOriginX(): number {
        return 0;
    }

    pointOriginY(): number {
        return 0;
    }

    setPointOrigin(): NumBool {
        return 0;
    }

    addPoint(): NumBool {
        return 0;
    }

    pointCount(): number {
        return 0;
    }

    penHandle(): number {
        return 0;
    }
    brushHandle(): number {
        return 0;
    }

    textToolHandle(): number {
        return 0;
    }
    controlText(): string {
        return "";
    }
    setControlText(): NumBool {
        return 0;
    }
    itemHandle(): number {
        return 0;
    }
    deleteItem(): NumBool {
        return 0;
    }
    deletePoint(): NumBool {
        return 0;
    }
    addItem(): NumBool {
        return 0;
    }
    //#endregion
}
