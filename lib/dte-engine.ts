/** Motor local de preparación DTE. No firma, no asigna folios oficiales ni transmite al SII. */
export type DteType = 33 | 34 | 39 | 41;
export type DteLineInput = { name: string; quantity: number; unitPrice: number; exempt: boolean };
export type DteTotals = { net: number; exempt: number; tax: number; total: number };
export type DteValidationInput = { documentType: DteType; issuerRut: string; receiverRut?: string; receiverName: string; lines: DteLineInput[] };
export function normalizeRut(value: string): string { return value.toUpperCase().replace(/[^0-9K]/g, ""); }
export function isValidRut(value: string): boolean {
  const rut = normalizeRut(value);
  if (rut.length < 2) return false;
  const body = rut.slice(0, -1); const dv = rut.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  let sum = 0; let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += Number(body[i]) * multiplier; multiplier = multiplier === 7 ? 2 : multiplier + 1; }
  const n = 11 - (sum % 11); const expected = n === 11 ? "0" : n === 10 ? "K" : String(n);
  return dv === expected;
}
export function formatRut(value: string): string {
  const rut = normalizeRut(value); if (rut.length < 2) return value.trim();
  const body = rut.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, "."); return `${body}-${rut.slice(-1)}`;
}
export function calculateDteTotals(lines: DteLineInput[], documentType: DteType): DteTotals {
  let net = 0, exempt = 0;
  for (const line of lines) {
    const amount = Math.round(line.quantity * line.unitPrice);
    if (line.exempt || documentType === 34 || documentType === 41) exempt += amount; else net += amount;
  }
  const tax = Math.round(net * 0.19);
  return { net, exempt, tax, total: net + exempt + tax };
}
export function validateDte(input: DteValidationInput): string[] {
  const errors: string[] = [];
  if (![33, 34, 39, 41].includes(input.documentType)) errors.push("Tipo de documento no admitido.");
  if (!isValidRut(input.issuerRut)) errors.push("El RUT del emisor no es válido.");
  if (input.documentType === 33 || input.documentType === 34) {
    if (!isValidRut(input.receiverRut || "")) errors.push("La factura requiere un RUT de receptor válido.");
    if (!input.receiverName.trim()) errors.push("La factura requiere razón social o nombre del receptor.");
  } else if (input.receiverRut?.trim() && !isValidRut(input.receiverRut)) errors.push("El RUT del receptor no es válido.");
  if (!input.lines.length) errors.push("Agrega al menos un detalle al documento.");
  input.lines.forEach((line, i) => {
    if (!line.name.trim()) errors.push(`La línea ${i + 1} requiere descripción.`);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) errors.push(`La cantidad de la línea ${i + 1} debe ser mayor que cero.`);
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) errors.push(`El precio de la línea ${i + 1} no puede ser negativo.`);
  });
  return errors;
}
function xmlEscape(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
export function buildSimulationXml(input: DteValidationInput, totals: DteTotals, issueDate: string): string {
  const lines = input.lines.map((line, index) => `    <Detalle><NroLinDet>${index + 1}</NroLinDet><NmbItem>${xmlEscape(line.name.trim())}</NmbItem><QtyItem>${line.quantity}</QtyItem><PrcItem>${Math.round(line.unitPrice)}</PrcItem><MontoItem>${Math.round(line.quantity * line.unitPrice)}</MontoItem></Detalle>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- SIMULACION INTERNA BOOM POS: NO ES DTE OFICIAL, NO TIENE FIRMA NI FOLIO SII -->\n<DTE_SIMULACION><Encabezado><IdDoc><TipoDTE>${input.documentType}</TipoDTE><FchEmis>${issueDate}</FchEmis></IdDoc><Emisor><RUTEmisor>${xmlEscape(formatRut(input.issuerRut))}</RUTEmisor></Emisor><Receptor><RUTRecep>${xmlEscape(input.receiverRut ? formatRut(input.receiverRut) : "")}</RUTRecep><RznSocRecep>${xmlEscape(input.receiverName.trim() || "Consumidor final")}</RznSocRecep></Receptor><Totales><MntNeto>${totals.net}</MntNeto><MntExe>${totals.exempt}</MntExe><IVA>${totals.tax}</IVA><MntTotal>${totals.total}</MntTotal></Totales></Encabezado>\n${lines}\n</DTE_SIMULACION>`;
}
