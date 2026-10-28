import { Module } from '@nestjs/common';

/** Empty composition root. The gateway has no sales use cases and no database. */
@Module({})
export class GatewayModule {}
