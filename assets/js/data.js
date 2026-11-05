/* ASSAF — product catalogue
   Edit this file to add / change products. Prices are in SAR for the 50ml size;
   the 100ml size is priced with SIZE_MULTIPLIER. */
window.ASSAF = window.ASSAF || {};

ASSAF.CURRENCY = 'SAR';
ASSAF.SIZES = [
  { id: '50', label: '50 ml', mult: 1 },
  { id: '100', label: '100 ml', mult: 1.6 }
];

ASSAF.FAMILIES = ['Oud', 'Oriental', 'Floral', 'Musk', 'Fresh'];

ASSAF.PRODUCTS = [
  {
    id: 'oud-royale', name: 'Oud Royale', family: 'Oud', gender: 'Unisex', price: 520,
    liquid: ['#6b3a1e', '#2b140a'], cap: 'gold', shape: 'square', badge: 'Bestseller',
    tagline: 'The crown of the collection',
    description: 'A regal blend of aged Cambodian oud wrapped in smoked rose and warm amber. Deep, resinous and unforgettable — Oud Royale lingers on skin from dusk until dawn.',
    notes: { top: ['Saffron', 'Pink Pepper'], heart: ['Taif Rose', 'Patchouli'], base: ['Cambodian Oud', 'Amber', 'Leather'] },
    intensity: 5, longevity: '12+ hours'
  },
  {
    id: 'amber-noir', name: 'Amber Noir', family: 'Oriental', gender: 'Men', price: 420,
    liquid: ['#a4581c', '#3d1a06'], cap: 'black', shape: 'tall', badge: 'New',
    tagline: 'Velvet darkness, glowing warmth',
    description: 'Golden labdanum and vanilla smoulder beneath a veil of black pepper and incense. A sensual oriental for nights that don’t end.',
    notes: { top: ['Black Pepper', 'Bergamot'], heart: ['Incense', 'Cinnamon'], base: ['Labdanum', 'Vanilla', 'Tonka'] },
    intensity: 4, longevity: '10 hours'
  },
  {
    id: 'rose-de-taif', name: 'Rose de Taif', family: 'Floral', gender: 'Women', price: 460,
    liquid: ['#e88aa0', '#8e2c4a'], cap: 'gold', shape: 'round', badge: 'Bestseller',
    tagline: 'Picked at dawn in the highlands',
    description: 'The legendary rose of Taif, hand-picked at first light, layered with lychee, white musk and a whisper of oud for a radiant, modern floral.',
    notes: { top: ['Lychee', 'Mandarin'], heart: ['Taif Rose', 'Peony'], base: ['White Musk', 'Oud', 'Cedar'] },
    intensity: 3, longevity: '8 hours'
  },
  {
    id: 'musk-al-layl', name: 'Musk Al Layl', family: 'Musk', gender: 'Unisex', price: 380,
    liquid: ['#d8cfe8', '#7c6c9c'], cap: 'silver', shape: 'square',
    tagline: 'A secret whispered at midnight',
    description: 'Soft, skin-like musks blended with iris and powdery heliotrope. Intimate and comforting — the scent of clean skin under moonlight.',
    notes: { top: ['Aldehydes', 'Pear'], heart: ['Iris', 'Heliotrope'], base: ['White Musk', 'Cashmeran', 'Sandalwood'] },
    intensity: 2, longevity: '8 hours'
  },
  {
    id: 'saffron-silk', name: 'Saffron Silk', family: 'Oriental', gender: 'Unisex', price: 490,
    liquid: ['#f2a93b', '#b0520f'], cap: 'gold', shape: 'tall', badge: 'Limited',
    tagline: 'Threads of red gold',
    description: 'Precious Persian saffron spun with raspberry, jasmine and creamy suede. Luminous, smooth and quietly opulent.',
    notes: { top: ['Saffron', 'Raspberry'], heart: ['Jasmine Sambac', 'Suede'], base: ['Amberwood', 'Musk', 'Oakmoss'] },
    intensity: 4, longevity: '10 hours'
  },
  {
    id: 'desert-bloom', name: 'Desert Bloom', family: 'Floral', gender: 'Women', price: 360,
    liquid: ['#f6d6b8', '#d08a5c'], cap: 'rose', shape: 'round',
    tagline: 'Flowers after the first rain',
    description: 'Orange blossom and tuberose unfold over warm sand accords and honeyed amber. A bright, sun-kissed floral with a soft heart.',
    notes: { top: ['Neroli', 'Pink Grapefruit'], heart: ['Orange Blossom', 'Tuberose'], base: ['Honey', 'Amber', 'Musk'] },
    intensity: 3, longevity: '7 hours'
  },
  {
    id: 'velvet-leather', name: 'Velvet Leather', family: 'Oud', gender: 'Men', price: 540,
    liquid: ['#5a3b2e', '#1c100b'], cap: 'black', shape: 'square',
    tagline: 'Tailored, bold, magnetic',
    description: 'Supple Italian leather, smoky birch and dark oud — softened with violet leaf. A signature for those who command the room.',
    notes: { top: ['Violet Leaf', 'Cardamom'], heart: ['Leather', 'Birch Tar'], base: ['Oud', 'Vetiver', 'Benzoin'] },
    intensity: 5, longevity: '12+ hours'
  },
  {
    id: 'citrus-majlis', name: 'Citrus Majlis', family: 'Fresh', gender: 'Men', price: 320,
    liquid: ['#e9f0a8', '#9fb63c'], cap: 'silver', shape: 'tall', badge: 'New',
    tagline: 'Cool shade on a bright afternoon',
    description: 'Sparkling Sicilian lemon and mint over green tea and vetiver. Effortless freshness that carries you from morning majlis to evening.',
    notes: { top: ['Lemon', 'Mint'], heart: ['Green Tea', 'Neroli'], base: ['Vetiver', 'Musk', 'Ambrette'] },
    intensity: 2, longevity: '6 hours'
  },
  {
    id: 'white-musk', name: 'White Musk', family: 'Musk', gender: 'Women', price: 300,
    liquid: ['#ffffff', '#d9d2c7'], cap: 'rose', shape: 'round',
    tagline: 'Pure as fresh linen',
    description: 'A cloud of white musk, cotton flower and lily of the valley — clean, airy and endlessly wearable.',
    notes: { top: ['Bergamot', 'Aldehydes'], heart: ['Cotton Flower', 'Lily of the Valley'], base: ['White Musk', 'Ambrette', 'Cedar'] },
    intensity: 2, longevity: '7 hours'
  },
  {
    id: 'midnight-bakhoor', name: 'Midnight Bakhoor', family: 'Oriental', gender: 'Unisex', price: 480,
    liquid: ['#3b2a4a', '#120a18'], cap: 'gold', shape: 'square', badge: 'Bestseller',
    tagline: 'Smoke rising from the mabkhara',
    description: 'The ritual of bakhoor captured in a bottle — resinous frankincense, myrrh and agarwood chips glowing on embers, sweetened with dates.',
    notes: { top: ['Frankincense', 'Elemi'], heart: ['Myrrh', 'Date'], base: ['Agarwood', 'Sandalwood', 'Amber'] },
    intensity: 5, longevity: '12+ hours'
  },
  {
    id: 'jasmine-sultan', name: 'Jasmine Sultan', family: 'Floral', gender: 'Women', price: 440,
    liquid: ['#fff2b8', '#e0b44a'], cap: 'gold', shape: 'tall',
    tagline: 'A garden in the palace',
    description: 'Indian jasmine sambac in full bloom with ylang-ylang and a golden trail of sandalwood. Lush, creamy and radiant.',
    notes: { top: ['Mandarin', 'Green Notes'], heart: ['Jasmine Sambac', 'Ylang-Ylang'], base: ['Sandalwood', 'Vanilla', 'Musk'] },
    intensity: 3, longevity: '9 hours'
  },
  {
    id: 'sandal-mirage', name: 'Sandal Mirage', family: 'Fresh', gender: 'Unisex', price: 350,
    liquid: ['#cfe6ef', '#5e98ad'], cap: 'silver', shape: 'round',
    tagline: 'Sea breeze over warm wood',
    description: 'Marine accords and pink pepper drift over creamy Mysore sandalwood. Fresh on top, warm at heart — a scent that shimmers.',
    notes: { top: ['Sea Salt', 'Pink Pepper'], heart: ['Lavender', 'Sage'], base: ['Sandalwood', 'Ambergris', 'Cedar'] },
    intensity: 3, longevity: '8 hours'
  }
];

ASSAF.getProduct = function (id) {
  return ASSAF.PRODUCTS.find(function (p) { return p.id === id; });
};
