import { Controller } from '@nestjs/common';
import { Keychain } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { MicroserviceCall } from '@quarry/platform-kernel/microservice/microservice-call.decorator';
import { MicroserviceCallReceiver } from '@quarry/platform-kernel/microservice/microservice-call-receiver';
import { KeychainService } from '../keychain.service';

import Calls = Keychain.Microservice;

/** Keychain's microservice calls (docs/design/architecture-split.md §8) — Keychain stays in the main server for now. */
@Controller()
export class KeychainMicroserviceCallsController {

    constructor(
        readonly microserviceCalls: MicroserviceCallReceiver,
        private readonly keychain: KeychainService,
    ) {}

    /** A credential, encrypted, for a run that uses it — read on the credential, as the acting user or delegate. */
    @MicroserviceCall(Calls.GetEncryptedBlob, { from: ['data-connection'] })
    public getEncryptedBlob(principal: Principal, request: Calls.GetEncryptedBlob.Request) {
        return this.keychain.getEncryptedBlob(principal, request.credentialRid);
    }
}
