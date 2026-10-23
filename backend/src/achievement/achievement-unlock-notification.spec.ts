import { AchievementService } from './achievement.service';

describe('AchievementService unlock notifications', () => {
  const build = (saveImpl?: () => Promise<unknown>) => {
    const achievementRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'a1', title: 'Speed Demon' }),
    };
    const playerRepo = {
      create: jest.fn((v: unknown) => v),
      save: jest.fn(saveImpl ?? (() => Promise.resolve({}))),
    };
    const notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    const service = new AchievementService(
      achievementRepo as never,
      playerRepo as never,
      notifications as never,
    );
    return { service, notifications, playerRepo };
  };

  const award = (service: AchievementService, playerId = '42') =>
    (service as unknown as {
      awardAchievement: (p: string, a: string) => Promise<void>;
    }).awardAchievement(playerId, 'a1');

  it('notifies the player once when an achievement is unlocked', async () => {
    const { service, notifications } = build();
    await award(service);
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, message: expect.stringContaining('Speed Demon') }),
    );
  });

  it('does not notify again for a duplicate unlock', async () => {
    const { service, notifications } = build(() =>
      Promise.reject(Object.assign(new Error('duplicate'), { code: '23505' })),
    );
    await award(service);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('skips players whose id is not a numeric user id', async () => {
    const { service, notifications } = build();
    await award(service, 'not-a-number');
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});
