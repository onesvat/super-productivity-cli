import { argon2id } from "hash-wasm";
import { gcm } from "@noble/ciphers/aes.js";

const ALGORITHM = "AES-GCM" as const;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

const DEFAULT_ARGON2_PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 65536,
};

let _argon2Params = { ...DEFAULT_ARGON2_PARAMS };

export const getArgon2Params = () => _argon2Params;

export const setArgon2ParamsForTesting = (
  params?: Partial<typeof DEFAULT_ARGON2_PARAMS>,
): void => {
  _argon2Params = params
    ? { ...DEFAULT_ARGON2_PARAMS, ...params }
    : { ...DEFAULT_ARGON2_PARAMS };
};

export type DerivedKeyInfo = {
  keyBytes: Uint8Array;
  salt: Uint8Array;
};

const deriveKeyBytesArgon = async (
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> => {
  const params = getArgon2Params();
  return await argon2id({
    password,
    salt,
    hashLength: KEY_LENGTH,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memorySize,
    outputType: "binary",
  });
};

export const base642bytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const bytes2base64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const getRandomBytes = (length: number): Uint8Array => {
  return crypto.getRandomValues(new Uint8Array(length));
};

export const deriveKeyFromPassword = async (
  password: string,
  salt?: Uint8Array,
): Promise<DerivedKeyInfo> => {
  const actualSalt = salt ?? getRandomBytes(SALT_LENGTH);
  const keyBytes = await deriveKeyBytesArgon(password, actualSalt);
  return { keyBytes, salt: actualSalt };
};

export const encryptWithDerivedKey = async (
  data: string,
  keyInfo: DerivedKeyInfo,
): Promise<string> => {
  const enc = new TextEncoder();
  const dataBuffer = enc.encode(data);
  const iv = getRandomBytes(IV_LENGTH);

  const aes = gcm(keyInfo.keyBytes, iv);
  const encryptedContent = aes.encrypt(dataBuffer);

  const buffer = new Uint8Array(
    SALT_LENGTH + IV_LENGTH + encryptedContent.length,
  );
  buffer.set(keyInfo.salt, 0);
  buffer.set(iv, SALT_LENGTH);
  buffer.set(encryptedContent, SALT_LENGTH + IV_LENGTH);

  return bytes2base64(buffer);
};

export const decryptWithDerivedKey = async (
  data: string,
  keyInfo: DerivedKeyInfo,
): Promise<string> => {
  const dataBuffer = base642bytes(data);
  const iv = dataBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const encryptedData = dataBuffer.subarray(SALT_LENGTH + IV_LENGTH);

  const aes = gcm(keyInfo.keyBytes, iv);
  const decryptedContent = aes.decrypt(encryptedData);

  const dec = new TextDecoder();
  return dec.decode(decryptedContent);
};

export const encrypt = async (data: string, password: string): Promise<string> => {
  const keyInfo = await deriveKeyFromPassword(password);
  return encryptWithDerivedKey(data, keyInfo);
};

export const decrypt = async (data: string, password: string): Promise<string> => {
  const dataBuffer = base642bytes(data);
  const salt = dataBuffer.subarray(0, SALT_LENGTH);
  const keyInfo = await deriveKeyFromPassword(password, salt);
  return decryptWithDerivedKey(data, keyInfo);
};

export const encryptBatch = async (
  dataItems: string[],
  password: string,
): Promise<string[]> => {
  if (dataItems.length === 0) return [];

  const keyInfo = await deriveKeyFromPassword(password);
  return Promise.all(dataItems.map((data) => encryptWithDerivedKey(data, keyInfo)));
};

export const decryptBatch = async (
  dataItems: string[],
  password: string,
): Promise<string[]> => {
  if (dataItems.length === 0) return [];

  return Promise.all(dataItems.map((data) => decrypt(data, password)));
};