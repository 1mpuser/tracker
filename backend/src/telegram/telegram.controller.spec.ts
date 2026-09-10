import { TelegramController } from './telegram.controller';

describe('TelegramController', () => {
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
    expect(await controller.getBot()).toBe('GET');

    config.setBotToken.mockResolvedValue('PUT');
    expect(await controller.setBot({ token: '123:x' })).toBe('PUT');
    expect(config.setBotToken).toHaveBeenCalledWith('123:x');

    config.clearBotToken.mockResolvedValue('DEL');
    expect(await controller.clearBot()).toBe('DEL');
  });

  it('delegates chat endpoints', async () => {
    config.listChats.mockResolvedValue('L');
    expect(await controller.listChats()).toBe('L');

    config.createChat.mockResolvedValue('C');
    expect(await controller.createChat({ title: 'A', chatId: '-1' })).toBe('C');
    expect(config.createChat).toHaveBeenCalledWith({ title: 'A', chatId: '-1' });

    config.updateChat.mockResolvedValue('U');
    expect(await controller.updateChat(5, { title: 'B' })).toBe('U');
    expect(config.updateChat).toHaveBeenCalledWith(5, { title: 'B' });

    await controller.deleteChat(5);
    expect(config.deleteChat).toHaveBeenCalledWith(5);

    config.testChat.mockResolvedValue(undefined);
    expect(await controller.testChat(5)).toEqual({ ok: true });
    expect(config.testChat).toHaveBeenCalledWith(5);
  });

  it('delegates discover', async () => {
    config.discover.mockResolvedValue('D');
    expect(await controller.discover()).toBe('D');
  });
});
