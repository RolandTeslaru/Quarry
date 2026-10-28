import { describe, expect, it } from "vitest"
import { Job } from "./Job"
import { Queue } from "./queue"
import { DurableQueue } from "./durable-queue"

describe("Queue.RunJob", () => {

    it("names a BullMQ job by job and attempt — no colon, which BullMQ refuses", () => {
        const jobRid = Job.createRid()
        const id = Queue.RunJob.getJobId({ jobRid, attempt: 2 })

        expect(id).toBe(`${jobRid}_2`)
        expect(id).not.toContain(":")
    })

    it("gives each attempt its own id, so a retry isn't swallowed as a duplicate", () => {
        const jobRid = Job.createRid()

        expect(Queue.RunJob.getJobId({ jobRid, attempt: 1 })).not.toBe(Queue.RunJob.getJobId({ jobRid, attempt: 2 }))
    })

    it("only carries a job and a positive attempt", () => {
        expect(Queue.RunJob.Job.safeParse({ jobRid: Job.createRid(), attempt: 0 }).success).toBe(false)
        expect(Queue.RunJob.Job.safeParse({ jobRid: "ri.forge.main.build.01a1729a-975b-70de-8141-89cca28b34d2", attempt: 1 }).success).toBe(false)
    })

    it("names its queue <service>.<job>", () => {
        expect(Queue.RunJob.Definition.name).toBe("forge.run-job")
    })

    it("delivers it through a durable queue of the same name", () => {
        expect(DurableQueue.RunJob.name).toBe("forge.run-job")
        expect(DurableQueue.RunJob.queue).toBe(Queue.RunJob.Definition)
    })
})
