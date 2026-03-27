import { extractSyncFileStateFromPrefix } from "./sync-file";
import { decompressGzip, decompressGzipFromString } from "./compression";
import { decrypt } from "./encryption";
import { getDropboxConfig } from "./config";

export interface SyncData {
  version: number;
  syncVersion: number;
  schemaVersion: number;
  vectorClock: Record<string, number>;
  lastModified: number;
  clientId: string;
  state: {
    task: { ids: string[]; entities: Record<string, unknown> };
    project: { ids: string[]; entities: Record<string, unknown> };
    tag: { ids: string[]; entities: Record<string, unknown> };
    simpleCounter?: { ids: string[]; entities: Record<string, unknown> };
    [key: string]: unknown;
  };
  archiveYoung?: Record<string, unknown>;
  archiveOld?: Record<string, unknown>;
  recentOps?: unknown[];
}

export class DecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptError";
  }
}

const fixUtf8Corruption = (bytes: Uint8Array): Uint8Array => {
  const result: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0xc2 && i + 1 < bytes.length) {
      result.push(bytes[i + 1]);
      i += 2;
    } else if (b === 0xc3 && i + 1 < bytes.length) {
      result.push(bytes[i + 1] + 0x40);
      i += 2;
    } else {
      result.push(b);
      i += 1;
    }
  }
  return new Uint8Array(result);
};

const isGzip = (bytes: Uint8Array): boolean => {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
};

export const processSyncFile = async (
  dataStr: string,
): Promise<SyncData> => {
  const text = dataStr.trim();

  if (text.startsWith("{")) {
    try {
      return JSON.parse(text) as SyncData;
    } catch {
    }
  }

  if (text.startsWith("pf_")) {
    const { isCompressed, isEncrypted, cleanDataStr } =
      extractSyncFileStateFromPrefix(text);

    let processed = cleanDataStr;

    if (isEncrypted) {
      const config = await getDropboxConfig();
      if (!config?.encryptKey) {
        throw new DecryptError(
          "Sync file is encrypted. Set encryption key: sp encrypt-key <password>",
        );
      }

      try {
        processed = await decrypt(processed, config.encryptKey);
      } catch (e) {
        throw new DecryptError(
          `Failed to decrypt sync file. Wrong password? Error: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    if (isCompressed) {
      processed = await decompressGzipFromString(processed);
    }

    try {
      return JSON.parse(processed) as SyncData;
    } catch (e) {
      throw new Error(
        `Failed to parse sync file as JSON: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  const encoder = new TextEncoder();
  let bytes = encoder.encode(text);

  if (bytes[0] === 0x1f && bytes[1] === 0xc2) {
    bytes = fixUtf8Corruption(bytes);
  }

  if (isGzip(bytes)) {
    try {
      const decompressed = await decompressGzip(bytes);
      return JSON.parse(decompressed) as SyncData;
    } catch (e) {
      throw new Error(`Failed to decompress gzip sync file: ${e instanceof Error ? e.message : e}`);
    }
  }

  const config = await getDropboxConfig();
  if (config?.encryptKey) {
    try {
      const decrypted = await decrypt(text, config.encryptKey);
      if (decrypted.startsWith("{")) {
        return JSON.parse(decrypted) as SyncData;
      }
      const decBytes = encoder.encode(decrypted);
      if (isGzip(decBytes)) {
        const decompressed = await decompressGzip(decBytes);
        return JSON.parse(decompressed) as SyncData;
      }
    } catch {
    }
  }

  throw new Error(
    "Unable to parse sync file. It may be encrypted - set key with: sp encrypt-key <password>",
  );
};