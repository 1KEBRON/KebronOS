import sharp from "sharp";

// NAGI samples red and green as independent masks. Ordinary lossy WebP's chroma
// subsampling mixes them; near-lossless bounds the error to two 8-bit code values.
await sharp("public/ocean/foam-pattern.webp")
  .webp({ nearLossless: true, quality: 60, effort: 6 })
  .toFile("public/ocean/foam-pattern-v2.webp");
