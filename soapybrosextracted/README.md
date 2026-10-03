# Soapy Bros website

Static site (plain HTML, CSS, and JavaScript). No build step. Deploys as-is on Cloudflare Pages.

## Adding before/after photos
Drop JPG files into the `gallery/` folder using these names:

`before-1.jpg` + `after-1.jpg`, `before-2.jpg` + `after-2.jpg`, ... up to `before-6.jpg` + `after-6.jpg`

A pair appears on the Home and Services pages only when both files exist. The whole gallery section stays hidden until at least one pair is added. Use the same crop and angle for each before/after pair, landscape (4:3) works best, and keep each file under about 400 KB.
