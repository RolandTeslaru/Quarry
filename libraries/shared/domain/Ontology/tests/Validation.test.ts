import { describe, expect, it } from "vitest"
import type { ColumnSchema } from "../../Catalog/ColumnSchema"
import type { LinkType } from "../LinkType"
import type { ObjectType } from "../ObjectType"
import { Property } from "../Property"
import { Validation } from "../Validation"

const schema: ColumnSchema = {
    columns: [
        { name: "node_id",   type: "string",        nullable: true },
        { name: "valuation", type: "decimal(10,2)", nullable: true },
        { name: "age",       type: "long",          nullable: true },
    ],
    reader: { format: "parquet" },
}

describe("Validation: columns", () => {

    it("reads a column as a property of the same type; a decimal property takes any decimal(p,s)", () => {
        expect(Validation.isCompatible("string", "string")).toBe(true)
        expect(Validation.isCompatible("decimal", "decimal(10,2)")).toBe(true)
        expect(Validation.isCompatible("long", "integer")).toBe(false)
    })

    it("maps a column as ok, missing or incompatible — and anything as missing without a schema", () => {
        expect(Validation.getColumnHealth("string", "node_id", schema)).toBe("ok")
        expect(Validation.getColumnHealth("string", "address", schema)).toBe("missing-column")
        expect(Validation.getColumnHealth("string", "age", schema)).toBe("incompatible-type")
        expect(Validation.getColumnHealth("string", "node_id", null)).toBe("missing-column")
    })

})

describe("Property", () => {

    it("refuses an API name the API itself uses", () => {
        expect(Property.ApiName.safeParse("primaryKey").success).toBe(false)
        expect(Property.ApiName.safeParse("NodeId").success).toBe(false)
        expect(Property.ApiName.safeParse("nodeId").success).toBe(true)
    })
})

describe("Validation: object types", () => {

    const properties: ObjectType["properties"] = {
        nodeId:    { displayName: "Node ID", description: null, type: "string", column: "node_id" },
        valuation: { displayName: "Valuation", description: null, type: "decimal", column: "valuation" },
    }

    it("has no problems when its properties fit the schema and its key and title are among them", () => {
        expect(Validation.ObjectType.validate({ primaryKey: "nodeId", titleProperty: "nodeId", properties }, schema)).toEqual([])
    })

    it("names each problem: no schema, a primary key of the wrong type, a title that isn't a property", () => {
        expect(Validation.ObjectType.validate({ primaryKey: "valuation", titleProperty: "label", properties }, null)).toEqual([
            "The backing dataset has no columns: it has no data yet, holds raw files, or can't be read",
            "The primary key valuation is a decimal: it must be a string, integer, long",
            "The title label isn't one of its properties",
        ])
    })
})

describe("Validation: link types", () => {

    const officer = {
        rid: "ri.ontology.main.object-type.01a1d100-0000-7000-8000-000000000001",
        primaryKey: "nodeId",
        properties: {
            nodeId:   { displayName: "Node ID", description: null, type: "string", column: "node_id" },
            entityId: { displayName: "Entity ID", description: null, type: "string", column: "entity_id" },
            age:      { displayName: "Age", description: null, type: "long", column: "age" },
        },
    } as unknown as ObjectType
    const entity = {
        rid: "ri.ontology.main.object-type.01a1d100-0000-7000-8000-000000000002",
        primaryKey: "nodeId",
        properties: { nodeId: { displayName: "Node ID", description: null, type: "string", column: "node_id" } },
    } as unknown as ObjectType
    const context: Validation.LinkType.Context = { objectTypes: { [officer.rid]: officer, [entity.rid]: entity }, joinDatasetSchema: null }

    const sides = (aCardinality: LinkType.Side.Cardinality): LinkType["sides"] => ({
        a: { objectTypeRid: officer.rid, displayName: "Employer", apiName: "employer", cardinality: aCardinality },
        b: { objectTypeRid: entity.rid, displayName: "Employees", apiName: "employees", cardinality: "many" },
    })

    it("checks a foreign key against the primary key it points at", () => {
        const byEntityId = { sides: sides("one"), backing: { kind: "foreign-key" as const, foreignKey: { side: "a" as const, property: "entityId" } } }
        const byAge = { sides: sides("one"), backing: { kind: "foreign-key" as const, foreignKey: { side: "a" as const, property: "age" } } }

        expect(Validation.LinkType.getMappingHealth(byEntityId, context)).toEqual({ foreignKey: "ok" })
        expect(Validation.LinkType.getMappingHealth(byAge, context)).toEqual({ foreignKey: "incompatible-type" })
    })

    it("reads a join dataset's columns as missing without its schema", () => {
        const joined = { sides: sides("many"), backing: { kind: "dataset" as const, datasetRid: "ri.catalog.main.dataset.01a1d100-0000-7000-8000-000000000003" as never, columns: { a: "from_id", b: "to_id" } } }

        expect(Validation.LinkType.getMappingHealth(joined, context)).toEqual({ a: "missing-column", b: "missing-column" })
    })

    it("names the cardinality the foreign key's side must have, and a side named after a property or another link", () => {
        const definition = { sides: sides("many"), backing: { kind: "foreign-key" as const, foreignKey: { side: "a" as const, property: "entityId" } } }
        const taken = { [entity.rid]: new Set(["employees"]) }

        expect(Validation.LinkType.validate(definition, context, taken)).toEqual([
            "Side a holds the foreign key, so it leads to one object",
            "Side b: another link of its object type is already named employees",
        ])
    })
})
