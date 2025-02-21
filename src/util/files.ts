import pako from 'pako';
import { CONTENT_TYPES_WITH_PREVIEW } from '../config';
import { pause } from './schedulers';

// Polyfill for Safari: `File` is not available in web worker
if (typeof File === 'undefined') {
  // eslint-disable-next-line no-global-assign, no-restricted-globals, func-names
  self.File = class extends Blob {
    name: string;

    constructor(fileBits: BlobPart[], fileName: string, options?: FilePropertyBag) {
      if (options) {
        const { type, ...rest } = options;
        super(fileBits, { type });
        Object.assign(this, rest);
      } else {
        super(fileBits);
      }

      this.name = fileName;
    }
  } as typeof File;
}

export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      const { result } = e.target || {};
      if (typeof result === 'string') {
        resolve(result);
      }

      reject(new Error('Failed to read blob'));
    };

    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function blobToFile(blob: Blob, fileName: string) {
  return new File([blob], fileName, {
    lastModified: Date.now(),
    type: blob.type,
  });
}

export function preloadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.complete ? resolve(img) : img.onload = () => resolve(img); // fix when image is cached
    img.onerror = reject;
  });
}

export function preloadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.volume = 0;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = reject;
    video.src = url;
  });
}

export async function createPosterForVideo(url: string): Promise<string | undefined> {
  try {
    const video = await preloadVideo(url);

    return await Promise.race([
      pause(2000) as Promise<undefined>,
      new Promise<string | undefined>((resolve, reject) => {
        video.onseeked = () => {
          if (!video.videoWidth || !video.videoHeight) {
            resolve(undefined);
          }

          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(video, 0, 0);

          canvas.toBlob((blob) => {
            resolve(blob ? URL.createObjectURL(blob) : undefined);
          });
        };
        video.onerror = reject;
        video.currentTime = Math.min(video.duration, 1);
      }),
    ]);
  } catch (e) {
    return undefined;
  }
}

export async function fetchBlob(blobUrl: string) {
  const response = await fetch(blobUrl);
  return response.blob();
}

export async function fetchFile(blobUrl: string, fileName: string) {
  const blob = await fetchBlob(blobUrl);
  return blobToFile(blob, fileName);
}

export function imgToCanvas(img: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  return canvas;
}

export function hasPreview(file: File) {
  return CONTENT_TYPES_WITH_PREVIEW.has(file.type);
}

export function validateFiles(files: File[] | FileList | null): File[] | undefined {
  if (!files?.length) {
    return undefined;
  }
  return Array.from(files).map(fixMovMime).filter((file) => file.size);
}

// .mov MIME type not reported sometimes https://developer.mozilla.org/en-US/docs/Web/API/File/type#sect1
function fixMovMime(file: File) {
  const ext = file.name.split('.').pop()!;
  if (!file.type && ext.toLowerCase() === 'mov') {
    return new File([file], file.name, { type: 'video/quicktime' });
  }
  return file;
}

export const uncompressTGV = async (blob: Blob): Promise<Blob> => {
  const buffer = await blob.arrayBuffer();
  let newBuffer;
  if (false) { // isFirefox -> when imported, app crashes
    const text = fixFirefoxSvg(gzipUncompress(buffer, true) as string);
    const textEncoder = new TextEncoder();
    newBuffer = textEncoder.encode(text);
  } else {
    newBuffer = gzipUncompress(buffer, false) as Uint8Array;
  }

  return new Blob([newBuffer], { type: 'image/svg+xml' });
};

function fixFirefoxSvg(text: string) {
  const svgIndex = text.indexOf('<svg');
  if (svgIndex !== 0) {
    text = text.slice(svgIndex);
  }

  const match = text.match(/viewBox="(.+?)"/);
  if (!match) {
    throw new Error('viewBox attribute not found in SVG text');
  }
  const parts = match[1].split(' ');
  if (parts.length !== 4) {
    throw new Error('Unexpected viewBox format');
  }
  const [_, __, width, height] = parts;
  text = text.replace(/>/, ` width="${width}" height="${height}">`).replace(/[^\x00-\x7F]/g, '');
  return text;
}

function gzipUncompress(bytes: ArrayBuffer, toString?: boolean): string | Uint8Array {
  const result = pako.inflate(bytes, toString ? {to: 'string'} : undefined);
  return result;
}