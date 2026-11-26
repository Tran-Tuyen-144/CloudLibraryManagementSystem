import { randomUUID } from "node:crypto";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { config } from "./config.mjs";
import { businessDay, addDays, nowIso, ensure } from "./errors.mjs";
import { allLoans, promoteReservation, isPublicBook } from "./library.mjs";

export async function runReminders(repo, options = config, now = new Date()) {
  const day = businessDay(now);
  await repo.mutate(
    "scheduler",
    `tick_${Math.floor(now.getTime() / 60000)}`,
    { action: "reminders", minute: Math.floor(now.getTime() / 60000) },
    (state) => {
      for (const reservation of state.reservations.filter(
        (r) =>
          r.status === "ready" &&
          (Date.parse(r.expiresAt) <= now.getTime() ||
            !state.accounts.some(
              (a) => a.email === r.readerEmail && a.status === "active",
            ) ||
            !isPublicBook(state.books.find((b) => b.id === r.bookId))),
      )) {
        reservation.status =
          Date.parse(reservation.expiresAt) <= now.getTime()
            ? "expired"
            : "cancelled";
        reservation.version++;
        const copy = state.bookCopies.find(
          (c) => c.reservationId === reservation.id,
        );
        if (copy) {
          copy.status = "available";
          delete copy.reservationId;
        }
        promoteReservation(state, reservation.bookId);
      }
      for (const loan of allLoans(state).filter(
        (l) => l.status === "borrowed",
      )) {
        const type =
          loan.dueDate < day
            ? "overdue"
            : loan.dueDate <= addDays(day, 3)
              ? "dueSoon"
              : null;
        if (!type) continue;
        const id = `reminder_${loan.id}_${type}_${day}`;
        if (state.notifications.some((n) => n.id === id)) continue;
        state.notifications.push({
          id,
          readerEmail: loan.readerEmail,
          type,
          title:
            type === "overdue" ? "Sách đã quá hạn trả" : "Sách sắp đến hạn trả",
          message: `${loan.title}. Hạn trả: ${loan.dueDate}. Vui lòng liên hệ thư viện nếu cần hỗ trợ.`,
          targetId: loan.id,
          createdAt: now.toISOString(),
          read: false,
          deliveryStatus: "pending",
          attempts: 0,
        });
      }
      return { state };
    },
  );
  let processed = 0;
  const pending = (await repo.read()).notifications
    .filter(
      (n) =>
        n.deliveryStatus === "pending" &&
        (!n.nextAttemptAt || Date.parse(n.nextAttemptAt) <= now.getTime()),
    )
    .slice(0, 20);
  for (const item of pending) {
    const leaseId = randomUUID();
    try {
      const lease = await repo.mutate(
        "mailer",
        randomUUID(),
        { action: "mail.claim", id: item.id, leaseId },
        (state) => {
          const notification = state.notifications.find(
            (n) => n.id === item.id,
          );
          ensure(
            notification?.deliveryStatus === "pending",
            "mailAlreadyClaimed",
            "Thư đang được xử lý.",
            409,
          );
          notification.deliveryStatus = "sending";
          notification.leaseId = leaseId;
          notification.claimedAt = nowIso();
          notification.attempts = (notification.attempts || 0) + 1;
          return { state };
        },
      );
      const account = lease.state.accounts.find(
        (a) => a.email === item.readerEmail && a.status === "active",
      );
      if (!account) {
        await repo.mutate(
          "mailer",
          randomUUID(),
          { action: "mail.skip", id: item.id },
          (state) => {
            const row = state.notifications.find((n) => n.id === item.id);
            if (row?.leaseId === leaseId) row.deliveryStatus = "skipped";
            return { state };
          },
        );
        continue;
      }
      let delivery = "local";
      let messageId;
      if (options.mode === "aws") {
        ensure(
          options.emailFrom,
          "emailNotConfigured",
          "Cần cấu hình địa chỉ SES.",
        );
        const result = await new SESv2Client({ region: options.region }).send(
          new SendEmailCommand({
            FromEmailAddress: options.emailFrom,
            Destination: { ToAddresses: [account.email] },
            Content: {
              Simple: {
                Subject: { Data: item.title, Charset: "UTF-8" },
                Body: { Text: { Data: item.message, Charset: "UTF-8" } },
              },
            },
          }),
        );
        messageId = result.MessageId;
        delivery = "sent";
      } else
        await repo.putSecret("OUTBOX", item.id, {
          email: account.email,
          subject: item.title,
          text: item.message,
          createdAt: nowIso(),
          localOnly: true,
        });
      await repo.mutate(
        "mailer",
        randomUUID(),
        { action: "mail.finish", id: item.id, leaseId },
        (state) => {
          const notification = state.notifications.find(
            (n) => n.id === item.id,
          );
          ensure(notification?.leaseId === leaseId, "staleMail");
          Object.assign(notification, {
            deliveryStatus: delivery,
            sentAt: nowIso(),
            messageId,
          });
          return { state };
        },
      );
      processed++;
    } catch (error) {
      await repo.mutate(
        "mailer",
        randomUUID(),
        { action: "mail.error", id: item.id, leaseId },
        (state) => {
          const notification = state.notifications.find(
            (n) => n.id === item.id,
          );
          if (notification?.leaseId === leaseId) {
            const ambiguous = ["TimeoutError", "AbortError"].includes(
              error.name,
            );
            Object.assign(notification, {
              deliveryStatus: ambiguous
                ? "unknown"
                : notification.attempts >= 5
                  ? "failed"
                  : "pending",
              deliveryError: error.code || error.name,
              nextAttemptAt: new Date(Date.now() + 300000).toISOString(),
            });
          }
          return { state };
        },
      );
    }
  }
  return { processed };
}
