// ۷۷. انتقال در صفحهٔ تازه
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import {
  goHandoff, handoffPlan, openHandoffPage, stashHandoff, takeHandoff,
} from '../../ui/handoff.mjs';



// ═════════ ۷۷. انتقال در صفحهٔ تازه، نه روی صفحهٔ جاری ═════════
//
// خواسته کاربر: «وقتی با کلیک روی یک دکمه به قسمت بک‌تست سریع یا نمایش
// زنده می‌رویم یک صفحه جدید باز شود… با کلیک روی آن دکمه صفحه جاری حفظ
// شود و فعالیت جدید در صفحه جدید ظاهر شود.»
//
// نقشه دیگر از `state` این صفحه رد نمی‌شود، چون صفحهٔ تازه سند دیگری است.
// پس این گروه سه چیز را می‌سنجد: نقشه سالم از حافظه رد می‌شود، کلید
// یک‌بارمصرف است، و نبودِ حافظه به سکوت ختم نمی‌شود بلکه به مسیر قدیمی
// برمی‌گردد.
group('۷۷. انتقال در صفحهٔ تازه');
{
  const fakeStore = () => {
    const map = new Map();
    return {
      get length() { return map.size; },
      key: (i) => [...map.keys()][i] ?? null,
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: (k) => { map.delete(k); },
      _map: map,
    };
  };

  const prevWindow = globalThis.window;
  const ls = fakeStore();
  let opened = null, openedFeatures = null;
  // مرورگر واقعی: `window.open` با `noopener` **همیشه** `null` برمی‌گرداند،
  // حتی وقتی پنجره باز شده. اولین پیاده‌سازی این را نمی‌دانست و آزمونِ
  // اولیه هم چون همیشه یک شیء برمی‌گرداند، باگ را پنهان کرد. حالا بدل هم
  // همان قاعده را دارد، پس اگر `noopener` برگردد این گروه قرمز می‌شود.
  globalThis.window = {
    localStorage: ls,
    open: (url, target, features) => {
      opened = url; openedFeatures = features || '';
      return /noopener|noreferrer/.test(openedFeatures) ? null : { closed: false };
    },
  };
  globalThis.location = { pathname: '/', search: '' };

  const plan = handoffPlan({ uaIns: '9', underlying: 'خودرو', strategy: 'استرنگل',
    legsText: 'ض + ط', __legs: [{ kind: 'call', ins: '11' }, { kind: 'put', ins: '12' }] },
  { from: 'top', units: 3 });

  const token = stashHandoff(plan);
  check('کلید ساخته می‌شود', !!token, token);
  check('نقشه در حافظه نشسته است', ls._map.size === 1, `${ls._map.size} کلید`);

  const back = takeHandoff(token);
  check('نقشه دست‌نخورده برمی‌گردد',
    back?.uaIns === '9' && back.units === 3 && back.legIns.join(',') === '11,12',
    JSON.stringify({ ua: back?.uaIns, units: back?.units }));
  // یک‌بارمصرف: نوسازی صفحه نباید همان انتقال را دوباره اجرا کند
  check('کلید پس از برداشت پاک می‌شود', ls._map.size === 0 && takeHandoff(token) === null);

  // پنجرهٔ تازه: نشانی باید تب و کلید را با هم داشته باشد
  check('باز کردن صفحهٔ تازه موفق است', openHandoffPage(plan) === true);
  // ریشهٔ باگی که کاربر دید: با `noopener` هر باز شدنِ موفق «شکست» خوانده
  // می‌شد، پس هم کلید نقشه پاک می‌شد (صفحهٔ تازه خالی بالا می‌آمد) و هم
  // مسیر جایگزین اجرا می‌شد (صفحهٔ جاری هم عوض می‌شد).
  check('پنجره با noopener باز نمی‌شود، چون آن‌وقت باز شدنش قابل تشخیص نیست',
    !/noopener|noreferrer/.test(String(openedFeatures)), String(openedFeatures));
  check('نشانی صفحهٔ تازه تب و کلید دارد', /#backtest![a-z0-9]+$/.test(String(opened)), String(opened));
  check('کلید پس از باز شدن هنوز در حافظه است تا صفحهٔ مقصد برش دارد',
    ls._map.size === 1, `${ls._map.size} کلید`);
  // شبیه‌سازی صفحهٔ مقصد: کلید را از نشانی درمی‌آورد و نقشه را برمی‌دارد
  const arrivedToken = String(opened).split('!')[1];
  const arrived = takeHandoff(arrivedToken);
  check('نقشه سالم به صفحهٔ مقصد می‌رسد',
    arrived?.strategyId === plan.strategyId && arrived.units === plan.units
    && arrived.legIns.join(',') === plan.legIns.join(','),
    JSON.stringify({ id: arrived?.strategyId, units: arrived?.units }));

  // صفحهٔ مبدأ نباید دست بخورد وقتی پنجرهٔ تازه باز شده
  const source = { handoff: null };
  let hashSet = 0;
  globalThis.location = { pathname: '/', search: '', set hash(v) { hashSet += 1; } };
  check('باز شدن صفحهٔ تازه، صفحهٔ مبدأ را عوض نمی‌کند',
    goHandoff(source, plan) === true && source.handoff === null && hashSet === 0,
    `hash ${hashSet} بار ست شد`);

  // نقشهٔ منقضی نباید بنشیند
  const stale = stashHandoff(plan);
  const staleKey = [...ls._map.keys()].find((k) => k.endsWith(stale));
  ls.setItem(staleKey, JSON.stringify({ at: Date.now() - (11 * 60 * 1000), plan }));
  check('نقشهٔ کهنه برداشته نمی‌شود', takeHandoff(stale) === null);

  // پنجره باز نشد → فراخوان باید بفهمد، نه اینکه کلیک بی‌اثر بماند
  globalThis.window.open = () => null;
  const before = ls._map.size;
  check('پنجرهٔ مسدود، شکست را اعلام می‌کند', openHandoffPage(plan) === false);
  check('کلیدِ پنجرهٔ مسدود جا نمی‌ماند', ls._map.size === before, `${ls._map.size} کلید`);

  // بدون حافظه هم نباید بترکد
  globalThis.window = { open: () => ({}) };
  check('نبود حافظه به استثنا ختم نمی‌شود', stashHandoff(plan) === '' && openHandoffPage(plan) === false);

  globalThis.window = prevWindow;
  delete globalThis.location;

  // مسیر قدیمی باید در کد بماند: اگر پنجره باز نشد، تب همین صفحه عوض شود
  const src = readSrc('../ui/handoff.mjs');
  check('برگشت به مسیر قدیمی در goHandoff هست',
    /export function goHandoff[\s\S]*openHandoffPage\(plan, tab\)[\s\S]*state\.handoff = plan;[\s\S]*location\.hash = tab;/.test(src));

  // هیچ تبی نباید مستقیم hash را برای انتقال دست بزند
  const direct = ['top', 'strategy', 'history', 'portfolio-backtest']
    .filter((name) => /location\.hash *= *'backtest'/.test(readSrc(`../ui/tabs/${name}.mjs`)));
  check('هیچ تبی دیگر مستقیم به بک‌تست پرش نمی‌کند', direct.length === 0, direct.join('، '));

  // مسیریاب باید شکل «تب!کلید» را بشناسد و کلید را از نشانی پاک کند
  const app = readSrc('../ui/app.mjs');
  check('مسیریاب کلید را از نشانی جدا می‌کند', /const at = text\.indexOf\('!'\)/.test(app));
  check('مسیریاب کلید را از نشانی پاک می‌کند', /history\.replaceState\(null, '', `\$\{location\.pathname\}\$\{location\.search\}#\$\{route\.id\}`\)/.test(app));
}
