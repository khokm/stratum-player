import { Remove } from "~/helpers/utilityTypes";
import { StringToolParams } from "~/common/fileFormats/vdr/types/vectorDrawingTools";
import { StringTool } from "~/vm/interfaces/graphicSpaceTools";
import { SceneToolMixin } from "./sceneToolMixin";
import { NumBool } from "~/vm/types";

export type SceneStringToolArgs = Remove<StringToolParams, "type">;

export class SceneStringTool extends SceneToolMixin implements StringTool {
    private _text: string;

    constructor(args: SceneStringToolArgs) {
        super(args);
        this._text = args.text;
    }

    get text(): string {
        return this._text;
    }

    setText(value: string): NumBool {
        this._text = value;
        this.dispatchChanges();
        return 1;
    }
}
