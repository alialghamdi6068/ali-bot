const PREFIX_COMMANDS = [
  ["فك حظر", "unban"],
  ["إلغاء تايم", "untimeout"],
  ["الغاء تايم", "untimeout"],
  ["مسح تحذير", "clearwarn"],
  ["عرض تحذيرات", "warnings"],
  ["تحذيرات", "warnings"],
  ["إغلاق تكت", "close"],
  ["فتح تكت", "reopen"],
  ["حذف تكت", "delete"],
  ["إضافة عضو", "add"],
  ["اضافة عضو", "add"],
  ["ازالة عضو", "remove"],
  ["إزالة عضو", "remove"],
  ["استلام تكت", "claim"],
  ["إنهاء قيفواي", "endgiveaway"],
  ["انهاء قيفواي", "endgiveaway"],
  ["اعادة سحب", "reroll"],
  ["إعادة سحب", "reroll"],
  ["سحب رتبة", "removerole"],
  ["معلومات السيرفر", "serverinfo"],
  ["حظر", "ban"],
  ["طرد", "kick"],
  ["تايم", "timeout"],
  ["تحذير", "warn"],
  ["تكت", "ticket"],
  ["قيفوايات", "giveawaylist"],
  ["قيفواي", "giveaway"],
  ["قول", "say"],
  ["dm", "dm"],
  ["رتبة", "role"],
  ["مسح", "clear"],
  ["مساعدة", "help"],
  ["معلومات", "userinfo"],
  ["بينق", "ping"],
  ["صيانة", "maintenance"],
  ["قفل", "lock"],
  ["قفل الروم", "lock"],
  ["فتح", "unlock"],
  ["فتح الروم", "unlock"],
  ["بطء", "slowmode"],
  ["اعلان", "announce"],
  ["إعلان", "announce"],
  ["تنبيه", "notify"],
  ["تذكير", "reminder"],
    ["لوق", "logs"]
].sort((a, b) => b[0].length - a[0].length);

function resolvePrefixCommand(input) {
  const normalized = input.trim().toLocaleLowerCase("ar");
  for (const [label, command] of PREFIX_COMMANDS) {
    if (normalized === label || normalized.startsWith(label + " ")) {
      return { command, consumed: label.split(/\s+/).length };
    }
  }
  return null;
}

function parseDuration(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2].toLowerCase()];
  const result = amount * multiplier;
  return Number.isSafeInteger(result) ? result : null;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date);
}

module.exports = { resolvePrefixCommand, parseDuration, formatDate };
