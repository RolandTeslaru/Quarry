import * as FileMod from "./File"

/** Object storage, shared by every service that keeps bytes: datasets now; uploads, attachments later. */
export namespace Storage {
    /** `Storage.File.Schema` (any format) and `Storage.File.Parquet.Schema` (one format). */
    export import File = FileMod.File
}
