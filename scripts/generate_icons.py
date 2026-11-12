"""Generate the extension's simple bar mark as PNGs, using the standard library."""
from pathlib import Path
import struct
import zlib

output = Path(__file__).resolve().parents[1] / "extension" / "icons"
output.mkdir(parents=True, exist_ok=True)


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


for size in (16, 32, 48, 128):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            nx, ny = (x + 0.5) / size, (y + 0.5) / size
            # Purple rounded-square field; three light bars match the popup mark.
            dx = max(0, abs(nx - 0.5) - 0.28)
            dy = max(0, abs(ny - 0.5) - 0.28)
            inside = dx * dx + dy * dy <= 0.19 * 0.19
            pixel = (114, 65, 185, 255) if inside else (0, 0, 0, 0)
            for left, top in ((0.25, 0.48), (0.44, 0.28), (0.63, 0.39)):
                if left <= nx <= left + 0.12 and top <= ny <= 0.73:
                    pixel = (246, 239, 255, 255)
            row.extend(pixel)
        rows.append(b"\x00" + row)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(b"".join(rows)))
    png += chunk(b"IEND", b"")
    (output / f"icon{size}.png").write_bytes(png)
