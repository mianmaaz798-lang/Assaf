# Assaf Parfums — website

A complete storefront for the Assaf perfume brand. It's a static site written in plain HTML, CSS and JavaScript, with no build step.

## Pages
| Page | File | What it does |
|---|---|---|
| Home | `index.html` | Hero with a 3D tilt bottle, a strip of moving products you can drag (tap any bottle to open it), a scroll showcase where scrolling moves you through the iconic products, scent families, a bestsellers carousel, the brand story, reviews and newsletter signup |
| Shop | `shop.html` | Filters for family and gender, note search and sorting. The URL keeps the filters (e.g. `shop.html?family=Oud`) |
| Product | `product.html?id=…` | Size choice (50/100 ml), quantity, add to bag or buy now, scent notes, specs, accordions, previous/next product, related products and a sticky add-to-bag bar on mobile |
| Bag | `cart.html` + slide-out drawer | Change quantities, remove items, progress bar toward free delivery |
| Checkout | `checkout.html` | Contact and address details, delivery method, payment (card, Apple Pay or cash on delivery), promo code `ASSAF10`, form checks and an order confirmation |
| Our Story | `about.html` | Brand story, milestones and craft |
| Contact | `contact.html` | Boutique details, contact form and FAQ |

## Run locally
```bash
python3 -m http.server 8000
# open http://localhost:8000
```
You can deploy it to any static host (Netlify, Vercel, GitHub Pages, cPanel) by uploading the folder.

## Editing
- **Products:** edit `assets/js/data.js` to change the name, price (SAR, 50 ml), notes, bottle colours, cap finish (`gold|black|silver|rose`) and shape (`square|tall|round`).
- **Colours and fonts:** change the CSS variables at the top of `assets/css/style.css`.
- **Bottle images:** the bottles are drawn as SVG by `assets/js/bottle.js`. To use real product photos, replace the `ASSAF.bottle(p)` calls in `assets/js/main.js` with `<img src="…">`.

## Before going live
- Checkout is a working front end only. To take real payments, connect a payment gateway (e.g. Moyasar, HyperPay, Tap or Stripe) or move the catalogue to Shopify or WooCommerce.
- The bag is saved in the browser (localStorage).
- Replace the placeholder contact details, address, phone and social links in `contact.html` and `assets/js/main.js`.
