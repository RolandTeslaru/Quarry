import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { UserRepository } from './user.repository';
import { GroupRepository } from './group.repository';

@Module({
    providers: [IdentityService, UserRepository, GroupRepository],
    exports:   [IdentityService],
})
export class IdentityModule {}
