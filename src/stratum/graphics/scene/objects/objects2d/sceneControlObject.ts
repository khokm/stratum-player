import { Optional } from "~/helpers/utilityTypes";
import { ControlElement } from "~/common/fileFormats/vdr/types/vectorDrawingElements";
import { ControlObject } from "~/vm/interfaces/graphicSpaceObjects";
import { NumBool } from "~/vm/types";
import { RenderableControl, RenderableFactory } from "../../interfaces";
import { Object2dMixin } from "./object2dMixin";

type omitKeys = "type" | "name" | "options" | "size" | "exStyle" | "dwStyle" | "id" | "text";
export type SceneControlObjectArgs = Optional<ControlElement, omitKeys>;

export class SceneControlObject extends Object2dMixin implements ControlObject {
    readonly type = "otCONTROL2D";
    readonly renderable: RenderableControl;
    constructor(args: SceneControlObjectArgs, renderableFactory: RenderableFactory) {
        super(args);

        this.renderable = renderableFactory.createControl({
            handle: args.handle,
            position: args.position,
            isVisible: !!this.isVisible,
            selectable: !!this.isSelectable,
            classname: args.classname,
            text: args.text,
            controlSize: args.controlSize,
        });

        if (!args.size) {
            const area = this.renderable.getVisibleAreaSize();
            this.width = area.x;
            this.height = area.y;
        }
    }

    get text(): string {
        return this.renderable.getText();
    }

    setText(value: string): NumBool {
        this.renderable.setText(value);
        return 1;
    }
}
