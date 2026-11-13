import { describe, expect, it } from "vitest"
import { Naming } from "../Naming"
import { ObjectType } from "../ObjectType"
import { Property } from "../Property"

describe("Naming", () => {

    it("splits at separators and where a lowercase letter meets a capital", () => {
        expect(Naming.getWords("flight_alert-id")).toEqual(["flight", "alert", "id"])
        expect(Naming.getWords("[Gena] Flight Alert")).toEqual(["Gena", "Flight", "Alert"])
        expect(Naming.getWords("incorporationDate")).toEqual(["incorporation", "Date"])
    })

    it("names a column for people", () => {
        expect(Naming.getDisplayName("flight_alert_id")).toBe("Flight Alert Id")
        expect(Naming.getDisplayName("ICIJ_ID")).toBe("Icij Id")
    })

    it("suggests API names the schemas accept", () => {
        expect(Naming.getPascalCase("[Gena] Flight Alert")).toBe("GenaFlightAlert")
        expect(Naming.getCamelCase("[Gena] [OFT] Flight")).toBe("genaOftFlight")
        expect(Naming.getPascalCase("2024 sales")).toBe("Sales")

        expect(ObjectType.ApiName.safeParse(Naming.getPascalCase("offshore entities")).success).toBe(true)
        expect(Property.ApiName.safeParse(Naming.getCamelCase("Incorporation date")).success).toBe(true)
    })

    it("suggests nothing for a name with no letters or digits", () => {
        expect(Naming.getCamelCase("—")).toBe("")
    })
})

describe("Property.getTypeOf", () => {

    it("reads a column's type as a property's; binary backs none", () => {
        expect(Property.getTypeOf("long")).toBe("long")
        expect(Property.getTypeOf("decimal(10,2)")).toBe("decimal")
        expect(Property.getTypeOf("binary")).toBe(null)
    })
})
