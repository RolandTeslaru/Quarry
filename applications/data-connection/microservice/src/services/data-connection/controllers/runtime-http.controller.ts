import { Controller, Get, Param } from '@nestjs/common';
import { DataConnection, Forge } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-kernel/auth/current-principal';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { DataConnectionService } from '../data-connection.service';

import API = DataConnection.API.Runtime;
const JobRidParam = new ZodPipe(Forge.Job.Rid);

/** `/api/data-connection/jobs/…` for a running sync job's runtime, with the job's token. Mirrors DataConnection.API.Runtime in @quarry/shared. */
@Controller('data-connection/jobs')
export class DataConnectionRuntimeController {

    constructor(private readonly dataConnection: DataConnectionService) {}

    @Get(':rid/connection')
    public getConnection(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', JobRidParam) rid: Forge.Job.Rid,
    ): Promise<API.GetConnection.Response> {
        return this.dataConnection.getJobConnection(principal, rid);
    }
}
