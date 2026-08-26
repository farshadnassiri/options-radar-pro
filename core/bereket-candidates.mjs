// تولید کاندید، و پرتفوی سایه.
//
// ═══ تولید ═══
//
// برای هر ساختار فعال، همهٔ ترکیبات **معقول** قیمت اعمال و سررسید ساخته
// می‌شود. کلمهٔ معقول مهم است: تعداد ترکیب با تعداد پا رشد انفجاری دارد و
// بیشترشان هم بی‌معنی‌اند — باترفلایی با بال‌های نامتقارنِ ده‌برابری،
// ترکیبی است ولی گزینه نیست. پس پنجره‌های پیوستهٔ قیمت اعمال با چند
// فاصلهٔ مشخص ساخته می‌شوند، نه همهٔ زیرمجموعه‌ها.
//
// ═══ سایه ═══
//
// این تک‌ویژگی است که بین بدشانسی و بدانتخابی مرز می‌گذارد. هر جلسه
// به‌جای یک مشاهده، به تعداد کاندیدها مشاهده تولید می‌کند — و هزینه‌اش
// تقریباً صفر است، چون کاندیدها از قبل ساخته و قیمت‌خورده‌اند.
//
// پوزیشن سایه در سرمایه و وجه تضمین **دخالت نمی‌کند**. اگر می‌کرد، وجود
// خودش نتیجهٔ جلسه را عوض می‌کرد و دیگر مقایسه نبود.

import { num } from './num.mjs';
import { signedQty } from './payoff.mjs';

/** حداکثر ترکیب به‌ازای هر ساختار، و در کل. مهار انفجار. */
export const MAX_PER_DEF = 12;
export const MAX_TOTAL = 120;

/** فاصله‌های قیمت اعمال که امتحان می‌شوند: چسبیده، یکی‌درمیان، دوتا‌درمیان. */
export const STRIKE_STEPS = [1, 2, 3];

/**
 * شناسهٔ پایدار یک ترکیب.
 *
 * از خودِ پاها ساخته می‌شود نه از شمارنده، تا همان ترکیب در دو اجرا یک
 * شناسه بگیرد. بدون این، مقایسهٔ انتخاب کاربر با سایه‌ها در بازسازی
 * جلسه از هم می‌پاشید.
 */
export function candidateId(defId, legs = []) {
  const parts = (legs || []).map((leg) => (leg.kind === 'underlying'
    ? 'u'
    : `${leg.kind[0]}${leg.side[0]}${Math.trunc(num(leg.strike, 0))}@${Math.trunc(num(leg.expiry, 0))}`));
  return `${defId}|${parts.join('_')}`;
}

/**
 * ترکیبات یک ساختار روی فهرست قراردادهای موجود.
 *
 * `contracts` باید همان قراردادهایی باشند که در آن **تاریخ** واقعاً وجود
 * داشتند. این تابع خودش چیزی را فیلتر نمی‌کند: هر قراردادی که به آن داده
 * شود، موجود فرض می‌شود. جداسازی عمدی است — «کدام قرارداد آن روز بود»
 * پرسشی دربارهٔ داده است و به دروازهٔ زمان تعلق دارد، نه به تولید ترکیب.
 */
export function combosFor(def, contracts = [], spot, {
  maxPerDef = MAX_PER_DEF,
  steps = STRIKE_STEPS,
  contractSize = 1000,
  contractAllowed = null,
} = {}) {
  const S = num(spot, NaN);
  const list = (contracts || []).filter((row) => num(row?.strike, 0) > 0 && row?.kind);
  if (!def || !list.length || !(S > 0)) return [];

  const expiries = [...new Set(list.map((row) => num(row.expiry, 0)))].filter(Boolean).sort((a, b) => a - b);
  if (expiries.length < def.expiries) return [];
  // سررسیدهای مورد استفاده: نزدیک‌ترین‌ها. برای تقویمی و مورب، جفتِ
  // نزدیک و دورِ بعدی — نه هر جفت ممکن، که تعدادش را چند برابر می‌کرد
  // بی‌آنکه چیز تازه‌ای بگوید.
  const expiryPlans = def.expiries === 1
    ? expiries.slice(0, 3).map((one) => [one])
    : expiries.slice(0, 3).flatMap((near, at) => expiries.slice(at + 1, at + 3).map((far) => [near, far]));

  const out = [];
  for (const plan of expiryPlans) {
    const pool = list.filter((row) => plan.includes(num(row.expiry, 0)));
    const strikes = [...new Set(pool.map((row) => num(row.strike)))].sort((a, b) => a - b);
    if (strikes.length < def.strikes) continue;
    const atmIndex = strikes.reduce((best, value, at) => (
      Math.abs(value - S) < Math.abs(strikes[best] - S) ? at : best), 0);

    for (const step of steps) {
      const span = (def.strikes - 1) * step;
      // پنجره را حول قیمت جاری می‌بریم، نه از ابتدای فهرست: ترکیبی که
      // همهٔ پاهایش ده درصد دورند، ترکیب است ولی کسی نمی‌سازدش.
      for (let shift = -1; shift <= 1; shift += 1) {
        const from = atmIndex - Math.floor(span / 2) + shift * step;
        if (from < 0 || from + span >= strikes.length) continue;
        const picked = Array.from({ length: def.strikes }, (_, at) => strikes[from + at * step]);
        const legs = [];
        let complete = true;
        for (const template of def.legs) {
          if (template.kind === 'underlying') {
            legs.push({ kind: 'underlying', side: template.side, ratio: template.ratio, size: 1 });
            continue;
          }
          const wantExpiry = plan[Math.min(template.exp, plan.length - 1)];
          const contract = pool.find((row) => row.kind === template.kind
            && num(row.strike) === picked[template.slot - 1] && num(row.expiry) === wantExpiry
            && (typeof contractAllowed !== 'function' || contractAllowed(row, template, def)));
          if (!contract) { complete = false; break; }
          legs.push({
            kind: template.kind, side: template.side, ratio: template.ratio,
            size: num(contract.size, contractSize), strike: num(contract.strike),
            ins: String(contract.ins), expiry: num(contract.expiry), name: contract.name || '',
          });
        }
        if (!complete) continue;
        const id = candidateId(def.id, legs);
        if (out.some((row) => row.id === id)) continue;
        out.push({ id, defId: def.id, defName: def.name, legs, strikes: picked, expiries: plan, step });
        if (out.length >= maxPerDef) return out;
      }
    }
  }
  return out;
}

/** ترکیبات همهٔ ساختارهای انتخاب‌شده، با سقف کل. */
export function generateCandidates(defs = [], contracts = [], spot, options = {}) {
  const out = [];
  const cap = Math.max(1, num(options.maxTotal, MAX_TOTAL));
  for (const def of defs || []) {
    for (const combo of combosFor(def, contracts, spot, options)) {
      out.push(combo);
      if (out.length >= cap) return { candidates: out, truncated: true };
    }
  }
  return { candidates: out, truncated: false };
}

// ═════════════════════ پرتفوی سایه ═════════════════════

/**
 * باز کردن یک پوزیشن سایه.
 *
 * `isShadow` همیشه true است و هیچ راهی برای false کردنش نیست. اگر
 * پارامتری داشت، روزی یکی به اشتباه پوزیشن واقعی را از این مسیر می‌ساخت
 * و آن پوزیشن در سرمایه شمرده نمی‌شد.
 */
export function openShadow({ id, defId, defName, legs = [], prices = [], size = 1, at, score = null, capital = NaN } = {}) {
  return {
    id: String(id || ''), defId, defName, isShadow: true,
    legs, entryPrices: prices.slice(), size: Math.max(1, Math.trunc(num(size, 1))),
    openedAt: at ? { ...at } : null, score, capital: num(capital, NaN),
    closed: false, closedAt: null,
  };
}

/**
 * سود و زیان یک سایه با قیمت‌های تازه.
 *
 * پایی که قیمت ندارد کل سایه را `NaN` می‌کند، نه اینکه سهمش صفر شود.
 * سایه‌ای که نیمی از پاهایش قیمت دارد، عددش با سایه‌ای که کامل است
 * هم‌جنس نیست و نشستنشان در یک ستون، رتبه‌بندی را دروغ می‌کند.
 */
export function markShadow(shadow, prices = []) {
  if (!shadow?.legs?.length) return NaN;
  let total = 0;
  for (let at = 0; at < shadow.legs.length; at += 1) {
    const now = Number(prices[at]);
    const entry = Number(shadow.entryPrices[at]);
    if (!Number.isFinite(now) || !Number.isFinite(entry)) return NaN;
    total += signedQty(shadow.legs[at]) * (now - entry);
  }
  return total * shadow.size;
}

/**
 * جدول مقایسه‌ای یک لحظه: هر سایه، سودش، و رتبه‌اش.
 *
 * انتخاب کاربر جدا علامت می‌خورد. رتبه از سود می‌آید نه از امتیاز موتور —
 * این جدول دربارهٔ آن است که **چه شد**، نه اینکه موتور چه فکر می‌کرد.
 */
export function shadowTable(shadows = [], pricesById = {}, chosenIds = []) {
  const chosen = new Set((chosenIds || []).map(String));
  const rows = (shadows || []).map((shadow) => ({
    id: shadow.id, defName: shadow.defName, isChosen: chosen.has(String(shadow.id)),
    pnl: markShadow(shadow, pricesById[shadow.id] || []),
    capital: shadow.capital,
    engineRank: shadow.score?.rank ?? NaN,
  }));
  const scored = rows.filter((row) => Number.isFinite(row.pnl))
    .sort((a, b) => b.pnl - a.pnl)
    .map((row, at) => ({ ...row, rank: at + 1 }));
  const unpriced = rows.filter((row) => !Number.isFinite(row.pnl))
    .map((row) => ({ ...row, rank: NaN }));
  const mine = scored.filter((row) => row.isChosen);
  return {
    rows: [...scored, ...unpriced],
    ranked: scored.length,
    unpriced: unpriced.length,
    myRanks: mine.map((row) => row.rank),
    myBest: mine.length ? Math.min(...mine.map((row) => row.rank)) : NaN,
    winners: scored.filter((row) => row.pnl > 0).length,
  };
}
