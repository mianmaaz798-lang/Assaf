# Assaf Parfums — website

A complete storefront for the Assaf perfume brand. It's a static site written in plain HTML, CSS and JavaScript, with no build step.

## Pages
| Page | File | What it does |
|---|---|---|
| Home | `index.html` | Hero with a 3D tilt bottle, a strip of moving products you can drag (tap any bottle to open it), a scroll showcase where scrolling moves you through the iconic products, scent families, a bestsellers carousel, the brand story, reviews and newsletter signup |
| Shop | `shop.html` | Filters for family and gender, note search and sorting. The URL keeps the filters (e.g. `shop.html?family=Oud`) |
| Product | `product.html?id=…` | Size choice (50/100 ml), quantity, add to bag or buy now, scent notes, specs, accordions, previous/next product, related products and a sticky add-to-bag bar on mobile |
| Bag | `cart.html` + slide-out drawer | Change quantities, remove items, progress bar toward free delivery |
| Checkout | `checkout.html` | Contact and address details for the UAE, KSA and GCC, payment by card or Tamara, form checks and an order confirmation |
| Our Story | `about.html` | Brand story, milestones and craft |
| Contact | `contact.html` | Boutique details, contact form and FAQ |

## Run locally
```bash
python3 -m http.server 8000
# open http://localhost:8000
```
You can deploy it to any static host (Netlify, Vercel, GitHub Pages, cPanel) by uploading the folder.

## Products (imported from assaf.ae)
The catalogue in `assets/js/data.js` and the photos in `assets/img/products/` are generated from the live store: 105 perfumes and gift sets, with prices in AED. Watches and sunglasses are left out. To refresh after adding or changing products on assaf.ae, run:
```bash
pip install pillow
python3 tools/import_products.py
```
The script merges listings of the same scent into one product with several sizes. It also reads notes and taglines from each description, marks sold-out sizes and bestsellers, and works out each card's tint colour from its photo.

## Editing
- **Colours and fonts:** change the CSS variables at the top of `assets/css/style.css`.
- **Images:** product photos come from assaf.ae. `assets/js/bottle.js` draws an SVG bottle only for a product that has no photo.

## Before going live
- Checkout is a working front end only. To take real payments, connect a payment gateway (e.g. Moyasar, HyperPay, Tap or Stripe) or move the catalogue to Shopify or WooCommerce.
- The bag is saved in the browser (localStorage).
- The contact details (support@assaf.ae, +966 92 000 2040, @assafperfumes) and the AED 275 free-shipping threshold are taken from assaf.ae. The AED 25 delivery fee below that threshold (`SHIP_FEE` in `assets/js/main.js`) is a placeholder.
