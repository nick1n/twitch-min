"""Generate nearest-neighbor PNGs from a crisp 32px logo raster, stdlib only."""
from pathlib import Path
import struct
import zlib

output = Path(__file__).resolve().parents[1] / "extension" / "icons"
output.mkdir(parents=True, exist_ok=True)

# Same 32-unit geometry as logo.svg: a bare chat outline.
outer = ((4, 2), (28, 2), (28, 24), (16, 24), (10, 30), (10, 24), (4, 24))
inner = ((8, 6), (8, 20), (14, 20), (14, 21), (15, 20), (24, 20), (24, 6))


def contains(x, y, polygon):
    inside = False
    previous = polygon[-1]
    for current in polygon:
        ax, ay = previous
        bx, by = current
        if (ay > y) != (by > y) and x <= (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
        previous = current
    return inside


def ink(x, y):
    return contains(x, y, outer) and not contains(x, y, inner)


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


# Rasterize once on the SVG's native grid, without antialiasing.
source_size = 32
source = [
    [(145, 70, 255, 255) if ink(x + 0.5, y + 0.5) else (0, 0, 0, 0)
     for x in range(source_size)]
    for y in range(source_size)
]

for size in (16, 32, 48, 128):
    rows = []
    for y in range(size):
        row = bytearray()
        source_y = min(source_size - 1, (2 * y + 1) * source_size // (2 * size))
        for x in range(size):
            source_x = min(source_size - 1, (2 * x + 1) * source_size // (2 * size))
            row.extend(source[source_y][source_x])
        rows.append(b"\x00" + row)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(b"".join(rows)))
    png += chunk(b"IEND", b"")
    (output / f"icon{size}.png").write_bytes(png)

