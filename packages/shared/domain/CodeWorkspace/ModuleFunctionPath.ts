import { z } from "zod"

/** A transform's name: `sales_cleaning.datasets.example.example`. */
export namespace ModuleFunctionPath {

    export const Schema = z.string()
        .regex(/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)+$/, "Not a module.function path")
        .brand("CodeWorkspace.ModuleFunctionPath")
    export type Schema = z.infer<typeof Schema>

    /** `sales_cleaning.datasets.example.example` → `sales_cleaning.datasets.example` */
    export const getModuleName = (path: Schema): string => path.slice(0, path.lastIndexOf("."))

    /** `sales_cleaning.datasets.example.example` → `example` */
    export const getFunctionName = (path: Schema): string => path.slice(path.lastIndexOf(".") + 1)
}
