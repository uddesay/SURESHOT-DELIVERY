export const commissionLabel = (bp: number | null | undefined) => (bp == null ? 'Category default' : `${(bp / 100).toFixed(1).replace(/\.0$/, '')}%`);
