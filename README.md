# Kebron OS

My personal site, shaped like a Mac, live at [kebronze.com](https://kebronze.com). It has a live ocean as the wallpaper, a README, my projects, North Star (a map of the questions, thoughts and sources I keep coming back to) and an iPod with my music. The standard version of the site is [kebron.org](https://kebron.org).

## Credits

- **[ryOS](https://github.com/ryokun6/ryos)** by Ryo Lu. This is a fork of it and is licensed under AGPL-3.0, like the original. See [LICENSE](LICENSE).
- **Ocean** by [web-ocean](https://github.com/Noniv/web-ocean) (Noniv, WebGPU), under MIT, in `src/components/layout/desktop/ocean/vendor/web-ocean`. Phones, tablets and browsers without WebGPU get the lighter ocean by [NAGI](https://github.com/noxellab/nagi-ocean-sim), under MIT, with its notices in `src/components/layout/desktop/ocean/vendor/nagi`, lit by web-ocean's dawn sky baked with `scripts/bake-dawn-sky.ts`.

## Run it

```bash
bun install
npx vite --port 5200          # front end only; no API server is needed
npx vite build                # static build → dist/
npx wrangler deploy           # serves dist/ on Cloudflare (wrangler.jsonc)
```

The site's content (README, Projects, North Star) is seeded from `public/data/filesystem.json`, and the iPod's songs come from `public/data/ipod-videos.json`.
