import * as OntologyMod   from "./Ontology"
import * as ObjectTypeMod from "./ObjectType"
import * as PropertyMod   from "./Property"
import * as LinkTypeMod   from "./LinkType"
import * as ValidationMod from "./Validation"
import * as ApiMod        from "./api"

/** Quarry's model of the world on top of datasets: its types (docs/design/ontology.md). One ontology per deployment. */
export namespace Ontology {
    export import Rid         = OntologyMod.Ontology.Rid
    export import DEFAULT_RID = OntologyMod.Ontology.DEFAULT_RID
    export import Schema      = OntologyMod.Ontology.Schema

    export import ObjectType = ObjectTypeMod.ObjectType
    export import Property   = PropertyMod.Property
    export import LinkType   = LinkTypeMod.LinkType
    export import Validation = ValidationMod.Validation

    export import API = ApiMod.API
}
export type Ontology = OntologyMod.Ontology
