export type TelegramUser = {
  id: string;
  name: string;
  username?: string;
};

export type RequestWithUser = Request & {
  telegramUser: TelegramUser;
};