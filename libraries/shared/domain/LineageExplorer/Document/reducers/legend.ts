import type { Legend } from "../../Legend"
import type { Document } from "../index"

export interface LegendReducers {
    setType:    (document: Document, type: Legend.Type) => void
    setVisible: (document: Document, isVisible: boolean) => void
}

export const legendReducers: LegendReducers = {
    setType: (d, type) => {
        d.legend.type = type
        d.isDirty = true
    },

    setVisible: (d, isVisible) => {
        d.legend.isVisible = isVisible
        d.isDirty = true
    },
}
