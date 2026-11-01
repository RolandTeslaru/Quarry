import { Injectable } from '@nestjs/common';
import { Catalog, Forge, Identity, Keychain } from '@quarry/shared/domain';
import { createMicroserviceClient } from './microservice-client';

/** The Catalog service's calls (Catalog.Microservice.Calls). */
@Injectable()
export class CatalogClient extends createMicroserviceClient(Catalog.Microservice.Calls) {}

/** The Forge service's calls (Forge.Microservice.Calls). */
@Injectable()
export class ForgeClient extends createMicroserviceClient(Forge.Microservice.Calls) {}

/** Keychain's calls, in the main server (Keychain.Microservice.Calls). */
@Injectable()
export class KeychainClient extends createMicroserviceClient(Keychain.Microservice.Calls) {}

/** Identity's calls, in the main server: minting a user's token (Identity.Microservice.Calls). */
@Injectable()
export class IdentityClient extends createMicroserviceClient(Identity.Microservice.Calls) {}
