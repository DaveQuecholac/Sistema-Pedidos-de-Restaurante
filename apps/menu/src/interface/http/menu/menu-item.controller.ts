import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CreateMenuItem } from '../../../application/menu/create-menu-item';
import { DeactivateMenuItem } from '../../../application/menu/deactivate-menu-item';
import { ListMenuItems } from '../../../application/menu/list-menu-items';
import { UpdateMenuItem } from '../../../application/menu/update-menu-item';
import { toMenuHttpError } from './menu-http.errors';
import { presentMenuItem } from './menu-item.presenter';
import {
  createMenuItemBodySchema,
  deactivateMenuItemBodySchema,
  updateMenuItemBodySchema,
} from './menu-item.schema';

/** Driving adapter: HTTP calls the menu use cases and returns product names. */
@Controller('menu-items')
export class MenuItemController {
  constructor(
    private readonly createMenuItem: CreateMenuItem,
    private readonly listMenuItems: ListMenuItems,
    private readonly updateMenuItem: UpdateMenuItem,
    private readonly deactivateMenuItem: DeactivateMenuItem,
  ) {}

  @Post()
  async create(@Body() body: unknown) {
    try {
      const command = createMenuItemBodySchema.parse(body);
      const item = await this.createMenuItem.execute(command);
      return presentMenuItem(item);
    } catch (error) {
      this.fail(error);
    }
  }

  @Get()
  async list() {
    try {
      const items = await this.listMenuItems.execute();
      return items.map(presentMenuItem);
    } catch (error) {
      this.fail(error);
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    try {
      const command = updateMenuItemBodySchema.parse(body);
      const item = await this.updateMenuItem.execute({ ...command, id });
      return presentMenuItem(item);
    } catch (error) {
      this.fail(error);
    }
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string, @Body() body: unknown) {
    try {
      deactivateMenuItemBodySchema.parse(body ?? {});
      const item = await this.deactivateMenuItem.execute(id);
      return presentMenuItem(item);
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): never {
    const translated = toMenuHttpError(error);
    if (translated === null) {
      throw error;
    }

    throw new HttpException(translated.body, translated.status);
  }
}
