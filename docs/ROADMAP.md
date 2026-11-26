# Roadmap

What comes next. CHANGELOG.md has what has shipped.

## Next release

### Integrations

- [ ] Bambu Lab printers without Home Assistant, straight from the printer (newer firmware needs its Developer Mode)
- [ ] TP-Link Omada
- [ ] Backrest
- [ ] Kavita, Komga

### The car as a live engineering drawing

The car widget's Dashboard style is a live drawing sheet you can open part
by part. Next for it:

- [ ] A specification table you fill in: trim, wheels, battery, paint
- [ ] The poster: the sheet as the 1-bit panel image, for a framed e-ink display
- [ ] Every Tesla: overhangs for Model Y, S and X, Cybertruck's figures, and a
  drawn fallback for each

### Running it anywhere

- [ ] Patchboard in the TrueNAS app catalog and Unraid's Community Applications
- [ ] A Proxmox LXC script, and running from Node without Docker

### Polish

- [ ] Accessibility audit: keyboard paths, screen-reader labels, contrast in every theme
  - Covered: Home and editor keyboard paths, focus return, canceled drafts, contrast of every text in every theme and e-ink, accessible names, a read-through of every page's accessibility tree, narrow reflow, forced-color graphics, actual Chromium zoom, Firefox text-only zoom, enlarged text, and phone tap targets and placeholders.
  - Remaining: a spoken screen-reader walkthrough and native Windows contrast themes. See [Accessibility checks](ACCESSIBILITY.md).

Open an issue if you want something here sooner or don't see it here.
