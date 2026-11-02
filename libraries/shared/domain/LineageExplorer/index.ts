import * as ExplorationMod from "./Exploration"
import * as ApiMod         from "./api"

/** The service behind saved explorations. Lineage itself is `Library.Lineage`. */
export namespace LineageExplorer {
    export import Exploration = ExplorationMod.Exploration

    export import API = ApiMod.API
}
