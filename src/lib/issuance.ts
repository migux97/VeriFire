export interface IssuanceOptions {
  brand: string;
  labelText: string;
  labelStyle: 'standard' | 'compact';
}
export function parseIssuanceOptions(value: unknown): IssuanceOptions | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuración de emisión inválida.');
  const input = value as Record<string, unknown>;
  const text = (key: string, limit: number) => {
    const field = input[key];
    if (typeof field !== 'string' || field.length > limit) throw new Error(`Campo ${key} inválido.`);
    return field.trim();
  };
  if (input['labelStyle'] !== 'standard' && input['labelStyle'] !== 'compact') throw new Error('Formato de etiqueta inválido.');
  return { brand: text('brand', 80), labelText: text('labelText', 160), labelStyle: input['labelStyle'] };
}