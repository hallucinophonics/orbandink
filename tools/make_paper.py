#!/usr/bin/env python3
"""Write assets/img/paper.png — a seamless tile of book paper for the 3D books.

Mid-grey (128) on average, so CSS can lay it over any colour with
`background-blend-mode: soft-light`: cream text pages and dark endpapers
take the same tile. What it carries, from large to small:
  · formation — the soft cloudiness of pulp settling unevenly on the wire
  · fibres    — short, slightly curved strands, a few darker, a few lighter
  · tooth     — fine grain of the surface
Every layer is periodic by construction (built in Fourier space or drawn
with wrap-around), so the tile repeats without a seam.

Stdlib + numpy only. Re-run after changing the numbers:
    python3 tools/make_paper.py
"""
import struct
import zlib
from pathlib import Path

import numpy as np

N = 256
rng = np.random.default_rng(1871)
OUT = Path(__file__).resolve().parent.parent / "assets" / "img" / "paper.png"


def periodic_noise(beta, lo=0.0, hi=None):
    """1/f^beta noise, periodic on the N×N torus, normalised to unit std."""
    f = np.fft.fftfreq(N)
    fx, fy = np.meshgrid(f, f)
    r = np.sqrt(fx * fx + fy * fy)
    r[0, 0] = 1
    amp = r ** (-beta / 2)
    if lo:
        amp *= 1 - np.exp(-(r / lo) ** 2)
    if hi:
        amp *= np.exp(-(r / hi) ** 2)
    amp[0, 0] = 0
    spec = amp * np.exp(2j * np.pi * rng.random((N, N)))
    n = np.real(np.fft.ifft2(spec))
    return (n - n.mean()) / n.std()


def blur(a, sigma):
    f = np.fft.fftfreq(N)
    fx, fy = np.meshgrid(f, f)
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx * fx + fy * fy))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def fibres(count, length, sign):
    a = np.zeros((N, N))
    for _ in range(count):
        x, y = rng.random(2) * N
        ang = rng.random() * np.pi
        bend = (rng.random() - 0.5) * 0.025
        L = length * (0.5 + rng.random())
        w = 0.4 + rng.random() * 0.6
        for s in np.arange(0, L, 0.35):
            ang += bend
            x += np.cos(ang) * 0.35
            y += np.sin(ang) * 0.35
            a[int(y) % N, int(x) % N] += w
    return sign * blur(a, 0.55)


formation = periodic_noise(2.6, lo=0.004, hi=0.09)
tooth = periodic_noise(0.6, lo=0.18)
fib = fibres(1100, 8, -1.0) + fibres(500, 6, +0.8)
fib = (fib - fib.mean()) / (fib.std() + 1e-9)

img = 128 + 9.0 * formation + 5.0 * tooth + 3.6 * np.clip(fib, -4, 4)
img = np.clip(np.round(img), 0, 255).astype(np.uint8)


def png_gray(arr):
    h, w = arr.shape
    raw = b"".join(b"\x00" + arr[y].tobytes() for y in range(h))
    chunk = lambda t, d: (struct.pack(">I", len(d)) + t + d
                          + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


OUT.write_bytes(png_gray(img))
print(f"{OUT.relative_to(OUT.parent.parent.parent)}  {OUT.stat().st_size // 1024} KB  "
      f"mean {img.mean():.1f}  std {img.std():.1f}")
