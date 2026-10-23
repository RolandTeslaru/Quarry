# Keychain — Credentials

_Draft, 2026-10-21. Tables are in [database.md](database.md#5b-keychain); permissions in [gatekeeper.md](gatekeeper.md); the sources that use credentials in [data-connection.md](data-connection.md). Ported from PretzelGraph's Vault (`Vault.Credential.Template` / `Vault.Credential.Instance`); the name **Vault** is kept for a future file encrypter._

Keychain holds **logins to external systems** — a Postgres host, user and password; later an SAP or S3 login. A source names the credential it logs in with; the Data Connection worker decrypts it for runs and probes.

---

## 1. Model

| Concept | Where it lives | What it is |
|---|---|---|
| **`Keychain.Credential.Template`** | code — `integrations/<System>/credential.ts` | What a credential of one kind holds: id, display name, icon, `Fields` (a zod object, served as JSON Schema). Named by the source definition (`credential: …`), like a PretzelGraph blueprint's `credentials`. Never created at runtime. |
| **`Keychain.Credential`** | a library resource, `ri.keychain.main.credential.…` | One login: a template id and its values, encrypted as one blob. Project scoped (its parent is a project or folder). |
| `Keychain.Credential.Blob` | `keychain.credential.blob` | Every value, encrypted together: `keyId:iv:authTag:ciphertext` (hex). |
| `Keychain.Credential.Values` | memory only | The decrypted values, parsed against the template's Fields. |
| `Keychain.Credential.Encrypted` | job payloads, `/internal` responses | `{ rid, templateId, blob }` — what the Data Connection worker receives. |

A credential holds **the whole login** (PretzelGraph style): host, port, database, user, password, SSL. A source of that type has no connection settings of its own, so one credential can back several sources.

```ts
// integrations/Postgres/credential.ts
export const Credential = defineCredential({
  id: 'postgres', displayName: 'PostgreSQL', icon: 'postgres',
  Fields: z.object({
    host, port, database, user,
    password: z.string().default('').meta({ title: 'Password', secret: true }),   // secret → a masked input
    ssl,
  }),
});

// integrations/Postgres/definition.ts
defineSource({ id: 'postgres', …, credential: Credential, Config: z.object({}), sync: … });
```

`CREDENTIAL_TEMPLATES` (in `@quarry/integrations/definitions`) collects the templates the definitions name; two different templates with one id fail at load.

---

## 2. A resource the explorer hides

Credentials are **library resources** — so names, the tree, trash, liveness and Gatekeeper grants are the same as for everything else — of type `credential`, whose `library.resource_type.show_in_explorer` is `false`. The library explorer's listings (`children`) skip them; the **Keychain app** lists them (`GET /api/keychain/credentials`) across every project the caller can discover.

Renaming, moving, trashing and sharing go through the usual Library and Gatekeeper endpoints. A trashed credential reads as absent: sources using it fail their tests and runs with *Not found*. It can't be hard-deleted while a source names it (FK, `ON DELETE RESTRICT`).

---

## 3. Permissions

| Action | Needs | Notes |
|---|---|---|
| See it in Keychain, get it | **discover** | |
| Create it | **write** on the project or folder | |
| **Use** it — name it on a new source; a test, explore or run of that source | **read** | Checked every time the server hands it to the worker — as the requester (probes) or the run's delegate (runs). Losing read stops the source's next run. |
| Change its values | **write** | Replaces all values; the form sends what reveal returned. |
| **Reveal** its values | **write** (editor, owner) | Logged. Viewers can use a credential without ever seeing it. |
| Share it | **manage** | Gatekeeper grants, as for any resource. |

Grants on the project or folder it sits in apply to it, like any resource.

---

## 4. Encryption

`@quarry/shared/server/encryption.ts` — server-only code in the shared package, so the server and the Data Connection worker can't drift apart:

- **AES-256-GCM**, one random 12-byte IV per encryption; all values encrypted together as one JSON payload.
- **One key per workspace**: `QUARRY_ENCRYPTION_KEY`, 64 hex chars (`openssl rand -hex 32`), set on the **server** (encrypts on create/update, decrypts to reveal) and the **Data Connection worker** (decrypts for runs and probes). Both check it at boot.
- The blob starts with a **key id** — the first 8 hex chars of the key's SHA-256 — so a blob written with another key fails legibly ("No encryption key with id …") instead of as tampering. Rotation would make this a lookup in a key set.
- Authenticated: a wrong key and a tampered blob both fail; neither is mistaken for data.

**Where plain text exists:** the browser (the form, a reveal), the server's memory during create/update/reveal, and the Data Connection worker's memory during a run or probe. **Never** in Postgres, Redis, a job payload or a log.

---

## 5. API

| Method | Path | |
|---|---|---|
| `GET` | `/api/keychain/templates` | Every template, Fields as JSON Schema |
| `GET` | `/api/keychain/credentials?templateId=` | Credentials the caller can discover (optionally of one template — a source form's picker) |
| `POST` | `/api/keychain/credentials` | `{ parentRid, name, description, templateId, values }` |
| `GET` | `/api/keychain/credentials/:rid` | Never the values |
| `PUT` | `/api/keychain/credentials/:rid/values` | `{ values }` — write |
| `POST` | `/api/keychain/credentials/:rid/reveal` | `{ values }` — write |

Contracts: `Keychain.API.Credential` in `@quarry/shared`. Server: `services/Keychain/` (controller, service, repository, module). `KeychainService.getEncryptedBlob(principal, rid)` — read-gated — is what Data Connection calls to hand a credential to the worker.

---

## 6. Not built yet

- **OAuth templates** (PretzelGraph's `defineOAuth2Credential`: fields first, tokens from a consent callback).
- **Key rotation** — re-encrypting every blob under a new key; the key id already makes old blobs identifiable.
- **An audit table for reveals** — designed in [audit.md](audit.md) (`reveal` events); until built, the server log only.
- **Changing which credential a source uses.**
