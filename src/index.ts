#!/usr/bin/env node
import { Command } from "commander";
import {
  loginCommand,
  logoutCommand,
  encryptKeyCommand,
  statusCommand,
  taskCommand,
  projectCommand,
  counterCommand,
  tagCommand,
  noteCommand,
  stateCommand,
} from "./commands/index.js";
import { getDropboxConfig } from "./lib/config.js";
import { Backend } from "./lib/backend.js";
import { ApiBackend } from "./lib/api-backend.js";
import { DropboxBackend } from "./lib/dropbox-backend.js";
import { checkHealth, DEFAULT_API_URL } from "./lib/api-client.js";

const VERSION = "1.2.0";

let selectedBackend: Backend | null = null;

export const getBackend = (): Backend => {
  if (!selectedBackend) {
    throw new Error("Backend not initialized");
  }
  return selectedBackend;
};

const detectBackend = async (options: { dropbox?: boolean; api?: string }): Promise<Backend> => {
  if (options.dropbox) {
    return new DropboxBackend();
  }
  
  const apiUrl = options.api || process.env.SP_API_URL || DEFAULT_API_URL;
  
  if (options.api) {
    return new ApiBackend(apiUrl);
  }
  
  const isApiAvailable = await checkHealth(apiUrl);
  
  if (isApiAvailable) {
    return new ApiBackend(apiUrl);
  }
  
  return new DropboxBackend();
};

const program = new Command();

program
  .name("sp")
  .description("Super Productivity CLI - Access your tasks from the command line")
  .version(VERSION)
  .option("--dropbox", "Force use Dropbox backend (read-only)")
  .option("--api [url]", "Use Local REST API backend (full read-write)", DEFAULT_API_URL)
  .hook("preAction", async (thisCommand) => {
    const options = thisCommand.opts();
    try {
      selectedBackend = await detectBackend(options);
    } catch (e) {
      console.error(`Error initializing backend: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  });

program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(encryptKeyCommand);
program.addCommand(statusCommand);
program.addCommand(taskCommand);
program.addCommand(projectCommand);
program.addCommand(counterCommand);
program.addCommand(tagCommand);
program.addCommand(noteCommand);
program.addCommand(stateCommand);

const run = async () => {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const config = await getDropboxConfig();
    if (!config?.accessToken) {
      console.log("Not logged in to Dropbox. Run 'sp login' to authenticate.");
    } else {
      console.log("Logged in to Dropbox.");
      if (config.encryptKey) {
        console.log("Encryption key is set.");
      }
    }
    
    try {
      const isApiAvailable = await checkHealth(DEFAULT_API_URL);
      if (isApiAvailable) {
        console.log("Local REST API available at", DEFAULT_API_URL);
      }
    } catch {
      // API not available, silently skip
    }
    
    program.help();
    return;
  }

  await program.parseAsync();
};

run();