declare module "vm-interfaces-gspace" {
    import {
        BitmapElementData,
        ControlElementData,
        DoubleBitmapElementData,
        GroupElementData,
        LineElementData,
        Point2D,
        TextElementData,
        ToolData,
        VectorDrawData,
    } from "vdr-types";
    import { ClassState, VmBool } from "vm-interfaces-core";
    import { VmStateContainer } from "vm-types";

    export interface PenToolState {
        readonly handle: number;
        readonly color: number;
        readonly width: number;

        setColor(color: number): VmBool;
        setWidth(width: number): VmBool;
    }

    export interface BrushToolState {
        readonly handle: number;
        readonly color: number;
        readonly fillType: "SOLID" | "NULL" | "PATTERN" | "HATCED";
        readonly bmpTool: BitmapToolState | undefined;

        setColor(color: number): VmBool;
        setFillType(value: BrushToolState["fillType"]): VmBool;
        changeBmpTool(tool: BitmapToolState | undefined): VmBool;
    }

    export interface BitmapToolState {
        readonly handle: number;
        readonly image?: HTMLImageElement;
        readonly dimensions?: Point2D;

        setPixel(x: number, y: number, color: number): VmBool;
        getPixel(x: number, y: number): number;
    }

    export interface FontToolState {
        readonly handle: number;
        readonly name: string;
        readonly size: number;
        readonly bold: boolean;
    }

    export interface StringToolState {
        readonly handle: number;
        readonly text: string;
        setText(value: string): VmBool;
    }

    export interface TextFragment {
        readonly font: FontToolState;
        readonly stringFragment: StringToolState;
        readonly foregroundColor: number;
        readonly backgroundColor: number;
    }

    export interface TextToolState {
        readonly handle: number;
        readonly textCount: number;
        readonly assembledText: { text: string; size: number };

        getFragment(index: number): TextFragment;
        updateString(str: StringToolState, idx: number): void;
        updateFont(font: FontToolState, idx: number): void;
        updateFgColor(color: number, idx: number): void;
        updateBgColor(color: number, idx: number): void;
    }

    export type ToolState =
        | PenToolState
        | BrushToolState
        | BitmapToolState
        | FontToolState
        | StringToolState
        | TextToolState;

    export type ToolTypes = Exclude<ToolData["type"], "ttREFTODOUBLEDIB2D" | "ttREFTODIB2D">;

    export interface GraphicSpaceToolsState {
        readonly bitmaps: ReadonlyMap<number, BitmapToolState>;
        readonly brushes: ReadonlyMap<number, BrushToolState>;
        readonly doubleBitmaps: ReadonlyMap<number, BitmapToolState>;
        readonly fonts: ReadonlyMap<number, FontToolState>;
        readonly pens: ReadonlyMap<number, PenToolState>;
        readonly strings: ReadonlyMap<number, StringToolState>;
        readonly texts: ReadonlyMap<number, TextToolState>;

        createBitmap(bmpFilename: string): BitmapToolState;
        createBrush(color: number, style: number, dibHandle: number): BrushToolState;
        createDoubleBitmap(bmpFilename: string): BitmapToolState;
        createFont(fontName: string, size: number, bold: boolean): FontToolState;
        createPen(width: number, color: number, style: number): PenToolState;
        createString(value: string): StringToolState;
        createText(
            fontHandle: number,
            stringHandle: number,
            foregroundColor: number,
            backgroundColor: number
        ): TextToolState;

        deleteTool(type: ToolTypes, handle: number): VmBool;
    }

    export interface Object2dBase {
        readonly handle: number;
        readonly parent: GroupObjectState | undefined;

        readonly name: string;
        setName(name: string): VmBool;

        readonly positionX: number;
        readonly positionY: number;
        setPosition(x: number, y: number): VmBool;

        readonly width: number;
        readonly height: number;
        setSize(width: number, height: number): VmBool;

        readonly angle: number;
        rotate(centerX: number, centerY: number, angleRad: number): VmBool;

        readonly zOrder: number;
        setZorder(zOrder: number): VmBool;

        readonly isVisible: VmBool;
        setVisibility(visible: VmBool): VmBool;
    }

    export interface LineObjectState extends Object2dBase {
        readonly type: LineElementData["type"];
        readonly pen: PenToolState | undefined;
        readonly brush: BrushToolState | undefined;

        getPoint(index: number): Point2D;
        setPointPosition(index: number, x: number, y: number): VmBool;
        addPoint(index: number, x: number, y: number): VmBool;

        changePen(pen: PenToolState | undefined): VmBool;
        changeBrush(brush: BrushToolState | undefined): VmBool;
    }

    export interface ControlObjectState extends Object2dBase {
        readonly type: ControlElementData["type"];
        readonly text: string;
        setText(value: string): VmBool;
    }

    export interface TextObjectState extends Object2dBase {
        readonly type: TextElementData["type"];
        readonly textTool: TextToolState;
        changeTextTool(textTool: TextToolState): VmBool;
    }
    export interface BitmapObjectState extends Object2dBase {
        readonly type: (BitmapElementData | DoubleBitmapElementData)["type"];
        readonly bmpTool: BitmapToolState;

        setRect(x: number, y: number, width: number, height: number): VmBool;
        changeBmpTool(tool: BitmapToolState): VmBool;
    }

    export interface GroupObjectState extends Object2dBase {
        readonly type: GroupElementData["type"];

        getItem(index: number): GraphicObjectState | undefined;
        hasItem(obj: GraphicObjectState): VmBool;
        addItem(obj: GraphicObjectState): VmBool;
        removeItem(obj: GraphicObjectState): VmBool;
    }

    export type GraphicObjectState =
        | LineObjectState
        | ControlObjectState
        | TextObjectState
        | BitmapObjectState
        | GroupObjectState;

    export interface GraphicSpaceState {
        readonly handle: number;
        readonly tools: GraphicSpaceToolsState;

        readonly originX: number;
        readonly originY: number;
        setOrigin(x: number, y: number): VmBool;

        mergeVdr(vdr: VectorDrawData, x: number, y: number): number;

        createText(x: number, y: number, angle: number, textToolHandle: number): TextObjectState;
        createBitmap(x: number, y: number, dibHandle: number, isDouble: boolean): BitmapObjectState;
        createLine(points: Point2D[], penHandle: number, brushHandle: number): LineObjectState;
        createGroup(objectHandles: number[]): GroupObjectState | undefined;
        getObject(handle: number): GraphicObjectState | undefined;
        deleteObject(handle: number): VmBool;
        deleteGroup(groupHandle: number): VmBool;
        moveObjectToTop(handle: number): VmBool;

        findObjectByName(objectName: string, group?: GroupObjectState): GraphicObjectState | undefined;
        getObjectFromPoint(x: number, y: number): GraphicObjectState | undefined;
        isIntersect(obj: GraphicObjectState, obj2: GraphicObjectState): VmBool;

        subscribe(ctx: VmStateContainer, klass: ClassState, msg: number, objectHandle: number, flags: number): void;
    }
}