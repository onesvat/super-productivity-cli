const PREFIX = "pf_";
const END_SEPARATOR = "__";

export interface SyncFilePrefixParams {
  isCompress: boolean;
  isEncrypt: boolean;
  modelVersion: number;
}

export interface SyncFilePrefixOutput {
  isCompressed: boolean;
  isEncrypted: boolean;
  modelVersion: number;
  cleanDataStr: string;
}

export const getSyncFilePrefix = (cfg: SyncFilePrefixParams): string => {
  const c = cfg.isCompress ? "C" : "";
  const e = cfg.isEncrypt ? "E" : "";
  return `${PREFIX}${c}${e}${cfg.modelVersion}${END_SEPARATOR}`;
};

export const extractSyncFileStateFromPrefix = (
  dataStr: string,
): SyncFilePrefixOutput => {
  const match = dataStr.match(
    new RegExp(`^${PREFIX}(C)?(E)?(\\d+(?:\\.\\d+)?)${END_SEPARATOR}`),
  );
  if (!match) {
    throw new Error(
      `Invalid sync file prefix. Expected format: pf_[C][E]<version>__\nGot: ${dataStr.slice(0, 20)}...`,
    );
  }

  return {
    isCompressed: !!match[1],
    isEncrypted: !!match[2],
    modelVersion: parseFloat(match[3]),
    cleanDataStr: dataStr.slice(match[0].length),
  };
};