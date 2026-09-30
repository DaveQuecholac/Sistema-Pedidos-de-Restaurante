import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { CheckDatabaseConnection } from '../../../application/database/check-database-connection';
import { DatabaseConnectionError } from '../../../application/database/database-connection.error';

/** Driving adapter: translates CheckDatabaseConnection into HTTP. No driver text. */
@Controller('health')
export class DatabaseHealthController {
  constructor(private readonly checkDatabase: CheckDatabaseConnection) {}

  @Get('database')
  async check() {
    try {
      await this.checkDatabase.execute();
    } catch (error) {
      if (error instanceof DatabaseConnectionError) {
        throw new ServiceUnavailableException({
          status: 'unavailable',
          service: 'restaurante-api',
        });
      }
      throw error;
    }

    return { status: 'ok', service: 'restaurante-api' };
  }
}
