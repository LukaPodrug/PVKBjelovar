import { type NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { type ExpoPushMessage, sendExpoPushNotifications } from "./push.service";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /**
   * When set, notifications are deduplicated per user using `${dedupeKey}:${userId}`. Recurring
   * reminders (e.g. membership expiry) pass a stable key so the same reminder is never resent.
   */
  dedupeKey?: string;
}

/**
 * Persists an in-app notification for each user and pushes to their registered devices. Safe for
 * fire-and-forget use: it swallows and logs all errors so a delivery failure never breaks the
 * request that triggered it.
 */
export async function dispatchNotificationToUsers(
  userIds: string[],
  payload: NotificationPayload,
): Promise<void> {
  try {
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return;
    }

    let targetUserIds = uniqueUserIds;

    if (payload.dedupeKey) {
      const dedupeKeys = uniqueUserIds.map((userId) => buildDedupeKey(payload.dedupeKey!, userId));
      const existing = await prisma.notification.findMany({
        where: { dedupeKey: { in: dedupeKeys } },
        select: { dedupeKey: true },
      });
      const existingKeys = new Set(existing.map((record) => record.dedupeKey));
      targetUserIds = uniqueUserIds.filter(
        (userId) => !existingKeys.has(buildDedupeKey(payload.dedupeKey!, userId)),
      );
    }

    if (targetUserIds.length === 0) {
      return;
    }

    const jsonData: Prisma.InputJsonValue = { type: payload.type, ...(payload.data ?? {}) };

    await prisma.notification.createMany({
      data: targetUserIds.map((userId) => ({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: jsonData,
        dedupeKey: payload.dedupeKey ? buildDedupeKey(payload.dedupeKey, userId) : null,
      })),
      skipDuplicates: true,
    });

    const devices = await prisma.pushDevice.findMany({
      where: { userId: { in: targetUserIds } },
      select: { expoPushToken: true },
    });

    if (devices.length === 0) {
      return;
    }

    const messages: ExpoPushMessage[] = devices.map((device) => ({
      to: device.expoPushToken,
      title: payload.title,
      body: payload.body,
      data: { type: payload.type, ...(payload.data ?? {}) },
    }));

    await sendExpoPushNotifications(messages);
  } catch (error) {
    console.error("Failed to dispatch notification", error);
  }
}

/** Notifies every parent linked to a player in the given category. */
export async function notifyCategoryParents(
  categoryId: string,
  payload: NotificationPayload,
): Promise<void> {
  try {
    const parents = await prisma.parent.findMany({
      where: {
        players: {
          some: {
            player: {
              categories: {
                some: { categoryId },
              },
            },
          },
        },
      },
      select: { userId: true },
    });

    await dispatchNotificationToUsers(
      parents.map((parent) => parent.userId),
      payload,
    );
  } catch (error) {
    console.error("Failed to notify category parents", error);
  }
}

/**
 * Notifies the full audience of a category — every parent linked to a player in the category AND
 * the players themselves. Used for practice changes/cancellations that both kids and parents care
 * about. A user linked in multiple ways is deduplicated by `dispatchNotificationToUsers`.
 */
export async function notifyCategoryAudience(
  categoryId: string,
  payload: NotificationPayload,
): Promise<void> {
  try {
    const [parents, players] = await Promise.all([
      prisma.parent.findMany({
        where: {
          players: {
            some: {
              player: {
                categories: {
                  some: { categoryId },
                },
              },
            },
          },
        },
        select: { userId: true },
      }),
      prisma.player.findMany({
        where: {
          categories: {
            some: { categoryId },
          },
        },
        select: { userId: true },
      }),
    ]);

    await dispatchNotificationToUsers(
      [...parents.map((parent) => parent.userId), ...players.map((player) => player.userId)],
      payload,
    );
  } catch (error) {
    console.error("Failed to notify category audience", error);
  }
}

/** Notifies every parent linked to a specific player. */
export async function notifyPlayerParents(
  playerId: string,
  payload: NotificationPayload,
): Promise<void> {
  try {
    const links = await prisma.parentPlayer.findMany({
      where: { playerId },
      select: { parent: { select: { userId: true } } },
    });

    await dispatchNotificationToUsers(
      links.map((link) => link.parent.userId),
      payload,
    );
  } catch (error) {
    console.error("Failed to notify player parents", error);
  }
}

function buildDedupeKey(baseKey: string, userId: string): string {
  return `${baseKey}:${userId}`;
}
