// مولد عدد شبه‌تصادفی با بذر.
//
// `Math.random` بذر نمی‌گیرد، پس جلسه‌ای که با آن ساخته شود بازتولیدپذیر
// نیست — و بازتولیدپذیری، قید اساسی مدل جلسه است: با شناسهٔ جلسه باید
// بشود دقیقاً همان جلسه را با همان اعداد بازسازی کرد.
//
// mulberry32: سی‌ودو بیتی، چند خط، بدون وابستگی. کیفیت آماری‌اش برای
// رمزنگاری کافی نیست و برای انتخاب تاریخ شروع بیش از کافی است. اگر روزی
// جایی به تصادفیِ امن نیاز شد، `node:crypto` هست — ولی آن بذر نمی‌گیرد و
// اینجا اصلاً کار ما را نمی‌کند.

/** رشتهٔ بذر به عدد سی‌ودو بیتی. الگوریتم xmur3. */
export function seedFrom(text) {
  let h = 1779033703 ^ String(text ?? '').length;
  for (let at = 0; at < String(text ?? '').length; at += 1) {
    h = Math.imul(h ^ String(text).charCodeAt(at), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** مولد. هر بار صدا زدن، عددی در بازهٔ ‎[۰،۱)‎ می‌دهد. */
export function makeRng(seed) {
  let state = (typeof seed === 'number' ? seed : seedFrom(seed)) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** یک عضو از فهرست. فهرست خالی `undefined` می‌دهد، نه خطا. */
export function pick(rng, list = []) {
  if (!Array.isArray(list) || !list.length) return undefined;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** جابه‌جایی فیشر-ییتس روی یک کپی. ورودی دست‌نخورده می‌ماند. */
export function shuffle(rng, list = []) {
  const out = (Array.isArray(list) ? list : []).slice();
  for (let at = out.length - 1; at > 0; at -= 1) {
    const to = Math.floor(rng() * (at + 1));
    [out[at], out[to]] = [out[to], out[at]];
  }
  return out;
}
