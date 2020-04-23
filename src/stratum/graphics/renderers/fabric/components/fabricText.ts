import { fabric } from "fabric";
import { TextElementVisual, TextVisualOptions } from "scene-types";
import { Point2D } from "vdr-types";
import { TextToolState } from "vm-interfaces-gspace";
import { colorrefToColor } from "~/helpers/varValueFunctions";
import { fabricConfigObjectOptions } from "../fabricConfig";

// const textScaleCoof = 0.65;

export class FabricText implements TextElementVisual {
    readonly type = "text";
    private posX: number;
    private posY: number;
    obj: fabric.Text;
    readonly handle: number;
    private visibleArea: Point2D;
    readonly selectable: boolean;

    constructor(
        { handle, isVisible, selectable, position, angle, textTool }: TextVisualOptions,
        private viewRef: Point2D,
        private requestRedraw: () => void
    ) {
        this.handle = handle;
        this.posX = position.x;
        this.posY = position.y;
        const { text, size: textSize } = textTool.assembledText;
        const firstFrag = textTool.getFragment(0);
        const opts: fabric.ITextOptions = {
            ...fabricConfigObjectOptions,
            left: position.x - viewRef.x,
            top: position.y - viewRef.y,
            angle: -(angle || 0) * 0.1,
            backgroundColor: colorrefToColor(firstFrag.backgroundColor),
            fill: colorrefToColor(firstFrag.foregroundColor),
            fontWeight: firstFrag.font.bold ? "bold" : "normal",
            fontFamily: firstFrag.font.name,
            visible: isVisible,
            // fontSize: textSize * textScaleCoof,
            fontSize: textSize,
        };
        this.selectable = selectable;
        this.obj = new fabric.Text(text, opts);
        this.visibleArea = { x: this.obj.width || 0, y: this.obj.height || 0 };
    }

    getVisibleAreaSize(): Point2D {
        return this.visibleArea;
    }

    updateAfterViewTranslate() {
        const { posX, posY, viewRef } = this;
        this.obj.set({ left: posX - viewRef.x, top: posY - viewRef.y }).setCoords();
    }

    setPosition(x: number, y: number): void {
        const { x: viewX, y: viewY } = this.viewRef;
        this.obj.set({ left: x - viewX, top: y - viewY }).setCoords();
        this.posX = x;
        this.posY = y;
        this.requestRedraw();
    }

    scaleTo(width: number, height: number): void {
        // throw new Error("Method not implemented.");
    }

    setAngle(angle: number): void {
        this.obj.set({ angle }).setCoords();
        this.requestRedraw();
    }

    testIntersect(x: number, y: number) {
        if (!this.obj.visible) return false;
        const diffX = x - this.posX;
        const diffY = y - this.posY;
        return diffX > 0 && diffX <= this.visibleArea.x && diffY > 0 && diffY <= this.visibleArea.y;
    }

    show(): void {
        this.obj.set({ visible: true });
        this.requestRedraw();
    }

    hide(): void {
        this.obj.set({ visible: false });
        this.requestRedraw();
    }

    updateTextTool(textTool: TextToolState): void {
        const { text, size } = textTool.assembledText;
        const firstFrag = textTool.getFragment(0);
        this.obj.set({
            text,
            // fontSize: size * textScaleCoof,
            fontSize: size,
            backgroundColor: colorrefToColor(firstFrag.backgroundColor),
            fill: colorrefToColor(firstFrag.foregroundColor),
            fontWeight: firstFrag.font.bold ? "bold" : "normal",
            fontFamily: firstFrag.font.name,
        });
        this.requestRedraw();
    }
}
