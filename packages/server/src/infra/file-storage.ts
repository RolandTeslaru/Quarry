import { Transform, type Readable } from 'node:stream';
import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Storage } from '@quarry/shared/domain';
import { requireEnv } from '@/db/table';

/** How long a pass works: as long as the job token it's handed out with. */
const PASS_TTL_SECONDS = 12 * 60 * 60;

/** What a bucket listing knows about an object — its key and size, not its format's metadata. */
export interface StoredObject {
    key:   Storage.File.Key;
    bytes: number;
}

/**
 * The bucket behind `Storage.File`s: write-once objects by key, over the S3 API —
 * SeaweedFS locally, any S3-compatible store in production. Listing and deleting go
 * through here; DuckDB reads and writes the bytes directly (`url`, `settings`).
 */
@Injectable()
export class FileStorage {

    private client: S3Client | undefined;

    private jobClient: S3Client | undefined;

    get bucket(): string {
        return requireEnv('S3_BUCKET');
    }

    /** Connection settings, for engines that talk to the store directly (DuckDB). */
    get settings() {
        const endpoint = new URL(requireEnv('S3_ENDPOINT'));

        return {
            endpoint:  endpoint.host,                 // host:port, no scheme
            useSsl:    endpoint.protocol === 'https:',
            region:    process.env.S3_REGION ?? 'us-east-1',
            accessKey: requireEnv('S3_ACCESS_KEY'),
            secretKey: requireEnv('S3_SECRET_KEY'),
            bucket:    this.bucket,
        };
    }

    /** `s3://bucket/path` — how DuckDB addresses a file (a key), or a folder to write into (a prefix). */
    url(path: string): string {
        return `s3://${this.bucket}/${path}`;
    }

    /**
     * Streams `body` to `key` — multipart, never held in memory — and returns
     * its size. QUARRY_UPLOAD_MAX_BYTES, if set, caps it (413); unset, there's no cap.
     */
    async upload(key: Storage.File.Key, body: Readable, contentType: string): Promise<StoredObject> {
        const max = process.env.QUARRY_UPLOAD_MAX_BYTES ? Number(process.env.QUARRY_UPLOAD_MAX_BYTES) : Infinity;
        let bytes = 0;

        const counted = body.pipe(new Transform({
            transform(chunk: Buffer, _encoding, done) {
                bytes += chunk.length;
                done(bytes > max ? new PayloadTooLargeException(`Files are limited to ${max} bytes`) : null, chunk);
            },
        }));

        body.on('error', (error) => counted.destroy(error));

        await new Upload({
            client: this.s3(),
            params: { Bucket: this.bucket, Key: key, Body: counted, ContentType: contentType },
        }).done();

        return { key, bytes };
    }

    /**
     * A URL that reads `key` without credentials until it expires. Signed for storage as job containers
     * reach it (STORAGE_ENDPOINT, the agent's machine by default): the host is part of the signature.
     */
    async presignGet(key: Storage.File.Key): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key:    key,
        });

        return getSignedUrl(this.forJobs(), command, { expiresIn: PASS_TTL_SECONDS });
    }

    /** A URL that writes `key` with one PUT (up to 5 GB) without credentials until it expires — signed like `presignGet`. */
    async presignPut(key: Storage.File.Key): Promise<string> {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key:    key,
        });

        return getSignedUrl(this.forJobs(), command, { expiresIn: PASS_TTL_SECONDS });
    }

    async list(prefix: string): Promise<StoredObject[]> {
        const objects: StoredObject[] = [];
        let token: string | undefined;

        do {
            const page = await this.s3().send(new ListObjectsV2Command({
                Bucket:            this.bucket,
                Prefix:            prefix,
                ContinuationToken: token,
            }));

            for (const object of page.Contents ?? [])
                if (object.Key)
                    objects.push({ key: Storage.File.Key.parse(object.Key), bytes: object.Size ?? 0 });

            token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token);

        return objects;
    }

    async delete(keys: Storage.File.Key[]): Promise<void> {
        for (let i = 0; i < keys.length; i += 1000)
            await this.s3().send(new DeleteObjectsCommand({
                Bucket: this.bucket,
                Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
            }));
    }

    async deletePrefix(prefix: string): Promise<number> {
        const keys = (await this.list(prefix)).map((object) => object.key);

        await this.delete(keys);

        return keys.length;
    }

    /** The client that signs for job containers: STORAGE_ENDPOINT, the host they reach storage by. */
    private forJobs(): S3Client {
        const { region, accessKey, secretKey } = this.settings;

        return (this.jobClient ??= new S3Client({
            endpoint:       process.env.STORAGE_ENDPOINT ?? 'http://host.docker.internal:9000',
            region,
            credentials:    { accessKeyId: accessKey, secretAccessKey: secretKey },
            forcePathStyle: true,
        }));
    }

    private s3(): S3Client {
        const { endpoint, useSsl, region, accessKey, secretKey } = this.settings;

        return (this.client ??= new S3Client({
            endpoint:       `${useSsl ? 'https' : 'http'}://${endpoint}`,
            region,
            credentials:    { accessKeyId: accessKey, secretAccessKey: secretKey },
            forcePathStyle: true,                     // bucket in the path, not the hostname — what self-hosted S3 stores expect
        }));
    }
}
