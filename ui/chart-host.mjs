// میزبان نمودار — ECharts محلی، با رنگِ توکن و رقم فارسی.
//
// سه چیز اینجا حل می‌شود که اگر در هر نمودار جداگانه حل شوند، تا فردا از هم
// واگرا می‌شوند:
//
//   رنگ    ECharts رنگ واقعی می‌خواهد، نه `var(--gain)`. پس توکن‌ها یک‌بار
//          از خودِ صفحه خوانده می‌شوند. یعنی پوستهٔ دفتر هم بدون کد اضافه
//          درست درمی‌آید و قاعدهٔ «رنگ از توکن می‌آید» نمی‌شکند.
//   رقم    محور و راهنما به‌طور پیش‌فرض رقم لاتین می‌نویسند. هر قالب‌بندی
//          عددی از همین‌جا رد می‌شود تا هیچ‌جا «12.5%» ننویسد.
//   عمر    نمودار باید با تغییر اندازه بزرگ شود و با رفتن از تب، آزاد شود.
//          یادنکردنش نشتی حافظه است که فقط بعد از نیم‌ساعت کار پیدا می‌شود.
//
// اگر ماژول بار نشود، نمودار پیام روشن می‌دهد و بقیهٔ صفحه سر جایش می‌ماند.
// جدول‌ها همان داده را دارند؛ نبود نمودار نباید صفحه را از کار بیندازد.

import { faDigits, fmt } from './fmt.mjs';

let modulePromise = null;
let moduleFailed = '';

/** ماژول را یک‌بار بار می‌کند و همان وعده را به همه می‌دهد. */
export function loadCharts() {
  if (!modulePromise) {
    modulePromise = import('/vendor/echarts/echarts.esm.min.js').catch((error) => {
      moduleFailed = String(error?.message || error);
      return null;
    });
  }
  return modulePromise;
}

export const chartsFailure = () => moduleFailed;

// هیچ رنگِ پشتیبانی اینجا نوشته نمی‌شود. توکن‌ها در `:root` تعریف‌شده‌اند و
// اگر روزی یکی نبود، جایش در CSS است نه اینجا — رنگِ پشتیبان در جاوااسکریپت
// یعنی دو منبع حقیقت برای یک رنگ، و همان چیزی است که قاعدهٔ «رنگ از توکن
// می‌آید» جلویش را گرفته.
const cssVar = (style, name) => style.getPropertyValue(name).trim();

/**
 * توکن‌های رنگ و قلم، از همان صفحه‌ای که نمودار در آن می‌نشیند.
 *
 * از `document.body` خوانده می‌شود نه از میزبان، چون `body[data-theme]`
 * جایی است که پوسته عوض می‌شود.
 */
export function chartTokens() {
  const style = getComputedStyle(document.body);
  return {
    ink: cssVar(style, '--ink'),
    muted: cssVar(style, '--muted'),
    line: cssVar(style, '--line'),
    lineSoft: cssVar(style, '--line-soft'),
    panel: cssVar(style, '--panel'),
    panel2: cssVar(style, '--panel-2'),
    accent: cssVar(style, '--accent'),
    gain: cssVar(style, '--gain'),
    loss: cssVar(style, '--loss'),
    warn: cssVar(style, '--warn'),
    // نسخهٔ کم‌رنگ هر تُن: برای سایه، ناحیه و میلهٔ پس‌زمینه لازم است و
    // بی آن، هر نمودار خودش با `opacity` سرِ هم می‌کند و تُن‌ها یکدست
    // نمی‌مانند.
    gainSoft: cssVar(style, '--gain-soft'),
    lossSoft: cssVar(style, '--loss-soft'),
    warnSoft: cssVar(style, '--warn-soft'),
    accentSoft: cssVar(style, '--accent-soft'),
    accentInk: cssVar(style, '--accent-ink'),
    font: cssVar(style, '--font'),
    shadow: cssVar(style, '--shadow-md'),
    series: [1, 2, 3, 4, 5, 6].map((index) => cssVar(style, `--series-${index}`)),
    palette: ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6',
      '--cmp1', '--cmp2', '--cmp3', '--cmp4'].map((name) => cssVar(style, name)),
  };
}

/** قالب‌بندی‌های مشترک — همه با رقم فارسی. */
export const chartFormat = {
  pct: (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—'),
  num: (value) => (Number.isFinite(value) ? faDigits(String(Math.round(value * 100) / 100)) : '—'),
  money: (value) => (Number.isFinite(value) ? fmt.money(value) : '—'),
  int: (value) => (Number.isFinite(value) ? fmt.int(value) : '—'),
  text: (value) => faDigits(String(value ?? '')),
};

/**
 * پایهٔ مشترک هر نمودار: قلم، رنگ متن، شبکه، و راهنمای شناور.
 *
 * هر نمودار این را می‌گیرد و رویش گزینه‌های خودش را می‌گذارد؛ پس تغییر
 * ظاهر در یک نقطه انجام می‌شود نه در ده تا.
 */
export function chartBase(tokens) {
  return {
    animationDuration: 420,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: tokens.font, color: tokens.ink },
    color: tokens.palette,
    tooltip: {
      backgroundColor: tokens.panel,
      borderColor: tokens.line,
      textStyle: { fontFamily: tokens.font, color: tokens.ink },
      extraCssText: `box-shadow: ${tokens.shadow}; border-radius: var(--radius-md);`,
    },
    grid: { left: 64, right: 24, top: 36, bottom: 56, containLabel: true },
  };
}

/**
 * نمودار را روی میزبان سوار می‌کند و دستهٔ کنترلش را برمی‌گرداند.
 *
 * `build(echarts, tokens)` باید شیء گزینه بدهد. با `update()` دوباره صدا
 * زده می‌شود — پس عوض‌شدن مبنا یا آماره فقط یک `update()` است، نه ساختن
 * دوبارهٔ نمودار.
 */
export async function mountChart(host, build, { onClick = null, empty = 'داده‌ای برای نمودار نیست' } = {}) {
  if (!host) return null;
  const echarts = await loadCharts();
  if (!echarts) {
    host.innerHTML = `<p class="empty-note">کتابخانهٔ نمودار بار نشد؛ جدول‌های همین بخش همان داده را دارند. ${faDigits(moduleFailed)}</p>`;
    return null;
  }
  const previous = echarts.getInstanceByDom(host);
  if (previous) previous.dispose();
  host.innerHTML = '';
  const instance = echarts.init(host, null, { renderer: 'canvas' });

  const paint = () => {
    const tokens = chartTokens();
    const option = build(echarts, tokens);
    if (!option) return false;
    // `notMerge` لازم است: وقتی سری‌ها کم می‌شوند، ادغام، سری قدیمی را
    // روی نمودار نگه می‌دارد و کاربر دادهٔ اجرای قبلی را می‌بیند.
    instance.setOption({ ...chartBase(tokens), ...option }, { notMerge: true });
    return true;
  };
  // ترتیب مهم است: `dispose` ظرف را پاک می‌کند. یادداشت اگر پیش از آن
  // نوشته شود، پاک می‌شود و کاربر یک قاب کاملاً خالی می‌بیند — بی‌آنکه
  // بداند داده نبوده یا نمودار خراب شده.
  if (!paint()) {
    instance.dispose();
    host.innerHTML = `<p class="empty-note">${faDigits(empty)}</p>`;
    return null;
  }
  if (onClick) instance.on('click', onClick);

  // ناظرِ اندازه باید **فقط** روی تغییر واقعی کار کند.
  //
  // `instance.resize()` خودش بوم را عوض می‌کند و اگر ظرف در چیدمانی باشد
  // که اندازه‌اش به محتوا وابسته است، ناظر دوباره شلیک می‌شود و حلقه بسته
  // می‌شود. با بیست‌وچند نمودار روی یک صفحه، همین حلقه نخِ اصلی را چنان
  // اشغال کرد که هر فرمان بعدی بیش از نود ثانیه بی‌پاسخ ماند — و صفحه
  // ظاهراً سالم بود.
  let lastWidth = 0, lastHeight = 0;
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      const width = Math.round(box.width), height = Math.round(box.height);
      // ظرفِ پنهان صفر است؛ تغییر اندازه رویش بی‌معناست و فقط کار می‌تراشد.
      if (width < 2 || height < 2) return;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width; lastHeight = height;
      instance.resize();
    })
    : null;
  observer?.observe(host);

  return {
    instance,
    update(next) { if (next) build = next; paint(); },
    resize() {
      const box = host.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return;
      instance.resize();
    },
    dispose() { observer?.disconnect(); instance.dispose(); },
  };
}

/**
 * چند نمودار روی یک صفحه، با یک نقطهٔ آزادسازی.
 *
 * تب‌ها با هم عوض می‌شوند و اگر آزادسازی پراکنده باشد، همیشه یکی جا
 * می‌ماند.
 */
export function chartGroup() {
  const handles = new Map();
  return {
    async set(key, host, build, options) {
      handles.get(key)?.dispose();
      handles.delete(key);
      const handle = await mountChart(host, build, options);
      if (handle) handles.set(key, handle);
      return handle;
    },
    get: (key) => handles.get(key) || null,
    resizeAll() { for (const handle of handles.values()) handle.resize(); },
    /**
     * انیمیشنِ همهٔ نمودارها را می‌خواباند.
     *
     * ECharts با پنهان‌شدن ظرف چیزی را متوقف نمی‌کند. نموداری که انیمیشنش
     * تمام‌نشدنی است، در پنلی بسته هم نخِ اصلی را می‌چرخاند و بقیهٔ صفحه
     * کند می‌شود بی‌آنکه چیزی خراب به نظر برسد.
     */
    stopAll() { for (const handle of handles.values()) handle.instance.stopAnimation?.(); },
    disposeAll() {
      for (const handle of handles.values()) handle.dispose();
      handles.clear();
    },
  };
}
