// Снимает PNG с уже смонтированного SVG. Ничего не знает про недели и
// помидорки: на вход SVG, на выход base64 — так функцию можно переиспользовать
// для любого другого графика.
export async function svgToPngBase64(
  svg: SVGSVGElement,
  width: number,
  height: number,
  scale = 2,
): Promise<string> {
  const source = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');

    // SVG прозрачен, а прозрачный PNG в тёмной теме Telegram выглядит дырой.
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  } finally {
    // Без этого каждая сводка подтекает блобом до перезагрузки страницы.
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('failed to rasterise chart svg'));
    image.src = url;
  });
}
