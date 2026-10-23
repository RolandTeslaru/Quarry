import { Glyph, type GlyphDefinition } from './glyph/Glyph'
import { Header } from './header'
import { Home } from './home'
import { Content, LeftNav, LeftSidebar, RightSidebar, Root, useApp } from './layout'
import { Pending } from './pending'
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
    Home,
    Pending,
    useApp,
}

export namespace App {
    export type Definition = DefinitionD
    export type Glyph = GlyphDefinition
}
