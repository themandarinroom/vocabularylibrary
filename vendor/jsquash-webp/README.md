# Vendored WebP encoder

The generated encoder in this directory is sourced from `@jsquash/webp` 1.5.0, which packages libwebp for browsers as WebAssembly. Only the non-SIMD encoder needed by Unit Library is included.

The local `encode.js` wrapper supplies Unit Library's quality settings and keeps the static site independent of third-party CDNs. See `LICENSE` and `LICENSE.codec.md` for the applicable Apache 2.0 and libwebp notices.
