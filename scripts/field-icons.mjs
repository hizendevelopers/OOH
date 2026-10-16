import sharp from 'sharp';
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="112" fill="#101d32"/><circle cx="256" cy="256" r="155" fill="#1769e8"/><circle cx="256" cy="256" r="118" fill="none" stroke="white" stroke-width="13"/><path d="M316 190 282 282 190 316 224 224Z" fill="none" stroke="white" stroke-linejoin="round" stroke-width="17"/><circle cx="256" cy="256" r="12" fill="white"/></svg>');
for(const size of [192,512])await sharp(svg).resize(size,size).png().toFile(`apps/web/public/field-${size}.png`);
