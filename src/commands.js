const { SlashCommandBuilder, ChannelType } = require("discord.js");

const commands = [
  new SlashCommandBuilder().setName("ban").setDescription("Ban a member")
    .addUserOption(o => o.setName("user").setDescription("Member to ban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("unban").setDescription("Unban a user")
    .addStringOption(o => o.setName("userid").setDescription("Discord user ID").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("kick").setDescription("Kick a member")
    .addUserOption(o => o.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member")
    .addUserOption(o => o.setName("user").setDescription("Member to timeout").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Examples: 10m, 2h, 1d").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("untimeout").setDescription("Remove a member timeout")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("warn").setDescription("Warn a member")
    .addUserOption(o => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName("warnings").setDescription("Show a member's warnings")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)),
  new SlashCommandBuilder().setName("clearwarn").setDescription("Delete one warning")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addIntegerOption(o => o.setName("warningid").setDescription("Warning number").setRequired(true)),
  new SlashCommandBuilder().setName("clear").setDescription("Delete recent messages")
    .addIntegerOption(o => o.setName("amount").setDescription("1 to 100").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("ticket").setDescription("Create a support ticket")
    .addStringOption(o => o.setName("category").setDescription("Ticket category").addChoices(
      { name: "Support", value: "support" },
      { name: "Complaint", value: "complaint" },
      { name: "Partnership", value: "partnership" }
    )),
  new SlashCommandBuilder().setName("close").setDescription("Close this ticket"),
  new SlashCommandBuilder().setName("reopen").setDescription("Reopen this ticket"),
  new SlashCommandBuilder().setName("delete").setDescription("Delete this ticket"),
  new SlashCommandBuilder().setName("add").setDescription("Add a member to this ticket")
    .addUserOption(o => o.setName("user").setDescription("Member to add").setRequired(true)),
  new SlashCommandBuilder().setName("remove").setDescription("Remove a member from this ticket")
    .addUserOption(o => o.setName("user").setDescription("Member to remove").setRequired(true)),
  new SlashCommandBuilder().setName("claim").setDescription("Claim this ticket"),
  new SlashCommandBuilder().setName("giveaway").setDescription("Start a giveaway")
    .addStringOption(o => o.setName("prize").setDescription("Giveaway prize").setMaxLength(200).setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Examples: 10m, 2h, 1d").setRequired(true))
    .addIntegerOption(o => o.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(20).setRequired(true))
    .addChannelOption(o => o.setName("channel").setDescription("Where to post").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("giveawaylist").setDescription("List active giveaways"),
  new SlashCommandBuilder().setName("endgiveaway").setDescription("End a giveaway")
    .addIntegerOption(o => o.setName("giveawayid").setDescription("Giveaway number").setRequired(true)),
  new SlashCommandBuilder().setName("reroll").setDescription("Reroll giveaway winners")
    .addIntegerOption(o => o.setName("giveawayid").setDescription("Giveaway number").setRequired(true)),
  new SlashCommandBuilder().setName("say").setDescription("Make the bot send a message")
    .addStringOption(o => o.setName("message").setDescription("Message to send").setMaxLength(2000).setRequired(true)),
  new SlashCommandBuilder().setName("dm").setDescription("Send a direct message")
    .addUserOption(o => o.setName("user").setDescription("Recipient").setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("Message text").setMaxLength(2000).setRequired(true)),
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
  new SlashCommandBuilder().setName("maintenance").setDescription("Enable or disable server maintenance")
    .addBooleanOption(o => o.setName("enabled").setDescription("Enable maintenance mode").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Maintenance notice").setMaxLength(500)),
  new SlashCommandBuilder().setName("lock").setDescription("Lock this text channel"),
  new SlashCommandBuilder().setName("unlock").setDescription("Unlock this text channel"),
  new SlashCommandBuilder().setName("slowmode").setDescription("Set channel slowmode")
    .addIntegerOption(o => o.setName("seconds").setDescription("0 to 21600 seconds").setMinValue(0).setMaxValue(21600).setRequired(true)),
  new SlashCommandBuilder().setName("announce").setDescription("Send an announcement embed")
    .addStringOption(o => o.setName("message").setDescription("Announcement text").setMaxLength(2000).setRequired(true)),
  new SlashCommandBuilder().setName("notify").setDescription("Send a notification, optionally pinging a role")
    .addStringOption(o => o.setName("message").setDescription("Notification text").setMaxLength(2000).setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to notify")),
  new SlashCommandBuilder().setName("reminder").setDescription("Set a personal reminder")
    .addStringOption(o => o.setName("duration").setDescription("Examples: 10m, 2h, 1d").setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("What should I remind you about?").setMaxLength(1000).setRequired(true)),
  new SlashCommandBuilder().setName("welcome").setDescription("Configure the welcome channel and message")
    .addChannelOption(o => o.setName("channel").setDescription("Welcome channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("Use {user}, {username}, {server}, {count}").setMaxLength(1500).setRequired(true)),
  new SlashCommandBuilder().setName("autorole").setDescription("Set the automatic role for new members")
    .addRoleOption(o => o.setName("role").setDescription("Role assigned to new members").setRequired(true)),
  new SlashCommandBuilder().setName("suggestions").setDescription("Set the suggestions channel")
    .addChannelOption(o => o.setName("channel").setDescription("Suggestions channel").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("suggest").setDescription("Submit a server suggestion")
    .addStringOption(o => o.setName("content").setDescription("Your suggestion").setMinLength(5).setMaxLength(1500).setRequired(true)),
  new SlashCommandBuilder().setName("applications").setDescription("Set the staff applications channel")
    .addChannelOption(o => o.setName("channel").setDescription("Applications channel").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("apply").setDescription("Submit a staff application"),
  new SlashCommandBuilder().setName("ticketconfig").setDescription("Configure ticket transcripts and category channels")
    .addChannelOption(o => o.setName("transcriptchannel").setDescription("Transcript channel").addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o => o.setName("supportcategory").setDescription("Support category").addChannelTypes(ChannelType.GuildCategory))
    .addChannelOption(o => o.setName("complaintcategory").setDescription("Complaint category").addChannelTypes(ChannelType.GuildCategory))
    .addChannelOption(o => o.setName("partnershipcategory").setDescription("Partnership category").addChannelTypes(ChannelType.GuildCategory)),
  new SlashCommandBuilder().setName("antiswear").setDescription("Manage the blocked-word filter")
    .addStringOption(o => o.setName("action").setDescription("What to do").setRequired(true).addChoices(
      { name: "Add word", value: "add" }, { name: "Remove word", value: "remove" }, { name: "List words", value: "list" }
    ))
    .addStringOption(o => o.setName("word").setDescription("Word to add or remove").setMaxLength(80)),
  new SlashCommandBuilder().setName("level").setDescription("Show a member's level")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(false)),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Show the server XP leaderboard"),
  new SlashCommandBuilder().setName("invites").setDescription("Show invite counts")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(false)),
  new SlashCommandBuilder().setName("achievements").setDescription("Show unlocked achievements")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(false)),
    new SlashCommandBuilder().setName("logs").setDescription("Show recent moderation and bot logs")
];

module.exports = commands;
