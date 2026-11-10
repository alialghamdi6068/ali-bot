require("dotenv").config();

const { REST, Routes } = require("discord.js");
const commands = require("../src/commands");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error("DISCORD_TOKEN, CLIENT_ID, and GUILD_ID are required in .env.");
}

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Deploying ${commands.length} slash commands to guild ${GUILD_ID}...`);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands.map(command => command.toJSON())
    });
    console.log("Slash commands deployed successfully.");
  } catch (error) {
    console.error("Failed to deploy slash commands:", error);
    process.exitCode = 1;
  }
})();
