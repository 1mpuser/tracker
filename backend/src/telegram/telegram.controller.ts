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

@Controller('telegram')
export class TelegramController {
  constructor(private readonly config: TelegramConfigService) {}

  @Get('bot')
  getBot() {
    return this.config.getBot();
  }

  @Put('bot')
  setBot(@Body() dto: SetBotTokenDto) {
    return this.config.setBotToken(dto.token);
  }

  @Delete('bot')
  clearBot() {
    return this.config.clearBotToken();
  }

  @Get('chats')
  listChats() {
    return this.config.listChats();
  }

  @Post('chats')
  createChat(@Body() dto: CreateChatDto) {
    return this.config.createChat(dto);
  }

  @Patch('chats/:id')
  updateChat(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateChatDto) {
    return this.config.updateChat(id, dto);
  }

  @Delete('chats/:id')
  @HttpCode(204)
  deleteChat(@Param('id', ParseIntPipe) id: number) {
    return this.config.deleteChat(id);
  }

  @Post('chats/:id/test')
  async testChat(@Param('id', ParseIntPipe) id: number) {
    await this.config.testChat(id);
    return { ok: true };
  }

  @Get('discover')
  discover() {
    return this.config.discover();
  }
}
