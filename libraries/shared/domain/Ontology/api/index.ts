import * as ObjectTypeMod from "./object-type"
import * as LinkTypeMod   from "./link-type"

/** The Ontology service's HTTP API, through the main server's proxy at /api/ontology. */
export namespace API {
    export import ObjectType = ObjectTypeMod.ObjectType
    export import LinkType   = LinkTypeMod.LinkType
}
