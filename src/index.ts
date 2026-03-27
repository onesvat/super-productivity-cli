#!/usr/bin/env node
import { Command } from "commander";
import {
  loginCommand,
  logoutCommand,
  encryptKeyCommand,
  statusCommand,
  taskCommand,
  projectCommand,
} from "./commands/index.js";
import { getDropboxConfig } from "./lib/config.js";

const VERSION = "1.0.0";

const program = new Command();

program
  .name("sp")
  .description("Super Productivity CLI - Access your tasks from the command line")
  .version(VERSION);

program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(encryptKeyCommand);
program.addCommand(statusCommand);
program.addCommand(taskCommand);
program.addCommand(projectCommand);

const run = async () => {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const config = await getDropboxConfig();
    if (!config?.accessToken) {
      console.log("Not logged in. Run 'sp login' to authenticate with Dropbox.");
    } else {
      console.log("Logged in to Dropbox.");
      if (config.encryptKey) {
        console.log("Encryption key is set.");
      }
    }
    program.help();
    return;
  }

  await program.parseAsync();
};

run();