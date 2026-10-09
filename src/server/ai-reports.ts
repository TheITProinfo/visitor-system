import "server-only";

import { createHash } from "node:crypto";
import { AiProviderError, callAi, parseAiJson } from "@/server/ai-provider";
import { prisma } from "@/server/db";
import { sendConfiguredEmail } from "@/server/email";
import { getLocalDateRange } from "@/server/dates";

type Cadence = "DAILY" | "WEEKLY";

function dateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function reportConfigurationHash(input: {
  cadence: Cadence;
  sendTime: string;
  recipientUserIds: string[];
  timeZone: string;
}) {
  return createHash("sha256").update(JSON.stringify({
    cadence: input.cadence,
    sendTime: input.sendTime,
    recipientUserIds: [...input.recipientUserIds].sort(),
    timeZone: input.timeZone,
  })).digest("hex");
}

function localDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (name: string) => parts.find((part) => part.type === name)?.value || "00";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function localDateTimeUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = localDateParts(new Date(guess), timeZone);
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess = target - (represented - guess);
  }
  return new Date(guess);
}

function localToday(now: Date, timeZone: string) {
  const parts = localDateParts(now, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftedDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return dateText(value);
}

function mondayOf(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const daysSinceMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - daysSinceMonday);
  return dateText(value);
}

export function computeReportPeriod(cadence: Cadence, now: Date, timeZone: string) {
  const today = localToday(now, timeZone);
  const from = cadence === "DAILY" ? shiftedDate(today, -1) : shiftedDate(mondayOf(today), -7);
  const to = cadence === "DAILY" ? from : shiftedDate(from, 6);
  const range = getLocalDateRange(from, timeZone);
  const endRange = getLocalDateRange(to, timeZone);
  if (!range || !endRange) throw new Error("report-period-invalid");
  return { from, to, start: range.start, end: endRange.end };
}

export function nextReportOccurrence(now: Date, cadence: Cadence, sendTime: string, timeZone: string) {
  const today = localToday(now, timeZone);
  for (let offset = 0; offset <= 8; offset += 1) {
    const day = shiftedDate(today, offset);
    if (cadence === "WEEKLY" && new Date(`${day}T00:00:00.000Z`).getUTCDay() !== 1) continue;
    const candidate = localDateTimeUtc(day, sendTime, timeZone);
    if (candidate > now) return candidate;
  }
  return new Date(now.getTime() + 86_400_000);
}

async function buildReport(settingsId: string, cadence: Cadence, now: Date, timeZone: string) {
  const period = computeReportPeriod(cadence, now, timeZone);
  const where = { checkedInAt: { gte: period.start, lt: period.end } };
  const [total, open] = await Promise.all([
    prisma.visitRecord.count({ where }),
    prisma.visitRecord.count({ where: { ...where, checkedOutAt: null } }),
  ]);
  const dayRanges: Array<{ label: string; start: Date; end: Date }> = [];
  for (let current = period.from; current <= period.to; current = shiftedDate(current, 1)) {
    const range = getLocalDateRange(current, timeZone);
    if (range) dayRanges.push({ label: current, ...range });
  }
  const daily = await Promise.all(dayRanges.map(async (day) => ({
    label: day.label,
    count: await prisma.visitRecord.count({ where: { checkedInAt: { gte: day.start, lt: day.end } } }),
  })));
  const safeDaily = daily.filter((day) => day.count >= 5);
  let summary: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let aiError: string | null = null;
  const settings = await prisma.companySettings.findUnique({
    where: { id: settingsId },
    select: { aiEnabled: true, aiProvider: true, aiEndpoint: true, aiModel: true, aiApiKeyEncrypted: true, aiPausedUntil: true, aiMaxTokensPerMonth: true },
  });
  if (settings?.aiEnabled && settings.aiProvider && settings.aiModel && settings.aiApiKeyEncrypted) {
    const nowUtc = new Date(now);
    const monthStart = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), 1));
    const usage = await prisma.aiAuditEvent.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { inputTokens: true, outputTokens: true },
    });
    const used = (usage._sum.inputTokens || 0) + (usage._sum.outputTokens || 0);
    const estimate = 600 + safeDaily.length * 20;
    if (settings.aiPausedUntil && settings.aiPausedUntil > now || used + estimate > settings.aiMaxTokensPerMonth) {
      aiError = "usage-limit";
    } else if (safeDaily.length === 0 || total < 5) {
      aiError = "small-sample";
    } else {
      try {
        const response = await callAi(settings, [
          "Write one short, neutral operations summary from the supplied aggregate data only.",
          "Do not infer intent, risk, identity, or reasons for a visit. Do not mention an individual.",
          "Return a JSON object with one string property named summary.",
        ].join("\n"), JSON.stringify({
          period: { from: period.from, to: period.to },
          arrivals: total >= 5 ? total : null,
          visitsWithoutCheckout: open >= 5 ? open : null,
          dailyArrivals: safeDaily,
        }));
        inputTokens = response.inputTokens;
        outputTokens = response.outputTokens;
        const parsed = parseAiJson<{ summary?: unknown }>(response.text);
        if (typeof parsed.summary === "string") summary = parsed.summary.slice(0, 500);
        else aiError = "ai-invalid-response";
      } catch (error) {
        aiError = error instanceof AiProviderError ? error.code : "ai-provider-error";
      }
    }
  } else {
    aiError = "ai-disabled";
  }

  await prisma.aiAuditEvent.create({
    data: {
      settingsId,
      operation: "scheduled-report-summary",
      filters: { cadence, from: period.from, to: period.to },
      resultCount: total,
      inputTokens,
      outputTokens,
      success: Boolean(summary),
      errorCode: summary ? null : aiError || "ai-summary-unavailable",
    },
  });

  const body = [
    `Visitor operations report: ${period.from} through ${period.to}`,
    `Arrivals: ${total}`,
    `Records without a checkout time: ${open}`,
    "",
    summary ? `AI summary: ${summary}` : "AI summary: unavailable for this period. The counts above were calculated by Visitor System.",
    "",
    "Daily arrivals (days with fewer than 5 records are omitted from the AI trend summary):",
    ...daily.map((day) => `${day.label}: ${day.count}`),
    "",
    "Open Visitor System to view records according to your role permissions.",
  ].join("\n");
  return { ...period, total, open, summary, body, inputTokens, outputTokens };
}

export async function sendReportPreview(settingsId: string, to: string, cadence: Cadence, timeZone: string) {
  const settings = await prisma.companySettings.findUnique({ where: { id: settingsId }, select: { companyName: true } });
  if (!settings) throw new Error("settings-not-found");
  const report = await buildReport(settingsId, cadence, new Date(), timeZone);
  await sendConfiguredEmail({
    to,
    subject: `TEST PREVIEW: ${settings.companyName} visitor report (${report.from}–${report.to})`,
    text: `This is a test preview. Automatic reporting remains disabled until enabled by an administrator.\n\n${report.body}`,
  });
  return report;
}

async function processOneSchedule(scheduleId: string, now: Date) {
  const schedule = await prisma.aiReportSchedule.findUnique({
    where: { id: scheduleId },
    include: { settings: true },
  });
  if (!schedule?.enabled) return;
  const timeZone = schedule.settings.timeZone || "UTC";
  const expectedHash = reportConfigurationHash({
    cadence: schedule.cadence,
    sendTime: schedule.sendTime,
    recipientUserIds: schedule.recipientUserIds,
    timeZone,
  });
  if (schedule.configurationHash !== expectedHash) {
    await prisma.aiReportSchedule.update({ where: { id: schedule.id }, data: { enabled: false, testedAt: null } });
    return;
  }
  if (!schedule.nextRunAt) {
    await prisma.aiReportSchedule.update({ where: { id: schedule.id }, data: { nextRunAt: nextReportOccurrence(now, schedule.cadence, schedule.sendTime, timeZone) } });
    return;
  }
  if (schedule.nextRunAt > now) return;

  const period = computeReportPeriod(schedule.cadence, now, timeZone);
  const periodKey = `${schedule.settingsId}:${schedule.cadence}:${period.from}:${period.to}`;
  const nextRunAt = nextReportOccurrence(now, schedule.cadence, schedule.sendTime, timeZone);
  const claim = await prisma.aiReportSchedule.updateMany({
    where: { id: schedule.id, enabled: true, nextRunAt: { lte: now }, configurationHash: expectedHash, OR: [{ lastProcessedPeriodKey: null }, { lastProcessedPeriodKey: { not: periodKey } }] },
    data: { nextRunAt, lastProcessedPeriodKey: periodKey },
  });
  if (claim.count !== 1) return;

  let delivery;
  try {
    delivery = await prisma.aiReportDelivery.create({ data: { periodKey, periodStart: period.start, periodEnd: period.end } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return;
    throw error;
  }

  try {
    const recipients = await prisma.user.findMany({
      where: { id: { in: schedule.recipientUserIds }, status: "ACTIVE", role: "ADMINISTRATOR" },
      select: { email: true },
    });
    if (recipients.length === 0) throw new Error("report-no-active-admin-recipients");
    const report = await buildReport(schedule.settingsId, schedule.cadence, now, timeZone);
    await sendConfiguredEmail({
      to: recipients.map((recipient) => recipient.email).join(", "),
      subject: `${schedule.settings.companyName} visitor report (${report.from}–${report.to})`,
      text: report.body,
    });
    await prisma.aiReportDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", sentAt: new Date() } });
    await prisma.aiReportSchedule.update({ where: { id: schedule.id }, data: { lastSentAt: new Date() } });
  } catch {
    await prisma.aiReportDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", errorCode: "email-delivery-failed" } });
  }
}

let running = false;

export function startAiReportWorker() {
  if (running) return;
  running = true;
  const tick = async () => {
    try {
      const now = new Date();
      const schedules = await prisma.aiReportSchedule.findMany({ where: { enabled: true }, select: { id: true } });
      for (const schedule of schedules) await processOneSchedule(schedule.id, now);
      if (now.getUTCMinutes() === 7) {
        await prisma.aiAuditEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } } });
      }
    } catch {
      // The next tick retries scheduling work after transient database failures.
    }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, 60_000);
  timer.unref();
}
