import { Injectable } from '@nestjs/common';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { requireEnv } from '@/db/table';

/** What a bucket listing knows about an object — its key and size, not its format's metadata. */
export interface StoredObject {
    key:   string;
    bytes: number;
}

/**
 * The bucket behind `Storage.File`s: write-once objects by key, over the S3 API —
 * MinIO locally, any S3-compatible store in production. Listing and deleting go
 * through here; DuckDB reads and writes the bytes directly (`url`, `settings`).
 */
@Injectable()
export class FileStorage {

    private client: S3Client | undefined;

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

    /** `s3://bucket/key` — how DuckDB addresses a file. */
    url(key: string): string {
        return `s3://${this.bucket}/${key}`;
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
                    objects.push({ key: object.Key, bytes: object.Size ?? 0 });

            token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token);

        return objects;
    }

    async delete(keys: string[]): Promise<void> {
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

    private s3(): S3Client {
        const { endpoint, useSsl, region, accessKey, secretKey } = this.settings;

        return (this.client ??= new S3Client({
            endpoint:       `${useSsl ? 'https' : 'http'}://${endpoint}`,
            region,
            credentials:    { accessKeyId: accessKey, secretAccessKey: secretKey },
            forcePathStyle: true,                     // MinIO
        }));
    }
}
