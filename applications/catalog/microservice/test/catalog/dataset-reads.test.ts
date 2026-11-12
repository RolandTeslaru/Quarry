import { Readable } from 'node:stream';
import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogHarness } from '../support/catalog-fixtures';

/** What a dataset's page reads about it beyond its rows: the latest version's transaction, and each column's nulls and distinct values. */
describe('a dataset\'s page reads', () => {

    let harness: CatalogHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await CatalogHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    /** A CSV upload; an appended file needs a name of its own. */
    function csv(filename: string, text: string) {
        return { filename, stream: Readable.from([text]) };
    }

    it('the latest transaction: none before the first commit, then the newest — its type, who and how', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);

        expect(await harness.catalog.getLatestTransaction(user, datasets.a)).toBeNull();

        await harness.catalog.storage.upload(user, datasets.a, 'snapshot', csv('part-0.csv', 'n\n1\n'));
        await harness.catalog.storage.upload(user, datasets.a, 'append', csv('part-1.csv', 'n\n2\n'));

        expect(await harness.catalog.getLatestTransaction(user, datasets.a)).toMatchObject({
            type:      'append',
            status:    'committed',
            sequence:  2,
            startedBy: user.userRid,
        });
    });

    it('column stats over every file: rows, nulls and distinct values per column', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);

        await harness.catalog.storage.upload(user, datasets.a, 'snapshot', csv('part-0.csv', 'id,country\n1,PAN\n2,\n3,PAN\n'));
        await harness.catalog.storage.upload(user, datasets.a, 'append', csv('part-1.csv', 'id,country\n4,HKG\n'));

        expect(await harness.catalog.storage.getColumnStats(user, datasets.a)).toEqual({
            sequence: 2,
            rowCount: 4,
            columns:  {
                id:      { nullCount: 0, distinctCount: 4 },
                country: { nullCount: 1, distinctCount: 2 },
            },
        });
    });

    it('column stats before any data: no rows, no columns', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);

        expect(await harness.catalog.storage.getColumnStats(user, datasets.a)).toEqual({ sequence: 0, rowCount: 0, columns: {} });
    });

    it('a preview with a draft schema reads the files that way, commits nothing — and names why when they don\'t read', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);
        const { schema } = await harness.catalog.storage.upload(user, datasets.a, 'snapshot', csv('part-0.csv', 'id,role\n1,"owner, director"\n'));

        if (!schema)
            throw new Error('A CSV upload has a schema');

        const asText = { ...schema, columns: [{ name: 'id', type: 'string' as const, nullable: true }, schema.columns[1]] };

        expect(await harness.catalog.storage.previewWithSchema(user, datasets.a, asText, 10)).toEqual({ schema: asText, rows: [['1', 'owner, director']] });

        const unquoted = { ...schema, reader: { ...schema.reader, quote: '', escape: '' } };

        await expect(harness.catalog.storage.previewWithSchema(user, datasets.a, unquoted, 10)).rejects.toBeInstanceOf(BadRequestException);
        expect((await harness.catalog.getLatestTransaction(user, datasets.a))?.sequence).toBe(1);
    });
});
