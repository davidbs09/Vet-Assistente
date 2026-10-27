type Cut = { value: number; label: string; short: string };

const CUTS: Cut[] = [
  { value: 0.25, label: '1/4 (um quarto) do comprimido', short: '1/4 (um quarto)' },
  { value: 1 / 3, label: '1/3 (um terço) do comprimido', short: '1/3 (um terço)' },
  { value: 0.5, label: '1/2 (meio) comprimido', short: '1/2 (meio)' },
  { value: 2 / 3, label: '2/3 (dois terços) do comprimido', short: '2/3 (dois terços)' },
  { value: 0.75, label: '3/4 (três quartos) do comprimido', short: '3/4 (três quartos)' },
];

function parseDecimal(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

function nearestCut(fraction: number): Cut | null {
  let best: Cut | null = null;
  let bestDist = Infinity;
  for (const cut of CUTS) {
    const dist = Math.abs(fraction - cut.value);
    if (dist < bestDist) {
      best = cut;
      bestDist = dist;
    }
  }
  if (!best || bestDist > 0.09) return null;
  return best;
}

function describeTablets(amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 12) return null;
  const whole = Math.floor(amount + 1e-9);
  const fraction = amount - whole;
  if (fraction < 0.08) {
    if (whole <= 0) return null;
    return whole === 1 ? '1 comprimido inteiro' : `${whole} comprimidos`;
  }
  const cut = nearestCut(fraction);
  if (!cut) return null;
  if (whole === 0) return cut.label;
  const head = whole === 1 ? '1 comprimido' : `${whole} comprimidos`;
  return `${head} e ${cut.short}`;
}

const ALREADY_CLEAR = /(?:1\/[234]|meio|ter[cç]o|quarto|inteiro)/i;

const DECIMAL_TABLET = /(?<!\/)(\d+(?:[.,]\d+)?)\s*(?:de\s+|do\s+)?(?:um\s+)?comprimidos?\b/gi;

function comma(raw: string): string {
  return raw.replace('.', ',');
}

/**
 * Volume em duas fases (ataque e manutenção) sai como "o que puxar na seringa",
 * não como uma conta de mg/kg com o mL escondido no parêntese.
 */
export function formatAdministration(dosage: string): string {
  if (!dosage || /1º dia:\s*dar/i.test(dosage)) return dosage;

  const first = dosage.match(/(\d+(?:[.,]\d+)?)\s*mg\s+no\s+1[ºo°]?\s*dia\s*\(\s*(\d+(?:[.,]\d+)?)\s*ml\s*\)/i);
  const next = dosage.match(/(\d+(?:[.,]\d+)?)\s*mg\s+nos\s+(?:demais(?:\s+dias)?|dias seguintes)\s*\(\s*(\d+(?:[.,]\d+)?)\s*ml\s*\)/i);
  if (!first || !next) return dosage;

  const route = /oral/i.test(dosage) ? 'Via oral.' : '';
  return [
    `1º dia: dar ${comma(first[2])} mL na seringa (${comma(first[1])} mg).`,
    `Dias seguintes: dar ${comma(next[2])} mL na seringa (${comma(next[1])} mg).`,
    route,
  ].filter(Boolean).join('\n');
}

/** Troca "0,3 comprimido" / "0,6 do comprimido" por fração que se parte na prática. */
export function formatTabletDose(dosage: string): string {
  if (!dosage || !/comprimid/i.test(dosage)) return dosage;
  return dosage.replace(DECIMAL_TABLET, (match, raw: string) => {
    if (ALREADY_CLEAR.test(match)) return match;
    const amount = parseDecimal(raw);
    if (!Number.isFinite(amount)) return match;
    if (Number.isInteger(amount) && !/[.,]/.test(raw)) {
      return amount === 1 ? '1 comprimido inteiro' : `${amount} comprimidos`;
    }
    return describeTablets(amount) || match;
  });
}
