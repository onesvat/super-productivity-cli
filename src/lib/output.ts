export interface OutputOptions {
  json?: boolean;
  ndjson?: boolean;
  full?: boolean;
}

export const printMany = <T>(
  items: T[],
  options: OutputOptions,
  serializer: (item: T, full: boolean) => unknown
): void => {
  if (options.ndjson) {
    for (const item of items) {
      const serialized = serializer(item, options.full || false);
      console.log(JSON.stringify(serialized));
    }
    return;
  }

  if (options.json) {
    const serialized = items.map((item) => serializer(item, options.full || false));
    console.log(JSON.stringify(serialized, null, 2));
    return;
  }

  return;
};

export const printOne = <T>(
  item: T,
  options: OutputOptions,
  serializer: (item: T, full: boolean) => unknown
): void => {
  if (options.ndjson) {
    console.log(JSON.stringify(serializer(item, options.full || false)));
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(serializer(item, options.full || false), null, 2));
    return;
  }

  return;
};

export const hasFormatOption = (options: OutputOptions): boolean => {
  return Boolean(options.json || options.ndjson);
};