/**
 * Pre-made "follow us" card designs (one PDF per social network × color variant)
 * and the shared geometry of where the QR goes on each of their cards.
 *
 * This module is safe to import from client code: it only holds plain data.
 * The template PDFs themselves are loaded server-side only, by
 * `src/pages/api/qrs/design-batch.ts`.
 */

/** Where the QR code is drawn for one card, in PDF points (bottom-left origin). */
export type CardSlot = { qr: { x: number; y: number; size: number } };

/**
 * Raw page size of every template PDF. Their `MediaBox` is in 300dpi pixels
 * (no `/UserUnit`), not real 72dpi points, so the page must be rescaled to
 * {@link LETTER_SIZE} before anything is drawn on it.
 */
export const TEMPLATE_RAW_SIZE = { width: 2550, height: 3300 } as const;

/** US Letter in PDF points (21.59 × 27.94 cm). */
export const LETTER_SIZE = { width: 612, height: 792 } as const;

/**
 * QR slots for the "carta, 3 tarjetas" layout shared by every design in
 * {@link DESIGNS}, in points on the page already normalized to
 * {@link LETTER_SIZE}. Ordered top to bottom as the sheet is seen printed.
 *
 * Measured on 72dpi renders of the raw templates (1px = 1 raw unit), where the
 * open interior of the inner "QR HERE" square is x 801.5–1011.5 and, from the
 * top, y 663.5–874.5 / 1520.5–1731.5 / 2377.5–2588.5 (cards repeat every 857
 * units). Converted with the uniform factor 612/2550 = 792/3300 = 0.24 and
 * the Y flip `y_pdf = 3300 - y_top - size`. Identical in all 10 templates.
 *
 * Each QR is drawn at 1.9cm (53.86pt, requested bigger than the bare inner
 * square so it reads more clearly when printed), centered on the same point
 * as the originally-measured 212-unit/50.88pt inner square — `x`/`y` here are
 * shifted by `(oldSize - size) / 2` from that measurement to keep the center
 * fixed as the size grew.
 *
 * The cards are rotated 90° on the sheet (their "up" points to the page's
 * right edge), so the endpoint rotates each QR to match.
 */
export const LAYOUT_CARTA_3: CardSlot[] = [
	{ qr: { x: 190.63, y: 580.51, size: 53.86 } },
	{ qr: { x: 190.63, y: 374.83, size: 53.86 } },
	{ qr: { x: 190.63, y: 169.15, size: 53.86 } },
];

/**
 * Blank left margin of the normalized sheet (x from 0 up to where the gray
 * card background starts), where each card's code is printed next to it.
 */
export const SHEET_LEFT_MARGIN_END_X = 85.68;

export const DESIGNS = [
	{ id: 'igm-ng', label: 'Instagram — Oscuro', red: 'instagram', variante: 'oscuro' },
	{ id: 'igm-bl', label: 'Instagram — Claro', red: 'instagram', variante: 'claro' },
	{ id: 'tkk-ng', label: 'TikTok — Oscuro', red: 'tiktok', variante: 'oscuro' },
	{ id: 'tkk-bl', label: 'TikTok — Claro', red: 'tiktok', variante: 'claro' },
	{ id: 'wsp-bl', label: 'WhatsApp — Claro', red: 'whatsapp', variante: 'claro' },
	{ id: 'wsp-ve', label: 'WhatsApp — Verde', red: 'whatsapp', variante: 'verde' },
	{ id: 'fcb-ng', label: 'Facebook — Oscuro', red: 'facebook', variante: 'oscuro' },
	{ id: 'fcb-bl', label: 'Facebook — Claro', red: 'facebook', variante: 'claro' },
	{ id: 'gog-ng', label: 'Google — Oscuro', red: 'google', variante: 'oscuro' },
	{ id: 'gog-bl', label: 'Google — Claro', red: 'google', variante: 'claro' },
] as const;

export type Design = (typeof DESIGNS)[number];
export type DesignId = Design['id'];

export function findDesign(id: unknown): Design | undefined {
	return typeof id === 'string' ? DESIGNS.find((d) => d.id === id) : undefined;
}
