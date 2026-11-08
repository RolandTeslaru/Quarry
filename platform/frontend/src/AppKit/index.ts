import { Glyph, type GlyphDefinition } from './glyph/Glyph'
import { Nav } from './nav'
import { Background, Content, LeftNav, LeftSidebar, Overlay, RightSidebar, Root, SafeArea, useApp } from './layout'
import { Pending } from './pending'
import { Toolbar } from './toolbar'
import type { Definition as DefinitionD } from './definition'

export { Home } from './home'

/** Quarry's app design language: every app's layout is built from these parts. */
export const App = {
    Root,
    Background,
    SafeArea,
    Overlay,
    Nav,
    Toolbar,
    LeftNav,
    LeftSidebar,
    RightSidebar,
    Content,
    Glyph,
    Pending,
    useApp,
}

export namespace App {
    export type Definition = DefinitionD
    export type Glyph = GlyphDefinition
}
