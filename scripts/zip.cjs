// Minimal classic ZIP codec for local release archives (UTF-8 names, deflate).
const { crc32, deflateRawSync, inflateRawSync } = require('node:zlib');
const assert = require('node:assert/strict');

function createZip(entries) {
  const local = [], central = [];
  let offset = 0;
  assert.ok(entries.length < 65535, 'ZIP64 is not supported');
  for (const { name, data } of entries) {
    const filename = Buffer.from(name), compressed = deflateRawSync(data);
    assert.ok(filename.length <= 65535 && data.length < 0xffffffff && offset < 0xffffffff, 'ZIP64 is not supported');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    header.copy(record, 6, 4, 30);
    record.writeUInt32LE(offset, 42);
    central.push(record, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  assert.ok(offset + directory.length < 0xffffffff, 'ZIP64 is not supported');
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function readZip(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50, 'ZIP end record');
  assert.equal(bytes.readUInt32LE(end + 4), 0, 'single disk ZIP');
  const count = bytes.readUInt16LE(end + 10);
  assert.equal(bytes.readUInt16LE(end + 8), count);
  let cursor = bytes.readUInt32LE(end + 16);
  const start = cursor, entries = [];
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, 'ZIP directory record');
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    assert.equal(flags, 0x800); assert.equal(method, 8);
    const crc = bytes.readUInt32LE(cursor + 16), size = bytes.readUInt32LE(cursor + 20);
    const length = bytes.readUInt32LE(cursor + 24), nameLength = bytes.readUInt16LE(cursor + 28);
    const filename = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const local = bytes.readUInt32LE(cursor + 42);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    assert.equal(bytes.readUInt16LE(local + 6), flags);
    assert.equal(bytes.readUInt16LE(local + 8), method);
    assert.equal(bytes.readUInt32LE(local + 14), crc);
    assert.equal(bytes.readUInt32LE(local + 18), size);
    assert.equal(bytes.readUInt32LE(local + 22), length);
    assert.equal(bytes.readUInt16LE(local + 26), nameLength);
    assert.deepEqual(bytes.subarray(local + 30, local + 30 + nameLength), filename);
    const dataStart = local + 30 + nameLength + bytes.readUInt16LE(local + 28);
    assert.ok(dataStart + size <= start);
    const data = inflateRawSync(bytes.subarray(dataStart, dataStart + size), { maxOutputLength: Math.max(1, length) });
    assert.equal(data.length, length); assert.equal(crc32(data), crc);
    entries.push({ name: filename.toString('utf8'), data });
    cursor += 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
  assert.equal(cursor, end); assert.equal(cursor - start, bytes.readUInt32LE(end + 12));
  return entries;
}

module.exports = { createZip, readZip };
