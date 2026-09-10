import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { TelegramConfigService } from './telegram-config.service';
import { SetBotTokenDto } from './dto/set-bot-token.dto';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly config: TelegramConfigService) {}

  @Get('bot')
  getBot(@CurrentUser() user: AuthUser) {
    return this.config.getBot(user.id);
  }

  @Put('bot')
  setBot(@CurrentUser() user: AuthUser, @Body() dto: SetBotTokenDto) {
    return this.config.setBotToken(user.id, dto.token);
  }

  @Delete('bot')
  clearBot(@CurrentUser() user: AuthUser) {
    return this.config.clearBotToken(user.id);
  }

  @Get('chats')
  listChats(@CurrentUser() user: AuthUser) {
    return this.config.listChats(user.id);
  }

  @Post('chats')
  createChat(@CurrentUser() user: AuthUser, @Body() dto: CreateChatDto) {
    return this.config.createChat(user.id, dto);
  }

  @Patch('chats/:id')
  updateChat(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateChatDto) {
    return this.config.updateChat(user.id, id, dto);
  }

  @Delete('chats/:id')
  @HttpCode(204)
  deleteChat(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.config.deleteChat(user.id, id);
  }

  @Post('chats/:id/test')
  async testChat(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.config.testChat(user.id, id);
    return { ok: true };
  }

  @Get('discover')
  discover(@CurrentUser() user: AuthUser) {
    return this.config.discover(user.id);
  }
}
