import { DirInfo } from "stratum/api";
import { ClassLibrary } from "stratum/classLibrary";
import { HyperCallReceiver, NumBool } from "stratum/common/types";
import { VarType } from "stratum/common/varType";
import { ProjectContextFunctions, SchemaMemory } from "stratum/compiler";
import { unreleasedFunctions } from "stratum/compiler/unreleasedFunctions";
import { ProjectInfo } from "stratum/fileFormats/prj";
import { VariableSet } from "stratum/fileFormats/stt";
import { Hyperbase } from "stratum/fileFormats/vdr";
import { EnviromentFunctions } from "./enviromentFunctions";
import { Schema } from "./schema";

export interface ProjectArgs {
    dir: DirInfo;
    prjInfo: ProjectInfo;
    classes: ClassLibrary;
    stt?: VariableSet | null;
}

export class Project implements HyperCallReceiver, SchemaMemory, ProjectContextFunctions {
    private readonly dir: DirInfo;
    private readonly olds: { [index: number]: Float64Array | Int32Array | string[] };
    private readonly news: { [index: number]: Float64Array | Int32Array | string[] };

    private level: number;
    private _shouldClose: boolean;

    readonly root: Schema;
    readonly env: EnviromentFunctions;

    readonly oldFloats: Float64Array;
    readonly newFloats: Float64Array;

    readonly oldInts: Int32Array;
    readonly newInts: Int32Array;

    readonly oldStrings: string[];
    readonly newStrings: string[];

    constructor(env: EnviromentFunctions, args: ProjectArgs) {
        this.level = 0;
        this._shouldClose = false;
        this.env = env;
        this.dir = args.dir;

        const rootProto = args.classes.get(args.prjInfo.rootClassName);
        if (!rootProto) throw Error(`Корневой класс ${args.prjInfo.rootClassName} не найден`);

        unreleasedFunctions.clear();
        const schema = rootProto.schema<Schema>((...args) => new Schema(this, ...args));
        if (unreleasedFunctions.size > 0) console.log(`Нереализованные функции:\n${[...unreleasedFunctions.values()].join("\n")}`);
        const size = schema.createTLB(); // Инициализируем память

        this.oldFloats = new Float64Array(size.floatsCount);
        this.newFloats = new Float64Array(size.floatsCount);

        this.oldInts = new Int32Array(size.intsCount);
        this.newInts = new Int32Array(size.intsCount);

        this.oldStrings = new Array<string>(size.stringsCount).fill("");
        this.newStrings = new Array<string>(size.stringsCount).fill("");

        this.olds = [];
        this.olds[VarType.Float] = this.oldFloats;
        this.olds[VarType.Handle] = this.oldInts;
        this.olds[VarType.ColorRef] = this.oldInts;
        this.olds[VarType.String] = this.oldStrings;

        this.news = [];
        this.news[VarType.Float] = this.newFloats;
        this.news[VarType.Handle] = this.newInts;
        this.news[VarType.ColorRef] = this.newInts;
        this.news[VarType.String] = this.newStrings;

        schema.applyDefaults(); //Заполняем значениями по умолчанию
        if (args.stt) schema.applyVarSet(args.stt); // Применяем _preload.stt
        this.root = schema;
    }

    canExecute(): boolean {
        return this.level < 59;
    }

    inc(): void {
        ++this.level;
    }

    dec(): void {
        --this.level;
    }

    setOldValue(index: number, type: VarType, value: number | string): void {
        this.olds[type][index] = value;
    }
    setNewValue(index: number, type: VarType, value: number | string): void {
        this.news[type][index] = value;
    }
    getNewValue(index: number, type: VarType): number | string {
        return this.news[type][index];
    }

    shouldClose(): boolean {
        return this._shouldClose;
    }

    hyperCall(hyp: Hyperbase): Promise<void> {
        return this.env.hyperCall(this.dir, hyp);
    }

    //#region Реализации функций.
    stratum_closeAll(): void {
        this._shouldClose = true;
    }

    stratum_openSchemeWindow(wname: string, className: string, attrib: string): number {
        return this.env.openSchemeWindow(this, wname, className, attrib);
    }

    stratum_async_loadSpaceWindow(wname: string, fileName: string, attrib: string): number | Promise<number> {
        return this.env.loadSpaceWindow(this, this.dir, wname, fileName, attrib);
    }

    stratum_async_createWindowEx(
        wname: string,
        parentWname: string,
        source: string,
        x: number,
        y: number,
        w: number,
        h: number,
        attrib: string
    ): number | Promise<number> {
        return this.env.createWindowEx(this, this.dir, wname, parentWname, source, x, y, w, h, attrib);
    }

    stratum_async_createDIB2d(hspace: number, fileName: string): number | Promise<number> {
        return this.env.createDIB2d(this.dir, hspace, fileName);
    }

    stratum_async_createDoubleDib2D(hspace: number, fileName: string): number | Promise<number> {
        return this.env.createDoubleDib2D(this.dir, hspace, fileName);
    }

    stratum_async_createObjectFromFile2D(hspace: number, fileName: string, x: number, y: number, flags: number): number | Promise<number> {
        return this.env.createObjectFromFile2D(this.dir, hspace, fileName, x, y, flags);
    }

    stratum_async_createStream(type: string, name: string, flags: string): number | Promise<number> {
        return this.env.createStream(this.dir, type, name, flags);
    }

    stratum_async_mSaveAs(q: number, fileName: string, flag: number): NumBool | Promise<NumBool> {
        return this.env.mSaveAs(this.dir, q, fileName, flag);
    }

    stratum_async_mLoad(q: number, fileName: string, flag: number): number | Promise<number> {
        return this.env.mLoad(this.dir, q, fileName, flag);
    }

    async stratum_async_createDir(name: string): Promise<NumBool> {
        const d = this.dir.dir(name);
        const res = await d.create();
        return res ? 1 : 0;
    }

    async stratum_async_fileExist(fileName: string): Promise<NumBool> {
        const f = this.dir.file(fileName);
        const r = await f.exist();
        return r ? 1 : 0;
    }

    stratum_getProjectDirectory(): string {
        return this.dir.path;
    }
    //#endregion
}
