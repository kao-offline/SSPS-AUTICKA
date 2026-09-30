"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { inflateRawSync } from "node:zlib";

function readUInt16LE(buf: Buffer, off: number) {
  return buf.readUInt16LE(off);
}

function readUInt32LE(buf: Buffer, off: number) {
  return buf.readUInt32LE(off);
}

function extractZipEntryBytes(zipBytes: Buffer, targetFileName: string, maxBytes = 256_000) {
  const EOCD_SIG = 0x06054b50;
  const CEN_SIG = 0x02014b50;
  const LOC_SIG = 0x04034b50;

  const minEOCD = 22;
  const maxComment = 0xffff;
  const start = Math.max(0, zipBytes.length - (minEOCD + maxComment));

  let eocd = -1;
  for (let i = zipBytes.length - minEOCD; i >= start; i--) {
    if (zipBytes.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }

  if (eocd === -1) {
    throw new Error("Invalid zip: EOCD not found");
  }

  const cdSize = readUInt32LE(zipBytes, eocd + 12);
  const cdOffset = readUInt32LE(zipBytes, eocd + 16);

  let ptr = cdOffset;
  const end = cdOffset + cdSize;

  const normalizedTarget = targetFileName.replaceAll("\\\\", "/");

  while (ptr + 46 <= end) {
    const sig = readUInt32LE(zipBytes, ptr);
    if (sig !== CEN_SIG) break;

    const compression = readUInt16LE(zipBytes, ptr + 10);
    const compressedSize = readUInt32LE(zipBytes, ptr + 20);
    const uncompressedSize = readUInt32LE(zipBytes, ptr + 24);
    const nameLen = readUInt16LE(zipBytes, ptr + 28);
    const extraLen = readUInt16LE(zipBytes, ptr + 30);
    const commentLen = readUInt16LE(zipBytes, ptr + 32);
    const localHeaderOffset = readUInt32LE(zipBytes, ptr + 42);

    const nameStart = ptr + 46;
    const nameEnd = nameStart + nameLen;
    const fileName = zipBytes.subarray(nameStart, nameEnd).toString("utf8").replaceAll("\\\\", "/");

    const isTarget = fileName === normalizedTarget || fileName.endsWith(`/${normalizedTarget}`);

    if (isTarget) {
      if (uncompressedSize > maxBytes) {
        throw new Error("Manifest too large");
      }

      const locSig = readUInt32LE(zipBytes, localHeaderOffset);
      if (locSig !== LOC_SIG) {
        throw new Error("Invalid zip: local header not found");
      }

      const locNameLen = readUInt16LE(zipBytes, localHeaderOffset + 26);
      const locExtraLen = readUInt16LE(zipBytes, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + locNameLen + locExtraLen;
      const dataEnd = dataStart + compressedSize;

      const compressed = zipBytes.subarray(dataStart, dataEnd);
      let content: Buffer;

      if (compression === 0) {
        content = Buffer.from(compressed);
      } else if (compression === 8) {
        content = inflateRawSync(compressed);
      } else {
        throw new Error(`Unsupported zip compression method: ${compression}`);
      }

      if (content.length > maxBytes) {
        throw new Error("Manifest too large");
      }

      return content;
    }

    ptr = nameEnd + extraLen + commentLen;
  }

  throw new Error(`Missing ${targetFileName} in zip`);
}

function decodeTextWithBom(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    // UTF-16 LE BOM
    return bytes.toString("utf16le");
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    // UTF-16 BE BOM
    let body = Buffer.from(bytes.subarray(2));
    if (body.length % 2 === 1) {
      body = body.subarray(0, body.length - 1);
    }
    body.swap16();
    return body.toString("utf16le");
  }

  return bytes.toString("utf8");
}

function parseServerManifest(zipBytes: Buffer) {
  const manifestBytes = extractZipEntryBytes(zipBytes, "server-manifest.json");
  let manifestText = decodeTextWithBom(manifestBytes);
  manifestText = manifestText.replace(/^\uFEFF/, "").trim();

  let manifest: any;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    const preview = manifestText.slice(0, 200);
    throw new Error(`Invalid server-manifest.json (must be JSON). Preview: ${preview}`);
  }

  const moduleId = String(manifest?.id || "").trim();
  const name = String(manifest?.name || "").trim();
  const version = typeof manifest?.version === "string" ? manifest.version.trim() : undefined;
  const requestedPermissions = Array.isArray(manifest?.requestedPermissions)
    ? manifest.requestedPermissions
    : [];

  const allowedEndpoints = requestedPermissions
    .map((x: any) => String(x).trim())
    .filter(Boolean);

  if (!moduleId || !name) {
    throw new Error("Manifest must include id and name");
  }

  if (allowedEndpoints.length === 0) {
    throw new Error("Manifest must include requestedPermissions with at least one endpoint");
  }

  const entrypoint = typeof manifest?.entrypoint === "string" ? manifest.entrypoint.trim() : "main.py";

  return {
    moduleId,
    name,
    version,
    entrypoint,
    allowedEndpoints,
    manifestText,
  };
}

export const uploadMarketplaceModuleZipAction = action({
  args: {
    zipBase64: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(api.servers.assertAdmin, {});

    const zipBytes = Buffer.from(args.zipBase64, "base64");
    if (zipBytes.length > 15_000_000) {
      throw new Error("Zip too large (max 15MB for now)");
    }

    const artifactFileId = await ctx.storage.store(new Blob([zipBytes], { type: "application/zip" }));

    const parsed = parseServerManifest(zipBytes);

    const { marketplaceId } = await ctx.runMutation(api.servers.upsertMarketplaceModule, {
      moduleId: parsed.moduleId,
      name: parsed.name,
      version: parsed.version,
      entrypoint: parsed.entrypoint,
      manifest: parsed.manifestText,
      artifactFileId,
    });

    return {
      marketplaceId,
      moduleId: parsed.moduleId,
      name: parsed.name,
      version: parsed.version ?? null,
      entrypoint: parsed.entrypoint,
      allowedEndpoints: parsed.allowedEndpoints,
    };
  },
});

// Backwards-compatible action (direct install to a server)
export const uploadServerModuleZipAction = action({
  args: {
    serverId: v.id("servers"),
    zipBase64: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(api.servers.assertAdmin, {});

    const zipBytes = Buffer.from(args.zipBase64, "base64");
    if (zipBytes.length > 15_000_000) {
      throw new Error("Zip too large (max 15MB for now)");
    }

    const artifactFileId = await ctx.storage.store(new Blob([zipBytes], { type: "application/zip" }));

    const parsed = parseServerManifest(zipBytes);

    return await ctx.runMutation(api.servers.createServerModule, {
      serverId: args.serverId,
      moduleId: parsed.moduleId,
      name: parsed.name,
      version: parsed.version,
      entrypoint: parsed.entrypoint,
      manifest: parsed.manifestText,
      artifactFileId,
      allowedEndpoints: parsed.allowedEndpoints,
    });
  },
});