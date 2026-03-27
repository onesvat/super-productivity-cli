import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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
  const file = Bun.file(CONFIG_FILE);
  if (!(await file.exists())) {
    return {};
  }
  return JSON.parse(await file.text());
};

export const saveConfig = async (config: Config): Promise<void> => {
  ensureConfigDir();
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
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