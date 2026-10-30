// デモ用の見本（架空のバンドのキャップ・オリジナルの図柄）。public/demo の画像と、その指紋（SHA-256）
import type { Item } from "./types";
import type { CapSpec } from "@/components/capGeometry";
export type DemoItem = Item & { n: number; fabric: string; macroHash: string; category: string; composition: { fiber: string; pct: number }[]; construction: string; decoration: string; cap: CapSpec };
export const DEMO_ITEMS: DemoItem[] = [
 {
  "id": "demo-1",
  "serial": 9001,
  "photos": [
   "/demo/cap-1.jpg",
   "/demo/cap-macro-1.jpg"
  ],
  "band": "Night Static",
  "title": "World Tour",
  "year": "1991",
  "era": "90s",
  "size": "OS",
  "tag": "Wool blend, structured front",
  "stitch": false,
  "made_in": "USA",
  "cond": "Excellent — light fade on the crown",
  "prov": "Sample piece made for this demonstration. The band and artwork are fictional.",
  "dealer": "Demo Dealer, Los Angeles",
  "published": true,
  "created_at": "2027-01-01T00:00:00.000Z",
  "rank": "",
  "price_usd": null,
  "sold": false,
  "listen": "",
  "audio_path": "",
  "audio_name": "",
  "audio_credit": "",
  "n": 1,
  "fabric": "#1E1E1D",
  "macroHash": "",
  "category": "Cap",
  "composition": [
   {
    "fiber": "Wool",
    "pct": 60
   },
   {
    "fiber": "Acrylic",
    "pct": 40
   }
  ],
  "construction": "Structured 6-panel, buckram front",
  "decoration": "Raised embroidery",
  "cap": {
   "style": "structured",
   "crown": "#1E1E1D",
   "brim": "#1E1E1D",
   "under": "#3C4A3A",
   "thread": "#E8E2D4",
   "accent": "#C9B98F",
   "art": "sun",
   "fabric": "twill",
   "closure": "snap"
  }
 },
 {
  "id": "demo-2",
  "serial": 9002,
  "photos": [
   "/demo/cap-2.jpg",
   "/demo/cap-macro-2.jpg"
  ],
  "band": "Velvet Ruin",
  "title": "Cathedral Shows",
  "year": "1989",
  "era": "80s",
  "size": "OS",
  "tag": "Washed cotton",
  "stitch": false,
  "made_in": "USA",
  "cond": "Very good — soft wear on the brim edge",
  "prov": "Sample piece made for this demonstration. The band and artwork are fictional.",
  "dealer": "Demo Dealer, Los Angeles",
  "published": true,
  "created_at": "2027-01-01T00:00:00.000Z",
  "rank": "",
  "price_usd": null,
  "sold": false,
  "listen": "",
  "audio_path": "",
  "audio_name": "",
  "audio_credit": "",
  "n": 2,
  "fabric": "#ECE7DC",
  "macroHash": "",
  "category": "Cap",
  "composition": [
   {
    "fiber": "Cotton",
    "pct": 100
   }
  ],
  "construction": "Unstructured 6-panel, cloth strap",
  "decoration": "Flat embroidery",
  "cap": {
   "style": "dad",
   "crown": "#ECE7DC",
   "brim": "#ECE7DC",
   "under": "#ECE7DC",
   "thread": "#1C1B1A",
   "accent": "#8C2F23",
   "art": "arch",
   "fabric": "canvas",
   "closure": "strap"
  }
 },
 {
  "id": "demo-3",
  "serial": 9003,
  "photos": [
   "/demo/cap-3.jpg",
   "/demo/cap-macro-3.jpg"
  ],
  "band": "Low Orbit",
  "title": "Signal Lost",
  "year": "1994",
  "era": "90s",
  "size": "OS",
  "tag": "Foam front, nylon mesh",
  "stitch": false,
  "made_in": "USA",
  "cond": "Good — print lightly crazed",
  "prov": "Sample piece made for this demonstration. The band and artwork are fictional.",
  "dealer": "Demo Dealer, Los Angeles",
  "published": true,
  "created_at": "2027-01-01T00:00:00.000Z",
  "rank": "",
  "price_usd": null,
  "sold": false,
  "listen": "",
  "audio_path": "",
  "audio_name": "",
  "audio_credit": "",
  "n": 3,
  "fabric": "#2F3236",
  "macroHash": "",
  "category": "Cap",
  "composition": [
   {
    "fiber": "Polyester",
    "pct": 100
   }
  ],
  "construction": "Trucker 5-panel, foam front and mesh back",
  "decoration": "Screen print on foam",
  "cap": {
   "style": "trucker",
   "crown": "#2F3236",
   "front": "#2F3236",
   "mesh": "#6B7075",
   "brim": "#2F3236",
   "under": "#2F3236",
   "thread": "#F0EDE6",
   "accent": "#D9C27A",
   "art": "orbit",
   "fabric": "twill",
   "print": true,
   "closure": "snap"
  }
 },
 {
  "id": "demo-4",
  "serial": 9004,
  "photos": [
   "/demo/cap-4.jpg",
   "/demo/cap-macro-4.jpg"
  ],
  "band": "Saint Motor",
  "title": "Road Fever",
  "year": "1987",
  "era": "80s",
  "size": "OS",
  "tag": "Foam front, nylon mesh",
  "stitch": false,
  "made_in": "USA",
  "cond": "Very good — foam slightly yellowed",
  "prov": "Sample piece made for this demonstration. The band and artwork are fictional.",
  "dealer": "Demo Dealer, Los Angeles",
  "published": true,
  "created_at": "2027-01-01T00:00:00.000Z",
  "rank": "",
  "price_usd": null,
  "sold": false,
  "listen": "",
  "audio_path": "",
  "audio_name": "",
  "audio_credit": "",
  "n": 4,
  "fabric": "#1F2A3A",
  "macroHash": "",
  "category": "Cap",
  "composition": [
   {
    "fiber": "Polyester",
    "pct": 100
   }
  ],
  "construction": "Trucker 5-panel, foam front and mesh back",
  "decoration": "Screen print on foam",
  "cap": {
   "style": "trucker",
   "crown": "#1F2A3A",
   "front": "#F2EFE8",
   "mesh": "#1F2A3A",
   "brim": "#1F2A3A",
   "under": "#1F2A3A",
   "thread": "#1F2A3A",
   "accent": "#B8452C",
   "art": "road",
   "fabric": "twill",
   "print": true,
   "closure": "snap"
  }
 },
 {
  "id": "demo-5",
  "serial": 9005,
  "photos": [
   "/demo/cap-5.jpg",
   "/demo/cap-macro-5.jpg"
  ],
  "band": "Glass Prophet",
  "title": "Mirror Age",
  "year": "1996",
  "era": "90s",
  "size": "OS",
  "tag": "Cotton corduroy",
  "stitch": false,
  "made_in": "USA",
  "cond": "Excellent — wales full, no bald spots",
  "prov": "Sample piece made for this demonstration. The band and artwork are fictional.",
  "dealer": "Demo Dealer, Los Angeles",
  "published": true,
  "created_at": "2027-01-01T00:00:00.000Z",
  "rank": "",
  "price_usd": null,
  "sold": false,
  "listen": "",
  "audio_path": "",
  "audio_name": "",
  "audio_credit": "",
  "n": 5,
  "fabric": "#4A3A2E",
  "macroHash": "",
  "category": "Cap",
  "composition": [
   {
    "fiber": "Cotton",
    "pct": 100
   }
  ],
  "construction": "5-panel camp, flat brim, cloth strap",
  "decoration": "Flat embroidery",
  "cap": {
   "style": "five",
   "crown": "#4A3A2E",
   "brim": "#4A3A2E",
   "under": "#4A3A2E",
   "thread": "#D8D2C4",
   "accent": "#7FA3A6",
   "art": "eye",
   "fabric": "cord",
   "closure": "strap"
  }
 },
 {
  "id": "demo-6",
  "serial": 9006,
  "photos": [
   "/demo/cap-6.jpg",
   "/demo/cap-macro-6.jpg"
  ],
  "band": "Paper Kings",
  "title": "Live in Tokyo",
  "year": "1992",
  "era": "90s",
  "size": "OS",
  "tag": "Cotton twill, two-tone",
  "stitch": false,
  "made_in": "USA",
  "cond": "Very good — light sweat mark inside",
  "prov": "Sample piece made for this demonstration. The band and artwork are fictional.",
  "dealer": "Demo Dealer, Los Angeles",
  "published": true,
  "created_at": "2027-01-01T00:00:00.000Z",
  "rank": "",
  "price_usd": null,
  "sold": false,
  "listen": "",
  "audio_path": "",
  "audio_name": "",
  "audio_credit": "",
  "n": 6,
  "fabric": "#E4DFD3",
  "macroHash": "",
  "category": "Cap",
  "composition": [
   {
    "fiber": "Cotton",
    "pct": 100
   }
  ],
  "construction": "Structured 6-panel, two-tone brim",
  "decoration": "Raised embroidery",
  "cap": {
   "style": "structured",
   "crown": "#E4DFD3",
   "brim": "#2C3A5A",
   "under": "#3C4A3A",
   "thread": "#24221F",
   "accent": "#3B5B8C",
   "art": "crown",
   "fabric": "twill",
   "closure": "snap"
  }
 }
];
export const demoCert = (n: number) => `GC-DEMO-${n}`;
