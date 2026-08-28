import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";

/** Hash bytes, never an object key or storage-provider ETag. Streams keep large videos off the heap. */
export async function hashContent(stream: Readable): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

export function hashFileContent(path: string): Promise<string> {
  return hashContent(createReadStream(path));
}
