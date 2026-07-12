import { prisma } from "../lib/prisma";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_CHUNK_SIZE = 100;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
}

export function isExpoPushToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

/**
 * Delivers a batch of push messages through the Expo push service. Never throws — push delivery is
 * best-effort and must never break the request that triggered it. Tokens rejected as
 * `DeviceNotRegistered` are pruned so we stop sending to dead devices.
 */
export async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  const validMessages = messages.filter((message) => isExpoPushToken(message.to));

  if (validMessages.length === 0) {
    return;
  }

  const tokensToPrune: string[] = [];

  for (let offset = 0; offset < validMessages.length; offset += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = validMessages.slice(offset, offset + EXPO_PUSH_CHUNK_SIZE);

    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((message) => ({
            to: message.to,
            title: message.title,
            body: message.body,
            data: message.data ?? {},
            sound: "default",
          })),
        ),
      });

      const payload = (await response.json().catch(() => null)) as {
        data?: ExpoPushTicket[];
      } | null;

      const tickets = payload?.data ?? [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          const message = chunk[index];
          if (message) {
            tokensToPrune.push(message.to);
          }
        }
      });
    } catch (error) {
      console.error("Expo push delivery failed", error);
    }
  }

  if (tokensToPrune.length > 0) {
    await prisma.pushDevice
      .deleteMany({ where: { expoPushToken: { in: tokensToPrune } } })
      .catch((error) => console.error("Failed to prune stale push tokens", error));
  }
}
