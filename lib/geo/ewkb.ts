/**
 * Decodes a PostGIS EWKB point as PostgREST returns it — a hex string such as
 * `0101000020E6100000...`.
 *
 * PostgREST hands geography columns back in this form, and there is no way to
 * ask it for plain coordinates without an RPC. Decoding here avoids adding a
 * database function purely to read two numbers back out.
 *
 * Layout: 1 byte endianness, 4 byte type (high bit 0x20000000 flags an embedded
 * SRID), optional 4 byte SRID, then X (longitude) and Y (latitude) as float64.
 */
export function parseEwkbPoint(
  hex: string | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!hex || hex.length < 42) return null;

  try {
    const bytes = Buffer.from(hex, "hex");
    const littleEndian = bytes.readUInt8(0) === 1;

    const readUInt32 = (offset: number) =>
      littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
    const readDouble = (offset: number) =>
      littleEndian ? bytes.readDoubleLE(offset) : bytes.readDoubleBE(offset);

    const type = readUInt32(1);
    const hasSrid = (type & 0x20000000) !== 0;
    const coordsOffset = hasSrid ? 9 : 5;

    const longitude = readDouble(coordsOffset);
    const latitude = readDouble(coordsOffset + 8);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

    return { latitude, longitude };
  } catch {
    return null;
  }
}
