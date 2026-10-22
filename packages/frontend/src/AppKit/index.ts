import { Glyph, type GlyphDefinition } from './glyph/Glyph'
import { Header } from './header'
import { Content, LeftNav, LeftSidebar, RightSidebar, Root } from './layout'
import type { Definition as DefinitionD } from './definition'

/** Quarry's app design language: every app's layout is built from these parts. */
export const App = {
    Root,
    Header,
    LeftNav,
    LeftSidebar,
    RightSidebar,
    Content,
    Glyph,
}

export namespace App {
    export type Definition = DefinitionD
    export type Glyph = GlyphDefinition
}
