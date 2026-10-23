import { BadRequestException } from '@nestjs/common';
import busboy from 'busboy';
import type { Request } from 'express';
import type { z } from 'zod';
import type { IncomingFile } from '@/services/Catalog/storage/catalog-storage.service';

/**
 * Reads a multipart upload without buffering it: the text fields (validated
 * against `Fields`, like a ZodPipe body) and one file named `file`, handed over
 * as a stream the moment it starts. Fields must come before the file — the
 * shared clients send them in that order.
 */
export function readUpload<T extends z.ZodType>(request: Request, Fields: T): Promise<{ fields: z.output<T>; file: IncomingFile }> {
    return new Promise((resolve, reject) => {
        let parser: busboy.Busboy;

        try {
            parser = busboy({ headers: request.headers, limits: { files: 1 } });
        }
        catch {
            reject(new BadRequestException('Expected multipart/form-data'));
            return;
        }

        const raw: Record<string, string> = {};
        let settled = false;

        const fail = (error: Error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        };

        parser.on('field', (name, value) => {
            raw[name] = value;
        });

        parser.on('file', (name, stream, info) => {
            if (name !== 'file' || settled) {
                stream.resume();
                return;
            }

            const fields = Fields.safeParse(raw);

            if (!fields.success) {
                stream.resume();
                fail(new BadRequestException({
                    message: 'Invalid request',
                    issues:  fields.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
                }));
                return;
            }

            settled = true;
            resolve({ fields: fields.data, file: { filename: info.filename, stream } });
        });

        parser.on('error', () => fail(new BadRequestException('Malformed upload')));
        parser.on('close', () => fail(new BadRequestException('No file: send it as the form field "file", after the other fields')));

        request.pipe(parser);
    });
}
