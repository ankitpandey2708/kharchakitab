"use client";

import { ERROR_MESSAGES } from "@/src/utils/error";

const HEIC_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const HEIC_BRANDS = [
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
];

const sniffHeicByMagic = async (blob: Blob): Promise<boolean> => {
  try {
    const header = await blob.slice(0, 64).arrayBuffer();
    const ascii = new TextDecoder("ascii").decode(header);
    if (!ascii.includes("ftyp")) return false;
    return HEIC_BRANDS.some((brand) => ascii.includes(`ftyp${brand}`));
  } catch (error) {
    return false;
  }
};

const toJpeg = async (blob: Blob) => {
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({
    blob,
    toType: "image/jpeg",
    quality: 0.9,
  });
  const output = Array.isArray(converted) ? converted[0] : converted;
  if (!(output instanceof Blob)) {
    throw new Error(ERROR_MESSAGES.unableToConvertHeicImage);
  }
  return output;
};

const asFile = (blob: Blob, name: string) =>
  new File([blob], name, { type: blob.type || "image/jpeg" });

export const prepareReceiptImage = async (blob: Blob): Promise<Blob> => {
  if (typeof window === "undefined") {
    return blob;
  }

  let normalized = blob;
  const heicByType = HEIC_TYPES.has(blob.type);
  const heicByMagic = heicByType ? false : await sniffHeicByMagic(blob);
  if (heicByType || heicByMagic) {
    try {
      normalized = await toJpeg(blob);
    } catch (error) {
      throw new Error(ERROR_MESSAGES.heicImageCouldNotBeProcessed);
    }
  }

  const file = asFile(normalized, "receipt.jpg");
  const { default: imageCompression } = await import("browser-image-compression");
  const compressed = await imageCompression(file, {
    maxSizeMB: 1.5,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: normalized.type || "image/jpeg",
  });

  return compressed instanceof Blob ? compressed : normalized;
};
