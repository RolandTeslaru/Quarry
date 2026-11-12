import { z } from 'zod';
import { Dataset, Ontology } from '@quarry/shared/domain';
import { defineDatabase } from '@quarry/platform-kernel/db/pool';
import type { Table } from '@quarry/platform-kernel/db/table';
import type { IdentityDB } from '@quarry/platform-kernel/services/Identity/identity.db';
import { LibraryDB } from '@quarry/platform-kernel/services/Library/library.db';

/** The `ontology` schema: object types and link types, each with its library row. */
export namespace OntologyDB {

    export namespace ObjectType {
        /** A property as stored: jsonb keeps no key order, so properties are a list with their API names. */
        export const PropertyRow = Ontology.Property.Schema.extend({ apiName: Ontology.Property.ApiName });
        export type  PropertyRow = z.infer<typeof PropertyRow>;

        export const Row = z.object({
            rid:                 Ontology.ObjectType.Rid,
            type:                z.literal('object-type'),
            ontology_rid:        Ontology.Rid,
            api_name:            Ontology.ObjectType.ApiName,
            plural_display_name: z.string(),
            ui:                  Ontology.ObjectType.Ui,
            backing_dataset_rid: Dataset.Rid,
            primary_key:         Ontology.Property.ApiName,
            title_property:      Ontology.Property.ApiName,
            properties:          PropertyRow.array(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row, resource: LibraryDB.Resource.Row) => {
            const properties: Ontology.ObjectType['properties'] = {};

            for (const { apiName, ...property } of row.properties)
                properties[apiName] = property;

            return Ontology.ObjectType.Schema.parse({
                ...LibraryDB.Resource.toBase(resource),
                ontologyRid:       row.ontology_rid,
                apiName:           row.api_name,
                pluralDisplayName: row.plural_display_name,
                ui:                row.ui,
                backingDatasetRid: row.backing_dataset_rid,
                primaryKey:        row.primary_key,
                titleProperty:     row.title_property,
                properties,
            });
        };

        /** A row as reads select it: joined with its library row. */
        export type Joined = LibraryDB.Resource.Row & Omit<Row, 'rid' | 'type'>;

        export const fromJoined = (joined: Joined) => {
            const { ontology_rid, api_name, plural_display_name, ui, backing_dataset_rid, primary_key, title_property, properties, ...resource } = joined;

            return toDomain({
                rid:  resource.rid as Ontology.ObjectType.Rid,
                type: 'object-type',
                ontology_rid, api_name, plural_display_name, ui, backing_dataset_rid, primary_key, title_property, properties,
            }, resource);
        };

        /** Its properties as stored, in display order. */
        export function toPropertyRows(properties: Ontology.ObjectType['properties']): PropertyRow[] {
            const rows: PropertyRow[] = [];

            for (const apiName of Object.keys(properties))
                rows.push({ apiName, ...properties[apiName] });

            return rows;
        }
    }

    export namespace LinkType {
        /** A side as stored: its object type is a column of its own. */
        export const SideRow = Ontology.LinkType.Side.Schema.omit({ objectTypeRid: true });
        export type  SideRow = z.infer<typeof SideRow>;

        export const Row = z.object({
            rid:               Ontology.LinkType.Rid,
            type:              z.literal('link-type'),
            ontology_rid:      Ontology.Rid,
            a_object_type_rid: Ontology.ObjectType.Rid,
            b_object_type_rid: Ontology.ObjectType.Rid,
            sides:             z.object({ a: SideRow, b: SideRow }),
            backing:           Ontology.LinkType.Backing.Schema,
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row, resource: LibraryDB.Resource.Row) => Ontology.LinkType.Schema.parse({
            ...LibraryDB.Resource.toBase(resource),
            ontologyRid: row.ontology_rid,
            sides: {
                a: { ...row.sides.a, objectTypeRid: row.a_object_type_rid },
                b: { ...row.sides.b, objectTypeRid: row.b_object_type_rid },
            },
            backing: row.backing,
        });

        /** A row as reads select it: joined with its library row. */
        export type Joined = LibraryDB.Resource.Row & Omit<Row, 'rid' | 'type'>;

        export const fromJoined = (joined: Joined) => {
            const { ontology_rid, a_object_type_rid, b_object_type_rid, sides, backing, ...resource } = joined;

            return toDomain({
                rid:  resource.rid as Ontology.LinkType.Rid,
                type: 'link-type',
                ontology_rid, a_object_type_rid, b_object_type_rid, sides, backing,
            }, resource);
        };

        /** Its sides as stored: their object types go in their own columns. */
        export function toSideRows(sides: Ontology.LinkType['sides']): Row['sides'] {
            const { objectTypeRid: _a, ...a } = sides.a;
            const { objectTypeRid: _b, ...b } = sides.b;

            return { a, b };
        }
    }

    export interface Tables {
        'ontology.object_type': Table<typeof ObjectType.Row, 'type'>;
        'ontology.link_type':   Table<typeof LinkType.Row, 'type'>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables & IdentityDB.ReadTables>();
}
