import {
  getDropboxConfig,
  setDropboxConfig,
  clearDropboxTokens,
} from "./config";

export const DROPBOX_APP_KEY = "m7w85uty7m745ph";
export const DROPBOX_SYNC_FILE_PATH = "/sync-data.json";

const DROPBOX_AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const generateRandomString = (length: number): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
};

const sha256 = async (plain: string): Promise<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest("SHA-256", data);
};

const base64URLEncode = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const generatePKCECodes = async (): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> => {
  const codeVerifier = generateRandomString(128);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64URLEncode(hashed);
  return { codeVerifier, codeChallenge };
};

export const getAuthUrl = async (): Promise<{
  authUrl: string;
  codeVerifier: string;
}> => {
  const { codeVerifier, codeChallenge } = await generatePKCECodes();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: DROPBOX_APP_KEY,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    token_access_type: "offline",
  });

  const authUrl = `${DROPBOX_AUTH_URL}?${params.toString()}`;
  return { authUrl, codeVerifier };
};

export const exchangeCodeForTokens = async (
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> => {
  const params = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: DROPBOX_APP_KEY,
    code_verifier: codeVerifier,
  });

  const response = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${errorText}`);
  }

  return response.json();
};

export const refreshAccessToken = async (
  refreshToken: string,
): Promise<TokenResponse> => {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    client_id: DROPBOX_APP_KEY,
  });

  const response = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new Error("Refresh token expired or invalid. Please login again.");
    }
    const errorText = await response.text();
    throw new Error(`Failed to refresh token: ${errorText}`);
  }

  return response.json();
};

export const downloadFile = async (
  path: string = DROPBOX_SYNC_FILE_PATH,
): Promise<{ data: string; rev: string }> => {
  const config = await getDropboxConfig();
  if (!config?.accessToken) {
    throw new Error("Not authenticated. Run 'sp login' first.");
  }

  let accessToken = config.accessToken;

  const doDownload = async (token: string): Promise<Response> => {
    return fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({ path }),
      },
    });
  };

  let response = await doDownload(accessToken);

  if (response.status === 401) {
    if (!config.refreshToken) {
      throw new Error("Session expired. Please login again.");
    }

    const tokens = await refreshAccessToken(config.refreshToken);
    await setDropboxConfig({
      ...config,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || config.refreshToken,
    });
    accessToken = tokens.access_token;
    response = await doDownload(accessToken);
  }

  if (!response.ok) {
    if (response.status === 409) {
      const error = await response.json();
      if (error.error_summary?.includes("path/not_found")) {
        throw new Error(
          "Sync file not found. Please enable Dropbox sync in Super Productivity app first.",
        );
      }
    }
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  const apiResult = response.headers.get("dropbox-api-result");
  if (!apiResult) {
    throw new Error("Missing dropbox-api-result header");
  }

  const meta = JSON.parse(apiResult);
  const data = await response.text();

  return { data, rev: meta.rev };
};

export const checkAuth = async (): Promise<boolean> => {
  const config = await getDropboxConfig();
  if (!config?.accessToken || !config?.refreshToken) {
    return false;
  }

  try {
    const response = await fetch("https://api.dropboxapi.com/2/check/user", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "test" }),
    });

    if (response.status === 401) {
      const tokens = await refreshAccessToken(config.refreshToken);
      await setDropboxConfig({
        ...config,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || config.refreshToken,
      });
      return true;
    }

    return response.ok;
  } catch {
    return false;
  }
};

export const logout = async (): Promise<void> => {
  await clearDropboxTokens();
};