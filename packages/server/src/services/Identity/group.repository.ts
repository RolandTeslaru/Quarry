import { Injectable } from '@nestjs/common';
import { Identity } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { IdentityDB } from './identity.db';

/** Row operations on identity.group and identity.group_member. */
@Injectable()
export class GroupRepository extends Repository(IdentityDB.database) {

    @Transactional()
    async list(principal: Principal): Promise<IdentityDB.Group.Row[]> {
        return this.trx
            .selectFrom('identity.group')
            .selectAll()
            .orderBy('name')
            .execute();
    }

    @Transactional()
    async insert(principal: Principal, values: {
        rid:         Identity.Group.Rid;
        name:        string;
        description: string | null;
    }): Promise<IdentityDB.Group.Row> {
        return this.trx
            .insertInto('identity.group')
            .values(values)
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    @Transactional()
    async addMember(principal: Principal, groupRid: Identity.Group.Rid, userRid: Identity.User.Rid): Promise<void> {
        await this.trx
            .insertInto('identity.group_member')
            .values({ group_rid: groupRid, user_rid: userRid })
            .onConflict((oc) => oc.columns(['group_rid', 'user_rid']).doNothing())
            .execute();
    }

    @Transactional()
    async removeMember(principal: Principal, groupRid: Identity.Group.Rid, userRid: Identity.User.Rid): Promise<void> {
        await this.trx
            .deleteFrom('identity.group_member')
            .where('group_rid', '=', groupRid)
            .where('user_rid', '=', userRid)
            .execute();
    }
}
