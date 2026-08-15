import { afterEach, vi } from 'vitest';

/**
 * jsdom implements neither of these, and vi.spyOn cannot stub a method that
 * does not exist. Defining them here lets download paths be tested for real
 * rather than skipped.
 */
const objectUrls = new Map<string, Blob>();
/** Survives revokeObjectURL so assertions can still read what was downloaded. */
const archive = new Map<string, Blob>();
let counter = 0;

Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: (blob: Blob) => {
    const url = `blob:hypewall/${(counter += 1)}`;
    objectUrls.set(url, blob);
    archive.set(url, blob);
    return url;
  },
});

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: (url: string) => {
    objectUrls.delete(url);
  },
});

/** jsdom ships Blob without text(), which assertions on exported files need. */
if (typeof Blob.prototype.text !== 'function') {
  Object.defineProperty(Blob.prototype, 'text', {
    writable: true,
    value(this: Blob) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    },
  });
}

/**
 * Test-only accessor for whatever a download handed to createObjectURL.
 * downloadBlob revokes the URL synchronously after clicking, so this reads the
 * archive rather than the live map.
 */
export function blobForUrl(url: string): Blob | undefined {
  return archive.get(url) ?? [...archive.values()].pop();
}

afterEach(() => {
  vi.restoreAllMocks();
  objectUrls.clear();
  archive.clear();
});
