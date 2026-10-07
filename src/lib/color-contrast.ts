/** WCAG relative luminance of a `#rrggbb` color, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
	const n = parseInt(hex.slice(1), 16);
	const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Contrast ratio between two `#rrggbb` colors (1 to 21). */
export function contrastRatio(hexA: string, hexB: string): number {
	const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort(
		(a, b) => b - a
	);
	return (lighter + 0.05) / (darker + 0.05);
}
