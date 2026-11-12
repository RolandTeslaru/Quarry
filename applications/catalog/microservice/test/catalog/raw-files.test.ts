import { Readable } from 'node:stream';
import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Foundations, type Dataset } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogHarness } from '../support/catalog-fixtures';

/** Raw files — JSON, one document or one per line — stored as uploaded with no schema, for a transform to read; as in Foundry. */
describe('raw files', () => {

    let harness: CatalogHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await CatalogHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    function file(filename: string, text: string) {
        return { filename, stream: Readable.from([text]) };
    }

    async function getView(datasetRid: Dataset.Rid) {
        return harness.transaction.resolveView(user, datasetRid, Foundations.MAIN_BRANCH);
    }

    it('a JSON lines upload is kept as a raw file: no schema, nothing to preview or sample', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);

        const uploaded = await harness.catalog.storage.upload(user, datasets.a, 'snapshot', file('entities.ftm.json', '{"id":"a"}\n{"id":"b"}\n'));
        const view = await getView(datasets.a);

        expect(uploaded.schema).toBeNull();
        expect(view).toMatchObject({ sequence: 1, schema: null, rowCount: null, files: [{ logicalPath: 'entities.ftm.json', format: 'json', rowCount: null }] });
        expect(await harness.catalog.storage.preview(user, datasets.a, 10)).toEqual({ schema: null, rows: [] });
        await expect(harness.catalog.storage.sample(user, datasets.a, 10)).rejects.toThrow(/raw files/);
    });

    it('appends more raw files of the same format — and refuses a CSV among them', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);

        await harness.catalog.storage.upload(user, datasets.a, 'snapshot', file('part-0.jsonl', '{"id":"a"}\n'));
        await harness.catalog.storage.upload(user, datasets.a, 'append', file('part-1.jsonl', '{"id":"b"}\n'));

        await expect(harness.catalog.storage.upload(user, datasets.a, 'append', file('part-2.csv', 'id\nc\n')))
            .rejects.toBeInstanceOf(BadRequestException);

        const view = await getView(datasets.a);

        expect(view.schema).toBeNull();
        expect(view.files.map((found) => found.logicalPath).sort()).toEqual(['part-0.jsonl', 'part-1.jsonl']);
    });

    it('a snapshot resets the schema: raw files after a CSV have none, a CSV after raw files has its own', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);

        await harness.catalog.storage.upload(user, datasets.a, 'snapshot', file('part-0.csv', 'id\n1\n'));
        await harness.catalog.storage.upload(user, datasets.a, 'snapshot', file('part-0.json', '[{"id":1}]'));

        expect((await getView(datasets.a)).schema).toBeNull();

        await harness.catalog.storage.upload(user, datasets.a, 'snapshot', file('part-1.csv', 'name\nx\n'));

        expect((await getView(datasets.a)).schema?.columns.map((column) => column.name)).toEqual(['name']);
    });

    it('a raw dataset\'s schema can\'t be set: its files aren\'t read as a table', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);

        await harness.catalog.storage.upload(user, datasets.a, 'snapshot', file('part-0.json', '{"id":1}'));

        await expect(harness.catalog.storage.setSchema(user, datasets.a, {
            columns: [{ name: 'id', type: 'long', nullable: true }],
            reader:  { format: 'csv', delimiter: ',', quote: '"', escape: '"', header: true },
        })).rejects.toBeInstanceOf(BadRequestException);
    });
});
