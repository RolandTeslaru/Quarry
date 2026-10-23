import { Audit, type Platform } from '@quarry/shared/domain'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { api } from '@/SDKs/api'
import type { AuditSDKImpl } from '../sdk'

/**
 * `AuditSDK.actions`. Opens aren't here: a resource's page records its own, in
 * the same request that loads it (`<X>SDK.actions.<resource>.open`).
 */
export class AuditActions extends ActionGroup<AuditSDKImpl> {

    protected readonly log = log.withContext('Audit.Actions')

    public recents(application: Platform.Application.Id): Promise<Audit.API.AccessEvent.Recents.Response> {
        return Audit.API.AccessEvent.recents(api, { application })
    }
}
