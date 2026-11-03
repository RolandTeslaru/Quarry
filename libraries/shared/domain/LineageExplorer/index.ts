import * as ExplorationMod from "./Exploration"
import * as GraphMod       from "./Graph"
import * as ApiMod         from "./api"

/** The service behind saved explorations. Lineage itself is `Library.Lineage`. */
export namespace LineageExplorer {
    export import Exploration = ExplorationMod.Exploration
    export import Graph       = GraphMod.Graph

    export import API = ApiMod.API
}
