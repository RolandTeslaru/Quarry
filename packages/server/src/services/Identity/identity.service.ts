import { ForbiddenException, Injectable } from '@nestjs/common';
import { Identity } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { IdentityDB } from './identity.db';
import { UserRepository } from './user.repository';
import { GroupRepository } from './group.repository';

@Injectable()
export class IdentityService {

    private readonly log = System.log.withContext('Identity');

    constructor(
        private readonly userRepository:  UserRepository,
        private readonly groupRepository: GroupRepository,
    ) {}

    /**
     * The member behind a verified GoTrue identity, or null if they aren't one.
     * The very first login by QUARRY_BOOTSTRAP_ADMIN_EMAIL becomes the workspace
     * admin — otherwise nobody could ever get in.
     */
    async resolveMember(userRid: Identity.User.Rid, email: string | null): Promise<IdentityDB.User.Row | null> {
        const existing = await this.userRepository.get(Principal.SELF('auth.resolveMember'), userRid);

        if (existing)
            return existing;

        const bootstrap = process.env.QUARRY_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();

        if (!bootstrap || !email || email.toLowerCase() !== bootstrap)
            return null;

        const admin = await this.userRepository.insertFirstAdmin(Principal.SELF('auth.bootstrapAdmin'), {
            rid:         userRid,
            email,
            displayName: email.split('@')[0],
        });

        if (admin)
            this.log.info(`Bootstrapped first workspace admin: ${email}`);

        return admin;
    }

    async me(principal: Principal.User): Promise<Identity.User.Schema> {
        const row = await this.userRepository.get(principal, principal.userRid);

        if (!row)
            throw new ForbiddenException('Not a member of this workspace');

        return IdentityDB.User.toDomain(row);
    }

    async listUsers(principal: Principal.User): Promise<Identity.User.Schema[]> {
        const rows = await this.userRepository.list(principal);

        return rows.map(IdentityDB.User.toDomain);
    }

    async listGroups(principal: Principal.User): Promise<Identity.Group.Schema[]> {
        const rows = await this.groupRepository.list(principal);

        return rows.map(IdentityDB.Group.toDomain);
    }
}
