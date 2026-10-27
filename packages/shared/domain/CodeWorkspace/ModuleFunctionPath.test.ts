import { describe, expect, it } from "vitest"
import { ModuleFunctionPath } from "./ModuleFunctionPath"

describe("ModuleFunctionPath", () => {

    const path = ModuleFunctionPath.Schema.parse("sales_cleaning.datasets.example.example")

    it("splits into module and function", () => {
        expect(ModuleFunctionPath.getModuleName(path)).toBe("sales_cleaning.datasets.example")
        expect(ModuleFunctionPath.getFunctionName(path)).toBe("example")
    })

    it.each(["clean", "pkg..fn", ".pkg.fn", "pkg.fn.", "pkg.1fn", "pkg.fn-x"])("refuses %j", (value) => {
        expect(ModuleFunctionPath.Schema.safeParse(value).success).toBe(false)
    })

    it.each(["pkg.fn", "_private.mod._fn", "a.b.c.d"])("accepts %s", (value) => {
        expect(ModuleFunctionPath.Schema.safeParse(value).success).toBe(true)
    })
})
