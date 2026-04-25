import { UTApi, UTFile } from 'uploadthing/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

const ALLOWED_PREFIXES = ['image/', 'video/', 'audio/'];
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

export type UploadKind = 'avatar' | 'image' | 'video' | 'voice' | 'file';

export interface UploadResult {
  url: string;
  mimeType: string;
  size: number;
}

let utapi: UTApi | null = null;
function getUtApi(): UTApi {
  if (!utapi) {
    utapi = new UTApi({
      token: process.env.UPLOADTHING_TOKEN,
    });
  }
  return utapi;
}

export async function saveUpload(file: File, kind: UploadKind): Promise<UploadResult> {
  if (file.size > MAX_BYTES) throw new Error('файл слишком большой (макс 25 MB)');
  const isAllowed =
    kind === 'file' || ALLOWED_PREFIXES.some((p) => file.type.startsWith(p));
  if (!isAllowed) throw new Error('недопустимый тип файла');

  // Cloud (UploadThing) когда задан токен — production
  if (process.env.UPLOADTHING_TOKEN) {
    const ext = mimeToExt(file.type) || path.extname(file.name) || '.bin';
    const utFile = new UTFile(
      [Buffer.from(await file.arrayBuffer())],
      `${kind}-${crypto.randomBytes(12).toString('hex')}${ext}`,
      { type: file.type },
    );
    const res = await getUtApi().uploadFiles(utFile);
    if (res.error || !res.data) {
      throw new Error(res.error?.message ?? 'не удалось загрузить файл');
    }
    return { url: res.data.ufsUrl, mimeType: file.type, size: file.size };
  }

  // Локальный fallback — для dev окружения
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const ext = mimeToExt(file.type) || path.extname(file.name) || '.bin';
  const name = `${kind}-${crypto.randomBytes(12).toString('hex')}${ext}`;
  const fullPath = path.join(UPLOAD_DIR, name);
  await fs.writeFile(fullPath, Buffer.from(await file.arrayBuffer()));
  return { url: `/uploads/${name}`, mimeType: file.type, size: file.size };
}

function mimeToExt(mime: string): string | null {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
  };
  return map[mime] ?? null;
}
