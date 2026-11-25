/** The PNG is contained inside an inset area of the screen lesson rectangle. */
export function imageBox(sectionWidth: number, sectionHeight: number, imageWidth: number, imageHeight: number) {
  const inset = { x: .23, y: .04, width: .54, height: .92 };
  const availableWidth = sectionWidth * inset.width;
  const availableHeight = sectionHeight * inset.height;
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const width = imageWidth * scale / sectionWidth;
  const height = imageHeight * scale / sectionHeight;
  return { x: inset.x + (inset.width - width) / 2, y: inset.y + (inset.height - height) / 2, width, height };
}
