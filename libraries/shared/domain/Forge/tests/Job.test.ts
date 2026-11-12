import { describe, expect, it } from "vitest"
import { Job } from "../Job"

describe("Job", () => {

    it("gathers several jobs' dataset outputs' transactions by dataset", () => {
        const first: Job["outputs"] = {
            "ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d2": { kind: "dataset", transactionRid: "ri.catalog.main.transaction.01a1729a-975b-70de-8141-89cca28b34d3" },
        } as Job["outputs"]
        const second: Job["outputs"] = {
            "ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d4": { kind: "dataset", transactionRid: "ri.catalog.main.transaction.01a1729a-975b-70de-8141-89cca28b34d5" },
        } as Job["outputs"]

        expect(Job.getOutputTransactions([{ outputs: first }, { outputs: second }])).toEqual({
            "ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d2": "ri.catalog.main.transaction.01a1729a-975b-70de-8141-89cca28b34d3",
            "ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d4": "ri.catalog.main.transaction.01a1729a-975b-70de-8141-89cca28b34d5",
        })
        expect(Job.getOutputTransactions([{ outputs: {} }])).toEqual({})
    })

    it("counts every status before an end as unfinished", () => {
        expect([...Job.UNFINISHED].sort()).toEqual(["running", "scheduled", "waiting"])
        expect(Job.Status.options.filter((status) => !Job.UNFINISHED.includes(status)).sort()).toEqual(["canceled", "failed", "succeeded"])
    })
})
