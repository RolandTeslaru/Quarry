import { describe, expect, it } from "vitest"
import { Job } from "./Job"

describe("Job", () => {

    it("lists its output transactions with their datasets", () => {
        const outputs = {
            "ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d2": "ri.catalog.main.transaction.01a1729a-975b-70de-8141-89cca28b34d3",
            "ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d4": "ri.catalog.main.transaction.01a1729a-975b-70de-8141-89cca28b34d5",
        } as Job.Schema["outputs"]

        expect(Job.getOutputTransactions({ outputs })).toEqual([
            { datasetRid: "ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d2", rid: "ri.catalog.main.transaction.01a1729a-975b-70de-8141-89cca28b34d3" },
            { datasetRid: "ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d4", rid: "ri.catalog.main.transaction.01a1729a-975b-70de-8141-89cca28b34d5" },
        ])
        expect(Job.getOutputTransactions({ outputs: {} })).toEqual([])
    })

    it("counts every status before an end as unfinished", () => {
        expect([...Job.UNFINISHED].sort()).toEqual(["queued", "running", "scheduled", "waiting"])
        expect(Job.Status.options.filter((status) => !Job.UNFINISHED.includes(status)).sort()).toEqual(["canceled", "failed", "succeeded"])
    })
})
