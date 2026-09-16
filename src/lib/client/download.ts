import type { CompanyBatch } from '../types';

export const downloadBlob = (blob: Blob, filename: string) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

export const downloadDataUrl = async (dataUrl: string, filename: string) => downloadBlob(await (await fetch(dataUrl)).blob(), filename);

export const downloadBatchCsv = (batch: CompanyBatch) => {
  const rows = [
    ['lote', 'modelo', 'lote_fabricacion', 'destino', 'token', 'codigo_secreto', 'enlace_qr_publico', 'enlace_qr_secreto'],
    ...batch.tokens.map((token) => [batch.batchId, batch.model, batch.lot, batch.destination, token.token, token.secretCode, token.publicUrl, token.secretUrl])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  // The BOM makes Excel open the accents correctly.
  downloadBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), `${batch.batchId}-codigos-secretos.csv`);
};
