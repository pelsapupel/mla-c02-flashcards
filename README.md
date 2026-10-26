# MLA-C02 Flashcards

An interactive AWS Machine Learning Engineer study deck with 649 cards.

[Open the hosted app](https://mla-c02-flashcards.vercel.app/)

Tap a card or the Flip card button to reveal its answer. Use Previous and Next to move through the deck. On a keyboard, Space flips, arrow keys navigate, and holding Option / Alt turns the flip button into Random card.

Cards are grouped into exam basics and four study domains. The original 100 cards carry the source label *Guide from docx; the 549 course cards carry *Guide from YT course. Original DOCX cards retain their MLA-C01 exam label.

## Run locally

Requires Node.js 22 or newer. The app and build scripts have no npm dependencies.

    npm run build
    npm start

Open http://127.0.0.1:3000. You can also open or share index.html directly: it contains the styles, JavaScript, and all card data.

On iPhone, open the hosted URL in Safari for interactive flipping. Files preview may disable JavaScript; the page provides all questions and answers as a readable fallback in that case.

## Edit the app

| File | Purpose |
| --- | --- |
| data/deck.json | All card text, IDs, domains, source labels, and course references |
| src/app.js | Flipping, navigation, keyboard shortcuts, and random-card animation |
| src/styles.css | Desktop and mobile styling |
| src/index.template.html | Page layout and build placeholders |
| scripts/build.mjs | Validates sources and generates the standalone page |
| scripts/serve.mjs | Local HTTP preview server |
| index.html | Generated, ready-to-use standalone app |
| vercel.json | Static Vercel deployment configuration |

Edit the source files, run npm run build, and commit the updated index.html with the source changes. npm run check verifies that the generated page matches the source files. The build also produces dist/index.html for deployment.

Each card has id, d (domain), q (question), a (answer), source (docx or yt), and exam fields. Course cards also retain module, slide, and reference metadata from the original training workspace. That workspace's Markdown documents and PDFs are not required to run this app.

Keep cards grouped in the order of the domains object. Preserve existing IDs when updating wording.

## Verify behavior

Check the generated page:

    npm run check

The browser regression script checks every card, source labels, domain assignments, navigation, keyboard shortcuts, random dealing, touch controls, mobile layout, and the offline fallback.

    python3 -m venv .venv
    .venv/bin/python -m pip install -r requirements-dev.txt
    .venv/bin/python -m playwright install chromium
    .venv/bin/python tests/browser.py

To use an existing Chrome installation instead of downloading Chromium, set BROWSER_EXECUTABLE to its executable path before running the browser script.

## Deploy to Vercel

Import this repository in Vercel. The included configuration runs npm run build and publishes the dist directory. No environment variables or backend services are required.

To deploy with an authenticated Vercel CLI from this repository:

    vercel deploy --prod

The generated page has no external resource dependencies and runs offline once saved.
