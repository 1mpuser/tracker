import { TelegramController } from './telegram.controller';

describe('TelegramController', () => {
  const user = { id: 1, email: 'a@b.c', timezone: 'UTC' };
  let config: any;
  let controller: TelegramController;

  beforeEach(() => {
    config = {
      getBot: jest.fn(),
      setBotToken: jest.fn(),
      clearBotToken: jest.fn(),
      listChats: jest.fn(),
      createChat: jest.fn(),
      updateChat: jest.fn(),
      deleteChat: jest.fn(),
      testChat: jest.fn(),
      discover: jest.fn(),
    };
    controller = new TelegramController(config);
  });

  it('delegates bot endpoints with the right arguments', async () => {
    config.getBot.mockResolvedValue('GET');
    expect(await controller.getBot(user)).toBe('GET');

    config.setBotToken.mockResolvedValue('PUT');
    expect(await controller.setBot(user, { token: '123:x' })).toBe('PUT');
    expect(config.setBotToken).toHaveBeenCalledWith(1, '123:x');

    config.clearBotToken.mockResolvedValue('DEL');
    expect(await controller.clearBot(user)).toBe('DEL');
  });

  it('delegates chat endpoints', async () => {
    config.listChats.mockResolvedValue('L');
    expect(await controller.listChats(user)).toBe('L');

    config.createChat.mockResolvedValue('C');
    expect(await controller.createChat(user, { title: 'A', chatId: '-1' })).toBe('C');
    expect(config.createChat).toHaveBeenCalledWith(1, { title: 'A', chatId: '-1' });

    config.updateChat.mockResolvedValue('U');
    expect(await controller.updateChat(user, 5, { title: 'B' })).toBe('U');
    expect(config.updateChat).toHaveBeenCalledWith(1, 5, { title: 'B' });

    await controller.deleteChat(user, 5);
    expect(config.deleteChat).toHaveBeenCalledWith(1, 5);

    config.testChat.mockResolvedValue(undefined);
    expect(await controller.testChat(user, 5)).toEqual({ ok: true });
    expect(config.testChat).toHaveBeenCalledWith(1, 5);
  });

  it('delegates discover', async () => {
    config.discover.mockResolvedValue('D');
    expect(await controller.discover(user)).toBe('D');
  });
});
