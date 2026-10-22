import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Resource as ResourceD } from "../../Library/Resource"
import { ColumnSchema } from "../ColumnSchema"
import { Dataset as DatasetD } from "../Dataset"

export namespace Dataset {

    /** Creating a dataset = writing into its parent folder. */
    export namespace Create {
        export const Request = z.object({
            parentRid:   ResourceD.Rid,
            name:        ResourceD.Name,
            description: z.string().nullable().default(null),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ dataset: DatasetD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    /** Every live dataset the caller can discover, across projects — the dataset app's home. */
    export namespace List {
        export const Response = z.object({ datasets: DatasetD.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Get {
        export const Response = z.object({ dataset: DatasetD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    /** The file set at `sequence` (default: latest) on branch main. Needs read. */
    export namespace GetView {
        export const Query = z.object({ sequence: z.coerce.number().int().positive().optional() })
        export type  Query = z.infer<typeof Query>

        export const Response = z.object({ view: DatasetD.View.Schema })
        export type  Response = z.infer<typeof Response>
    }

    /**
     * A CSV or Parquet file, stored as uploaded (Foundry's model): one transaction
     * holding the file, with a schema inferred from it — for CSV, its columns and
     * how to parse it. multipart/form-data; the fields come before `file`.
     */
    export namespace Upload {
        /** Into a new dataset (`POST /datasets/upload`) — named after the file unless `name` is given. Needs write on the parent. */
        export const NewFields = z.object({
            parentRid:   ResourceD.Rid,
            name:        ResourceD.Name.optional(),
            description: z.string().nullable().default(null),
        })
        export type  NewFields = z.infer<typeof NewFields>

        /**
         * Into an existing dataset (`POST /datasets/:rid/upload`). Snapshot replaces
         * its files and schema; append adds the file, which must match the schema.
         */
        export const Fields = z.object({ mode: z.enum(["snapshot", "append"]).default("snapshot") })
        export type  Fields = z.infer<typeof Fields>

        export const Response = z.object({ dataset: DatasetD.Schema, schema: ColumnSchema.Schema })
        export type  Response = z.infer<typeof Response>
    }

    /** The first rows of the latest view, read with its schema. Needs read. */
    export namespace Preview {
        export const Query = z.object({ limit: z.coerce.number().int().min(1).max(1000).default(100) })
        export type  Query = z.infer<typeof Query>

        export const Response = z.object({
            schema: ColumnSchema.Schema.nullable(),                 // null: nothing committed yet
            rows:   z.unknown().array().array(),                    // one array per row, in column order, JSON-safe
        })
        export type  Response = z.infer<typeof Response>
    }

    /** Replaces the schema — fix an inferred type or a CSV option. A transaction that changes no files. Needs write. */
    export namespace SetSchema {
        export const Request  = z.object({ schema: ColumnSchema.Schema })
        export type  Request  = z.infer<typeof Request>
        export const Response = z.object({ sequence: z.number().int() })
        export type  Response = z.infer<typeof Response>
    }

    export async function list(api: AxiosInstance): Promise<List.Response> {
        const { data } = await api.get("/api/datasets")
        return List.Response.parse(data)
    }

    export async function create(api: AxiosInstance, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post("/api/datasets", req)
        return Create.Response.parse(data)
    }

    export async function get(api: AxiosInstance, rid: DatasetD.Rid): Promise<Get.Response> {
        const { data } = await api.get(`/api/datasets/${rid}`)
        return Get.Response.parse(data)
    }

    export async function getView(api: AxiosInstance, rid: DatasetD.Rid, query: GetView.Query = {}): Promise<GetView.Response> {
        const { data } = await api.get(`/api/datasets/${rid}/view`, { params: query })
        return GetView.Response.parse(data)
    }

    /** Uploads have no size cap, so no request timeout either (the client's default would cut large files off). */
    const UPLOAD_TIMEOUT_MS = 0

    export async function createFromFile(api: AxiosInstance, fields: z.input<typeof Upload.NewFields>, file: Blob, filename: string): Promise<Upload.Response> {
        const { data } = await api.post("/api/datasets/upload", formData(fields, file, filename), { timeout: UPLOAD_TIMEOUT_MS })
        return Upload.Response.parse(data)
    }

    export async function upload(api: AxiosInstance, rid: DatasetD.Rid, fields: z.input<typeof Upload.Fields>, file: Blob, filename: string): Promise<Upload.Response> {
        const { data } = await api.post(`/api/datasets/${rid}/upload`, formData(fields, file, filename), { timeout: UPLOAD_TIMEOUT_MS })
        return Upload.Response.parse(data)
    }

    export async function preview(api: AxiosInstance, rid: DatasetD.Rid, query: z.input<typeof Preview.Query> = {}): Promise<Preview.Response> {
        const { data } = await api.get(`/api/datasets/${rid}/preview`, { params: query })
        return Preview.Response.parse(data)
    }

    export async function setSchema(api: AxiosInstance, rid: DatasetD.Rid, req: SetSchema.Request): Promise<SetSchema.Response> {
        const { data } = await api.put(`/api/datasets/${rid}/schema`, req)
        return SetSchema.Response.parse(data)
    }

    /** Fields first, then the file — the server reads them in that order. */
    function formData(fields: Record<string, unknown>, file: Blob, filename: string): FormData {
        const form = new FormData()

        for (const [key, value] of Object.entries(fields))
            if (value !== undefined && value !== null)
                form.append(key, String(value))

        form.append("file", file, filename)

        return form
    }
}
