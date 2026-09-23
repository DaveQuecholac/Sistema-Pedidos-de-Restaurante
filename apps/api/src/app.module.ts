import { Module } from '@nestjs/common';
import { HealthController } from './interface/http/controllers/health.controller';

/**
 * Composition root — wires concrete adapters to ports.
 * Domain and application must not import this module's infrastructure details.
 */
@Module({
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
