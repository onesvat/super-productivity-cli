import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR =
  process.env.SP_CLI_CONFIG_DIR || join(homedir(), ".config/super-productivity-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface DropboxConfig {
  accessToken: string;
  refreshToken: string;
  encryptKey?: string;
}

export interface Config {
  dropbox?: DropboxConfig;
}

export const ensureConfigDir = (): void => {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
};

export const loadConfig = async (): Promise<Config> => {
  ensureConfigDir();
  try {
    const content = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
};

export const saveConfig = async (config: Config): Promise<void> => {
  ensureConfigDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
};

export const getDropboxConfig = async (): Promise<DropboxConfig | null> => {
  const config = await loadConfig();
  return config.dropbox || null;
};

export const setDropboxConfig = async (cfg: DropboxConfig): Promise<void> => {
  const config = await loadConfig();
  config.dropbox = cfg;
  await saveConfig(config);
};

export const clearDropboxTokens = async (): Promise<void> => {
  const config = await loadConfig();
  if (config.dropbox) {
    config.dropbox.accessToken = "";
    config.dropbox.refreshToken = "";
    await saveConfig(config);
  }
};

export const setEncryptKey = async (key: string): Promise<void> => {
  const config = await loadConfig();
  if (!config.dropbox) {
    config.dropbox = { accessToken: "", refreshToken: "", encryptKey: key };
  } else {
    config.dropbox.encryptKey = key;
  }
  await saveConfig(config);
};

export const clearEncryptKey = async (): Promise<void> => {
  const config = await loadConfig();
  if (config.dropbox) {
    delete config.dropbox.encryptKey;
    await saveConfig(config);
  }
};