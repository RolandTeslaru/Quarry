import * as DatasetMod from "./dataset"
import * as InternalMod from "./internal"

/** Catalog's HTTP surface — mirrors catalog.controller. */
export namespace API {
    export import Dataset = DatasetMod.Dataset
    /** System-worker-only endpoints (`/api/internal/…`). */
    export import Internal = InternalMod.Internal
}
