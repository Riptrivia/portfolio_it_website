# Marcielo Pestcoe — IT Portfolio

An Amiga-inspired, pastel retro-computing portfolio with enterprise IT experience, interactive support labs, practical reuse guides, an embedded Arch Linux virtual machine, and a graphics workbench containing 10 WebGL/3D experiments plus 10 classic demoscene effects.

A responsive, static portfolio covering enterprise endpoint support, mobile-device lifecycle work, hardware repair, certifications, and browser-based support tools.

## Featured content

- City National Bank / Royal Bank of Canada L2 operations portfolio
- Boeing desktop and enterprise mobile support experience
- uBreakiFix mobile setup, diagnostics, and component repair
- Support Note Generator with an adjustable time-and-capacity model
- Ten browser-native labs spanning subnetting, ports, URL inspection, Linux permissions, encoding, security, storage, hardware input, and number systems
- Two printable field guides covering responsible e-waste handling and useful Linux redeployment for older computers
- Embedded Arch Linux browser lab powered by data from the credited v86 project at copy.sh / GitHub `copy/v86` (BSD-2-Clause)
- SHA-256 file verifier, UI component library, and troubleshooting case study
- Verified CompTIA credential links
- Downloadable public résumé PDF
- Secure support-ticket workflow with Gmail intake, customer status access, estimate approval, Google administrator identity, TOTP verification, Cloudflare Workers, and D1

## Run locally

Open `index.html` directly, or serve the repository with any static web server.

## Build

```bash
npm run build
```

The build copies every required page, stylesheet, script, image, project, and server asset into `dist/`. No framework or dependency installation is required.

## Privacy

The portfolio identifies Marcielo and approved public employers. Customer data, ticket numbers, private correspondence, unrelated employee names, and internal procedures are intentionally excluded.

The ticket portal stores live support records in Cloudflare D1 rather than the static site. Customer access requires a private code, administrator access requires the approved Google account plus a time-based authenticator code, and deployment secrets remain outside the repository.
