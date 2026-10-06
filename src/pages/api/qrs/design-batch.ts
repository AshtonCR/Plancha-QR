export const prerender = false;

import type { APIRoute } from 'astro';
import { PDFDocument, StandardFonts, degrees, rgb, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { createBatchCodes } from '../../../lib/qrs';
import {
	LAYOUT_CARTA_3,
	LETTER_SIZE,
	SHEET_LEFT_MARGIN_END_X,
	TEMPLATE_RAW_SIZE,
	findDesign,
	type DesignId,
} from '../../../lib/designs';

/**
 * Template PDFs, inlined into the server bundle as base64 `data:` URIs at build
 * time (no filesystem access at runtime, no adapter `includeFiles`). Each one is
 * a lazy chunk, so only the requested template is decoded per request.
 * Kept here, not in `lib/designs.ts`, so client code importing the catalog never
 * pulls the PDFs into the browser bundle.
 */
const templates = import.meta.glob('../../../assets/designs/*.pdf', {
	query: '?inline',
	import: 'default',
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Quiet zone, in modules. Fixed in this mode: the slot is sized for it. */
const QR_MARGIN = 2;

/** QR raster pixels per PDF point (8 px/pt ≈ 576dpi), so it stays crisp when printed. */
const QR_PX_PER_PT = 8;

const CODE_FONT_SIZE = 10;
/** Gap between the right end of the code text and the start of the card area. */
const CODE_GAP_PT = 10;

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

async function loadTemplate(designId: DesignId): Promise<PDFDocument> {
	const loader = templates[`../../../assets/designs/${designId}.pdf`];
	if (!loader) throw new Error(`Template PDF for design "${designId}" is not bundled`);

	const dataUri = (await loader()) as string;
	const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
	return PDFDocument.load(Buffer.from(base64, 'base64'));
}

/**
 * Builds a real US Letter sheet showing the template's oversized page (MediaBox
 * in 300dpi pixels) scaled down to fit. Fails loudly if a template ever has
 * another geometry, since LAYOUT_CARTA_3 would then point at the wrong place.
 *
 * The template is embedded as a Form XObject instead of rescaled in place:
 * `page.scale()` in pdf-lib leaves later draws inside its scale matrix, and an
 * XObject isolates the template's graphics state from whatever we draw on top.
 */
async function buildNormalizedSheet(template: PDFDocument): Promise<{ doc: PDFDocument; page: PDFPage }> {
	if (template.getPageCount() !== 1) {
		throw new Error(`Template must have exactly 1 page, got ${template.getPageCount()}`);
	}
	const source = template.getPage(0);
	const { width, height } = source.getSize();
	const rotation = source.getRotation().angle;
	if (width !== TEMPLATE_RAW_SIZE.width || height !== TEMPLATE_RAW_SIZE.height || rotation % 360 !== 0) {
		throw new Error(
			`Unexpected template page geometry ${width}x${height} rot ${rotation}; ` +
				`expected ${TEMPLATE_RAW_SIZE.width}x${TEMPLATE_RAW_SIZE.height} unrotated`
		);
	}

	const doc = await PDFDocument.create();
	const embedded = await doc.embedPage(source);
	const page = doc.addPage([LETTER_SIZE.width, LETTER_SIZE.height]);
	page.drawPage(embedded, {
		x: 0,
		y: 0,
		xScale: LETTER_SIZE.width / width,
		yScale: LETTER_SIZE.height / height,
	});
	return { doc, page };
}

/**
 * POST /api/qrs/design-batch — creates one sheet's worth of codes and returns
 * the chosen design's template PDF with a real QR in every card.
 */
export const POST: APIRoute = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'invalid_body' }, 400);
	}
	if (typeof body !== 'object' || body === null) {
		return json({ ok: false, error: 'invalid_body' }, 400);
	}

	const { designId, qrColor, qrBg } = body as Record<string, unknown>;

	const design = findDesign(designId);
	if (!design) return json({ ok: false, error: 'invalid_design' }, 400);

	if (
		typeof qrColor !== 'string' ||
		!HEX_COLOR.test(qrColor) ||
		typeof qrBg !== 'string' ||
		!HEX_COLOR.test(qrBg)
	) {
		return json({ ok: false, error: 'invalid_color' }, 400);
	}

	// Everything that can fail on the template happens before any code is created,
	// so a broken template never burns real codes.
	let doc: PDFDocument;
	let page: PDFPage;
	try {
		({ doc, page } = await buildNormalizedSheet(await loadTemplate(design.id)));
	} catch (err) {
		console.error('design-batch: template error', err);
		return json({ ok: false, error: 'template_error' }, 500);
	}
	const font = await doc.embedFont(StandardFonts.Courier);

	let created: Awaited<ReturnType<typeof createBatchCodes>>;
	try {
		created = await createBatchCodes(LAYOUT_CARTA_3.length);
	} catch (err) {
		console.error('design-batch: createBatchCodes error', err);
		return json({ ok: false, error: 'codes_error' }, 500);
	}
	const origin = new URL(request.url).origin;

	for (const [i, { code }] of created.entries()) {
		const { x, y, size } = LAYOUT_CARTA_3[i].qr;

		const png = await QRCode.toBuffer(`${origin}/${code}`, {
			type: 'png',
			margin: QR_MARGIN,
			width: Math.ceil(size * QR_PX_PER_PT),
			color: { dark: qrColor, light: qrBg },
		});
		const image = await doc.embedPng(png);

		// Cards lie rotated on the sheet with their "up" toward the page's right
		// edge; turn the QR 90° clockwise so it is upright on the cut card.
		// pdf-lib rotates around (x, y), so anchor at the slot's top-left corner.
		page.drawImage(image, { x, y: y + size, width: size, height: size, rotate: degrees(-90) });

		const textWidth = font.widthOfTextAtSize(code, CODE_FONT_SIZE);
		page.drawText(code, {
			x: SHEET_LEFT_MARGIN_END_X - CODE_GAP_PT - textWidth,
			// Vertically centered on the QR (Courier x-height ≈ 0.43em).
			y: y + size / 2 - CODE_FONT_SIZE * 0.22,
			size: CODE_FONT_SIZE,
			font,
			color: rgb(0, 0, 0),
		});
	}

	const pdfBytes = await doc.save();

	return new Response(new Uint8Array(pdfBytes), {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': 'attachment; filename="plancha.pdf"',
		},
	});
};
