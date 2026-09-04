# Vendored brand faces

Plus Jakarta Sans and IBM Plex Mono are vendored here rather than loaded from a
CDN, so the app makes no runtime request to Google Fonts. That matters for the
on-prem and air-gapped deployments this product is used in.

| Family | Files | Weights | Licence |
| --- | --- | --- | --- |
| Plus Jakarta Sans | `PlusJakartaSans-*.woff2` | variable, 500-800 | [OFL 1.1](OFL-PlusJakartaSans.txt) |
| IBM Plex Mono | `IBMPlexMono-*.woff2` | 400, 500 | [OFL 1.1](OFL-IBMPlexMono.txt) |

Both are `latin` and `latin-ext` subsets, around 100 kB in total. The
`@font-face` declarations live at the top of `src/globals.css`.

To refresh a subset, take the woff2 URLs from the Google Fonts CSS API for the
family and weights above, and keep the `unicode-range` values in step with the
declarations in `globals.css`.
