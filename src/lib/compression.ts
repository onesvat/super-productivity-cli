const sanitizeBase64 = (input: string): string => {
  const cleaned = input.replace(/[^A-Za-z0-9+/=]/g, "");
  const remainder = cleaned.length % 4;
  if (remainder === 0) return cleaned;
  if (remainder === 1) return cleaned.slice(0, -1);
  return cleaned + "=".repeat(4 - remainder);
};

const readAllBytes = async (readable: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const reader = readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }
  if (chunks.length === 1) return chunks[0];
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

export const compressWithGzip = async (input: string): Promise<Uint8Array> => {
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(input));
  writer.close();
  return readAllBytes(stream.readable);
};

export const compressWithGzipToString = async (input: string): Promise<string> => {
  const compressed = await compressWithGzip(input);
  let binary = "";
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary);
};

export const decompressGzip = async (compressed: Uint8Array): Promise<string> => {
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(compressed as BufferSource);
  writer.close();
  const decompressed = await readAllBytes(stream.readable);
  return new TextDecoder().decode(decompressed);
};

export const decompressGzipFromString = async (
  compressedBase64: string,
): Promise<string> => {
  const sanitized = sanitizeBase64(compressedBase64);
  const binary = atob(sanitized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return decompressGzip(bytes);
};