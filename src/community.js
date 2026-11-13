const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder,
  PermissionFlagsBits
} = require("discord.js");
const { randomInt } = require("node:crypto");
const { statements } = require("./database");

const inviteCache = new Map();
const setting = key => statements.getSetting.get(key)?.value ?? "";
const setSetting = (key, value) => statements.setSetting.run(key, String(value ?? ""));

function unlock(guildId, userId, key, logAction) {
  const result = statements.unlockAchievement.run(guildId, userId, key, Date.now());
  if (result.changes) logAction(guildId, userId, "achievement_unlocked", userId, key);
  return Boolean(result.changes);
}

async function cacheInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(invites.map(x => [x.code, x.uses ?? 0])));
  } catch (error) {
    console.warn("Invite tracking unavailable; check Manage Server permission:", error.message);
  }
}

async function handleInviteCreate(invite) {
  if (!invite.guild) return;
  const map = inviteCache.get(invite.guild.id) ?? new Map();
  map.set(invite.code, invite.uses ?? 0);
  inviteCache.set(invite.guild.id, map);
}

async function handleMemberAdd(member, logAction) {
  const roleId = setting("autorole_id");
  if (roleId) {
    const role = await member.guild.roles.fetch(roleId).catch(() => null);
    if (role && !role.managed && role.id !== member.guild.id && role.position < (member.guild.members.me?.roles.highest.position ?? -1)) {
      await member.roles.add(role, "Configured automatic member role").catch(error => {
        console.error("Auto-role assignment failed:", error);
        logAction(member.guild.id, member.client.user.id, "autorole_failed", member.id, error.message);
      });
    }
  }

  const welcomeChannelId = setting("welcome_channel_id");
  if (welcomeChannelId) {
    const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
    if (channel?.isTextBased()) {
      const template = setting("welcome_message") || "Welcome {user} to {server}!";
      const content = template.replaceAll("{user}", "<@" + member.id + ">")
        .replaceAll("{username}", member.user.username)
        .replaceAll("{server}", member.guild.name)
        .replaceAll("{count}", String(member.guild.memberCount));
      await channel.send({ content, allowedMentions: { users: [member.id] } }).catch(error => console.error("Welcome message failed:", error));
    }
  }

  try {
    const previous = inviteCache.get(member.guild.id) ?? new Map();
    const invites = await member.guild.invites.fetch();
    const used = invites.find(x => (x.uses ?? 0) > (previous.get(x.code) ?? 0));
    inviteCache.set(member.guild.id, new Map(invites.map(x => [x.code, x.uses ?? 0])));
    if (used?.inviter) {
      statements.addInvite.run(member.guild.id, used.inviter.id);
      const total = statements.getInvites.get(member.guild.id, used.inviter.id)?.uses ?? 0;
      if (total >= 5) unlock(member.guild.id, used.inviter.id, "five_invites", logAction);
      logAction(member.guild.id, used.inviter.id, "invite_used", member.id, "Invite " + used.code);
    }
  } catch (error) {
    console.warn("Could not identify invite used by new member:", error.message);
  }
}

function checkAchievements(guildId, userId, row, logAction) {
  if (row.messages >= 1) unlock(guildId, userId, "first_message", logAction);
  if (row.messages >= 100) unlock(guildId, userId, "one_hundred_messages", logAction);
  if (row.level >= 5) unlock(guildId, userId, "level_five", logAction);
}

async function handleMessage(message, logAction) {
  if (!message.guild || message.guild.id !== process.env.GUILD_ID || message.author.bot) return false;
  const blocked = statements.getBlockedWords.all(message.guild.id).map(x => x.word.toLocaleLowerCase("en-US"));
  const tokens = message.content.toLocaleLowerCase("en-US").split(/[^\p{L}\p{N}]+/u);
  const match = blocked.find(word => word && tokens.includes(word));
  if (match) {
    await message.delete().catch(() => {});
    const warning = statements.addWarning.run(message.guild.id, message.author.id, message.client.user.id, "Automatic anti-swear filter", Date.now());
    const warningId = Number(warning.lastInsertRowid);
    if (message.member?.moderatable) await message.member.timeout(15 * 60 * 1000, "Automatic anti-swear filter").catch(() => {});
    await message.author.send("Your message in " + message.guild.name + " was removed by the word filter. Warning #" + warningId + ". A 15-minute timeout was applied where possible.").catch(() => {});
    logAction(message.guild.id, message.client.user.id, "anti_swear", message.author.id, "Warning #" + warningId + "; matched configured word");
    return true;
  }

  const counted = statements.recordMessage.get(message.guild.id, message.author.id);
  const previous = statements.getLevel.get(message.guild.id, message.author.id);
  if (previous && Date.now() - previous.last_xp_at < 60_000) {
    checkAchievements(message.guild.id, message.author.id, counted, logAction);
    return;
  }
  const row = statements.addXp.get(message.guild.id, message.author.id, randomInt(10, 21), Date.now());
  const level = Math.floor(Math.sqrt(row.xp / 100));
  if (level !== row.level) {
    statements.setLevel.run(level, message.guild.id, message.author.id);
    if (level > row.level) {
      logAction(message.guild.id, message.client.user.id, "level_up", message.author.id, "Reached level " + level);
      await message.channel.send({ content: "🎉 <@" + message.author.id + "> reached level **" + level + "**!", allowedMentions: { users: [message.author.id] } }).catch(() => {});
    }
  }
  checkAchievements(message.guild.id, message.author.id, { ...row, messages: counted.messages, level }, logAction);
  return false;
}

async function submitSuggestion(guild, user, content, logAction) {
  if (typeof content !== "string" || content.trim().length < 5 || content.length > 1500) throw new Error("Suggestion must contain 5 to 1500 characters.");
  const channelId = setting("suggestion_channel_id");
  if (!channelId) throw new Error("Suggestions are not configured. Ask staff to set the suggestions channel.");
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error("The configured suggestions channel is unavailable.");
  const result = statements.createSuggestion.run(guild.id, channel.id, user.id, content.trim(), Date.now());
  const id = Number(result.lastInsertRowid);
  const embed = new EmbedBuilder().setColor(0x3498db).setTitle("Suggestion #" + id).setDescription(content.trim())
    .addFields({ name: "Status", value: "Pending", inline: true }, { name: "Submitted by", value: "<@" + user.id + ">", inline: true })
    .setFooter({ text: "Vote with the buttons below" }).setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("suggestion:up:" + id).setLabel("👍 0").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("suggestion:down:" + id).setLabel("👎 0").setStyle(ButtonStyle.Danger)
  );
  try {
    const sent = await channel.send({ embeds: [embed], components: [row], allowedMentions: { users: [user.id] } });
    statements.setSuggestionMessage.run(sent.id, id);
  } catch (error) {
    statements.deleteSuggestion.run(id);
    throw error;
  }
  logAction(guild.id, user.id, "suggestion_create", String(id), content.trim().slice(0, 300));
  return id;
}

async function submitApplication(guild, user, answers, logAction) {
  const channelId = setting("application_channel_id");
  if (!channelId) throw new Error("Applications are not configured. Ask staff to set the applications channel.");
  const clean = answers.map(x => String(x ?? "").trim());
  if (clean.length !== 4 || clean.some(x => !x || x.length > 1000)) throw new Error("All four application answers are required (maximum 1000 characters each).");
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error("The configured applications channel is unavailable.");
  const result = statements.createApplication.run(guild.id, user.id, JSON.stringify(clean), Date.now());
  const id = Number(result.lastInsertRowid);
  const embed = new EmbedBuilder().setColor(0x9b59b6).setTitle("Staff Application #" + id)
    .setDescription(clean.map((answer, i) => "**Question " + (i + 1) + "**\n" + answer).join("\n\n"))
    .addFields({ name: "Applicant", value: "<@" + user.id + ">", inline: true }, { name: "Status", value: "Pending", inline: true }).setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("application:approve:" + id).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("application:reject:" + id).setLabel("Reject").setStyle(ButtonStyle.Danger)
  );
  try {
    const sent = await channel.send({ embeds: [embed], components: [row], allowedMentions: { users: [user.id] } });
    statements.setApplicationMessage.run(channel.id, sent.id, id);
  } catch (error) {
    logAction(guild.id, user.id, "application_delivery_failed", String(id), error.message);
    throw new Error("Application #" + id + " was saved, but staff notification failed. Contact staff with this ID.");
  }
  logAction(guild.id, user.id, "application_submit", String(id), "Staff application submitted");
  return id;
}

async function openApplication(interaction) {
  const modal = new ModalBuilder().setCustomId("application:submit").setTitle("Staff Application");
  const prompts = [
    ["application_age", "How old are you?"],
    ["application_timezone", "What is your timezone?"],
    ["application_experience", "What experience do you have?"],
    ["application_reason", "Why do you want to join the staff team?"]
  ];
  modal.addComponents(...prompts.map(([id, label]) => new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
  )));
  await interaction.showModal(modal);
}

async function handleInteraction(interaction, logAction) {
  if (interaction.isModalSubmit() && interaction.customId === "application:submit") {
    if (!interaction.guild || interaction.guild.id !== process.env.GUILD_ID) return true;
    const answers = ["application_age", "application_timezone", "application_experience", "application_reason"].map(id => interaction.fields.getTextInputValue(id));
    const id = await submitApplication(interaction.guild, interaction.user, answers, logAction);
    await interaction.reply({ content: "Your application #" + id + " has been submitted.", ephemeral: true });
    return true;
  }
  if (!interaction.isButton()) return false;
  const [kind, action, rawId] = interaction.customId.split(":");
  const id = Number(rawId);
  if (!Number.isInteger(id) || !interaction.guild || interaction.guild.id !== process.env.GUILD_ID) return false;

  if (kind === "suggestion" && ["up", "down"].includes(action)) {
    const suggestion = statements.getSuggestionChannel.get(id, interaction.guild.id);
    if (!suggestion || suggestion.message_id !== interaction.message.id) {
      await interaction.reply({ content: "Suggestion not found.", ephemeral: true });
      return true;
    }
    statements.voteSuggestion.run(id, interaction.user.id, action === "up" ? 1 : -1);
    const votes = statements.getSuggestionVotes.get(id);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("suggestion:up:" + id).setLabel("👍 " + (votes.upvotes ?? 0)).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("suggestion:down:" + id).setLabel("👎 " + (votes.downvotes ?? 0)).setStyle(ButtonStyle.Danger)
    );
    await interaction.update({ components: [row] });
    return true;
  }

  if (kind === "application" && ["approve", "reject"].includes(action)) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "You need Manage Server permission to review applications.", ephemeral: true });
      return true;
    }
    const application = statements.getApplication.get(id, interaction.guild.id);
    if (!application || application.message_id !== interaction.message.id) {
      await interaction.reply({ content: "Application not found.", ephemeral: true });
      return true;
    }
    const status = action === "approve" ? "approved" : "rejected";
    const updated = statements.reviewApplication.run(status, interaction.user.id, Date.now(), id);
    if (!updated.changes) {
      await interaction.reply({ content: "This application was already reviewed.", ephemeral: true });
      return true;
    }
    const old = interaction.message.embeds[0];
    const embed = EmbedBuilder.from(old).setColor(action === "approve" ? 0x2ecc71 : 0xe74c3c)
      .setFields(...old.fields.filter(x => x.name !== "Status"), { name: "Status", value: status.toUpperCase(), inline: true }, { name: "Reviewed by", value: "<@" + interaction.user.id + ">", inline: true });
    await interaction.update({ embeds: [embed], components: [] });
    const applicant = await interaction.client.users.fetch(application.user_id).catch(() => null);
    await applicant?.send("Your staff application #" + id + " in " + interaction.guild.name + " was " + status + ".").catch(() => {});
    logAction(interaction.guild.id, interaction.user.id, "application_" + status, application.user_id, "Application #" + id);
    return true;
  }
  return false;
}

async function createTranscript(channel, ticket, guild, logAction) {
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) throw new Error("Could not fetch ticket messages for the transcript.");
  const ordered = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = ordered.map(message => {
    const body = message.content || (message.attachments.size ? "[Attachment]" : "[Embed or non-text message]");
    return "[" + new Date(message.createdTimestamp).toISOString() + "] " + message.author.tag + ": " + body;
  });
  const content = "Ticket #" + ticket.number + " | " + guild.name + "\nOwner: " + ticket.user_id + "\n\n" + lines.join("\n");
  statements.saveTranscript.run(ticket.id, guild.id, content, Date.now());
  const channelId = setting("transcript_channel_id");
  if (channelId) {
    const target = await guild.channels.fetch(channelId).catch(() => null);
    if (target?.isTextBased()) {
      const file = new AttachmentBuilder(Buffer.from(content, "utf8"), { name: "ticket-" + ticket.number + "-transcript.txt" });
      await target.send({ content: "Transcript for ticket #" + ticket.number + ".", files: [file] });
    }
  }
  logAction(guild.id, guild.client.user.id, "ticket_transcript", ticket.user_id, "Ticket #" + ticket.number);
}

module.exports = {
  setting, setSetting, cacheInvites, handleInviteCreate, handleMemberAdd,
  handleMessage, submitSuggestion, submitApplication, openApplication,
  handleInteraction, createTranscript
};
