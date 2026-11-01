import { sql, type Kysely } from 'kysely';

/**
 * The services' database logins, from their connection URLs — after the migrations have created
 * the roles (catalog/001_initial.sql). For dev and tests: in production the infrastructure creates
 * them, and the main server's role needn't be allowed to. Nothing to do for a service whose URL
 * isn't set.
 */
export async function setServiceLogins(database: Kysely<unknown>): Promise<void> {
    const catalog = process.env.CATALOG_DATABASE_URL;

    if (!catalog)
        return;

    const { username, password } = new URL(catalog);

    if (username !== 'catalog_service')
        throw new Error(`CATALOG_DATABASE_URL must log in as catalog_service, not ${username}`);

    // ALTER ROLE takes no parameters: the password goes in as a quoted literal.
    await sql`alter role catalog_service with login password ${sql.lit(decodeURIComponent(password))}`.execute(database);
}
