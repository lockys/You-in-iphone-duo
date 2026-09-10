import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const mark = await readFile('public/brand/mark.svg', 'utf8');
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" rx="40" fill="white"/><g transform="translate(24 24) scale(2.25)">${mark.replace(/<svg[^>]*>|<\/svg>/g, '')}</g></svg>`;
await writeFile('public/brand/app-icon.svg', icon);
await sharp(Buffer.from(icon)).resize(180).png().toFile('public/brand/apple-touch-icon.png');
await sharp(Buffer.from(icon)).resize(32).png().toFile('public/brand/favicon.png');
const mono = await readFile('public/brand/mark-mono.svg', 'utf8');
const markBody = mark.replace(/<svg[^>]*>|<\/svg>/g, '');
const monoBody = mono.replace(/<svg[^>]*>|<\/svg>/g, '');
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="680" viewBox="0 0 1200 680"><rect width="1200" height="680" fill="#f8f7fa"/><text x="64" y="82" font-family="Arial,sans-serif" font-size="36" fill="#272333">You, in <tspan font-weight="700">iPhoneDuo</tspan></text><path d="M64 116h1072" stroke="#dcd8e4"/><g transform="translate(94 184) scale(2.5)">${markBody}</g><g transform="translate(452 184) scale(2.5)">${monoBody}</g><rect x="836" y="181" width="174" height="174" rx="38" fill="white"/><g transform="translate(859 204) scale(2)">${markBody}</g><g font-family="Arial,sans-serif" font-size="18" fill="#66616e"><text x="119" y="396">Primary mark</text><text x="468" y="396">Monochrome</text><text x="887" y="396">App icon</text></g><g transform="translate(70 500)">${markBody}</g><text x="160" y="546" font-family="Arial,sans-serif" font-size="38" fill="#272333">You, in <tspan font-weight="700">iPhoneDuo</tspan></text></svg>`;
await writeFile('public/brand/logo-sheet.svg', sheet);
await sharp(Buffer.from(sheet)).png().toFile('public/brand/logo-sheet.png');
console.log('Brand SVGs, icon PNGs, and logo sheet prepared.');
