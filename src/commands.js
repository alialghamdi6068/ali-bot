const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

const commands = [
  new SlashCommandBuilder().setName("ban").setDescription("Ban a member")
    .addUserOption(o => o.setName("user").setDescription("Member to ban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder().setName("unban").setDescription("Unban a user")
    .addStringOption(o => o.setName("user_id").setDescription("Discord user ID").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder().setName("kick").setDescription("Kick a member")
    .addUserOption(o => o.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member")
    .addUserOption(o => o.setName("user").setDescription("Member to timeout").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Examples: 10m, 2h, 1d").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),
  new SlashCommandBuilder().setName("untimeout").setDescription("Remove a member timeout")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("warn").setDescription("Warn a member")
    .addUserOption(o => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),
  new SlashCommandBuilder().setName("warnings").setDescription("Show a member's warnings")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("clearwarn").setDescription("Delete one warning")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addIntegerOption(o => o.setName("warning_id").setDescription("Warning number").setRequired(true)),
  new SlashCommandBuilder().setName("clear").setDescription("Delete recent messages")
    .addIntegerOption(o => o.setName("amount").setDescription("1 to 100").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("ticket").setDescription("Create your support ticket"),
  new SlashCommandBuilder().setName("close").setDescription("Close this ticket"),
  new SlashCommandBuilder().setName("reopen").setDescription("Reopen this ticket"),
  new SlashCommandBuilder().setName("delete").setDescription("Delete this ticket"),
  new SlashCommandBuilder().setName("add").setDescription("Add a member to this ticket")
    .addUserOption(o => o.setName("user").setDescription("Member to add").setRequired(true)),
  new SlashCommandBuilder().setName("remove").setDescription("Remove a member from this ticket")
    .addUserOption(o => o.setName("user").setDescription("Member to remove").setRequired(true)),
  new SlashCommandBuilder().setName("claim").setDescription("Claim this ticket"),
  new SlashCommandBuilder().setName("giveaway").setDescription("Start a giveaway")
    .addStringOption(o => o.setName("prize").setDescription("Giveaway prize").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Examples: 10m, 2h, 1d").setRequired(true))
    .addIntegerOption(o => o.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(20).setRequired(true))
    .addChannelOption(o => o.setName("channel").setDescription("Where to post").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("endgiveaway").setDescription("End a giveaway")
    .addIntegerOption(o => o.setName("giveaway_id").setDescription("Giveaway number").setRequired(true)),
  new SlashCommandBuilder().setName("reroll").setDescription("Reroll giveaway winners")
    .addIntegerOption(o => o.setName("giveaway_id").setDescription("Giveaway number").setRequired(true)),
  new SlashCommandBuilder().setName("say").setDescription("Make the bot send a message")
    .addStringOption(o => o.setName("message").setDescription("Message to send").setRequired(true)),
  new SlashCommandBuilder().setName("dm").setDescription("Send a direct message")
    .addUserOption(o => o.setName("user").setDescription("Recipient").setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("Message text").setRequired(true)),
  new SlashCommandBuilder().setName("role").setDescription("Give a role to a member")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to give").setRequired(true)),
  new SlashCommandBuilder().setName("removerole").setDescription("Remove a role from a member")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to remove").setRequired(true)),
  new SlashCommandBuilder().setName("help").setDescription("Show all bot commands"),
  new SlashCommandBuilder().setName("userinfo").setDescription("Show member information")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(false)),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Show server information"),
  new SlashCommandBuilder().setName("ping").setDescription("Show bot latency"),
  new SlashCommandBuilder().setName("logs").setDescription("Show recent moderation and bot logs")
];

module.exports = commands;
