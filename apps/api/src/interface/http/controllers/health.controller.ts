import { Controller, Get } from '@nestjs/common';

/** Driving adapter (HTTP) — smoke check; no domain logic. */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'restaurante-api' };
  }
}
