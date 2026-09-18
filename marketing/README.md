# Detail Instagram launch carousel

The campaign uses Detail purple (`#3906D2`), deep ink (`#0D0A24` / `#0F0B2E`), the Detail vector mark, Manrope headings, DM Sans body text, and Catalyst Labs ownership.

## Formats

The generator produces 14 files under the ignored `marketing/generated/` directory:

- `detail-instagram-carousel-feed-4x5.pdf` — six 1080 × 1350 pages for an Instagram feed carousel.
- `feed-4x5-png/detail-slide-01.png` through `06.png` — directly upload these images to Instagram in numeric order.
- `detail-instagram-carousel-story-9x16.pdf` — six 1080 × 1920 pages for Stories/Reels.
- `story-9x16-png/*` — directly usable 9:16 exports.

A 9:16 ratio is correct for Stories and Reels. A portrait feed carousel is best delivered at 4:5, which is why both formats are generated.

## Cloudflare KV storage

Generated binaries are deliberately not committed to Git. The **Publish marketing assets to Cloudflare KV** workflow:

1. installs pinned generation dependencies;
2. downloads the OFL fonts from the canonical Google Fonts repository;
3. regenerates all PDFs and PNGs;
4. creates or reuses the `detail-marketing-assets` KV namespace;
5. uploads all 14 files through the Cloudflare REST API; and
6. publishes a read-only Worker backed by that KV namespace.

The workflow summary prints the public Worker library URL. `/` returns the JSON manifest and `/assets/<key>` returns an asset. Add `?download=1` for a download response.

Required protected GitHub production configuration:

- Variable `CLOUDFLARE_ACCOUNT_ID`
- Secret `CLOUDFLARE_API_TOKEN` with **Workers KV Storage: Edit** and **Workers Scripts: Edit** for the account

No Cloudflare credential is bundled into either website. The local uploader uses the same API when those two environment variables are available:

```bash
python3 -m pip install -r scripts/requirements-marketing.txt
python3 scripts/generate-instagram-carousel.py
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  python3 scripts/upload-marketing-assets-cloudflare.py
```

## Slide sequence

1. Pioneering on-demand cleaning in Zimbabwe.
2. House and car cleaning.
3. Post, compare and choose.
4. Cleaner opportunity and reputation building.
5. Profiles, tracking, payments and ratings.
6. Join at `detail.co.zw` or WhatsApp `+263 71 488 5936`.

The wording deliberately says “pioneering” rather than making an unverifiable absolute “first ever” claim. Confirm competitive/legal substantiation before changing it to an absolute market-leadership claim.
