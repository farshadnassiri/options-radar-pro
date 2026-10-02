// در جست‌وجوی استراتژی‌ها — یک در برای هر سی‌وشش ساختار.
//
// ═══ چرا این تب ساخته شد ═══
//
// فهرست کناری نُه سرگروهِ استراتژی داشت و هر سرگروه یک زیرمنوی شناور.
// نتیجه‌اش این بود که ستونِ کناری عملاً فهرستِ استراتژی‌ها شده بود و شش تبِ
// کاری — تنظیمات، رصد لحظه‌ای، تاریخچه، آزمایشگاه، دیده‌بان، دفتر خطاها —
// لایش گم می‌شدند؛ و رسیدن به هر استراتژی دو کلیک می‌خواست که کلیک دومش
// روی پنلی بود که خودش روی محتوا می‌نشست.
//
// حالا همان تقسیم‌بندی — همان نُه گروه، بی کم و کاست — داخلِ همین صفحه به
// شکل تب است. هیچ استراتژی‌ای حذف نشد و هیچ گروهی جابه‌جا نشد؛ فقط جایشان
// از ستونِ کناری به اینجا آمد.
//
// ═══ چرا استراتژی همین‌جا سوار می‌شود، نه در تبِ خودش ═══
//
// اگر کلیک روی «Covered Call» تبِ استراتژی را در `stage` باز می‌کرد، کاربر
// از صفحه‌ای که تازه در آن می‌گشت بیرون پرت می‌شد و برای دیدنِ ساختارِ
// بعدی باید برمی‌گشت. تبِ استراتژی همان `ui/tabs/strategy.mjs` است و
// امضایش `mount(root, ctx)` — پس همان‌جا که هست، داخلِ این صفحه سوار
// می‌شود و با عوض شدنِ انتخاب، `dispose` خودش صدا زده می‌شود.
//
// نشانیِ `#covered-call` همچنان کار می‌کند و تبِ استراتژی را تمام‌صفحه باز
// می‌کند — پیوندهای بین‌تبی و نقشهٔ انتقال به آن راه دارند. آنچه عوض شد
// راهِ **گشتن** است، نه راهِ **رسیدن**.

import { CATALOG, GROUPS } from '/strategies/catalog.mjs';
import { GROUP_ICON, icon } from '/ui/icons.mjs';
import { faDigits, ltr, normFa } from '/ui/fmt.mjs';
import { mountSubtabs } from '/ui/subtabs.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

const GROUP_KEYS = Object.keys(GROUPS).filter((key) => CATALOG.some((d) => d.group === key));

/** جهت هر استراتژی — یک نقطهٔ رنگی کنار نام، با عنوان راهنما. */
function dirTone(def) {
  const d = String(def?.dir || '');
  if (/صعودی/.test(d)) return ['صعودی', 'up'];
  if (/نزولی/.test(d)) return ['نزولی', 'down'];
  if (/خنثی|بی‌جهت/.test(d)) return ['خنثی', 'flat'];
  if (/تلاطم/.test(d)) return ['تلاطم', 'vol'];
  return [null, null];
}

/** متنی که جست‌وجو در آن می‌گردد — همان چیزی که جعبهٔ ریل می‌دید. */
const haystack = (def) => normFa(
  `${def.name} ${def.fa || ''} ${GROUPS[def.group] || ''} ${def.dir || ''} ${def.note || ''}`,
).toLowerCase();

export async function mount(root, { state, api }) {
  root.innerHTML = `
    <section class="card sx-head">
      <div class="section-head">
        <div>
          <p class="eyebrow">همهٔ ساختارهای زنده، گروه‌به‌گروه</p>
          <h2>در جست‌وجوی استراتژی‌ها</h2>
        </div>
        <div class="sx-search">
          <input type="search" id="sx-q" autocomplete="off"
            placeholder="نام استراتژی یا برابر فارسی‌اش… ( / )"
            aria-label="جست‌وجوی استراتژی">
          <label class="check" for="sx-feasible"><input type="checkbox" id="sx-feasible">
            فقط اجراپذیرها</label>
          <span class="sx-count" id="sx-count"></span>
        </div>
      </div>
      <div id="sx-tabs"></div>
      ${GROUP_KEYS.map((key) => `<div data-panel="sx-${esc(key)}" hidden>
        <div class="sx-list" data-group="${esc(key)}"></div>
      </div>`).join('')}
      <p class="note" id="sx-none" hidden>هیچ استراتژی‌ای با این جست‌وجو نخواند.</p>
    </section>
    <section id="sx-stage">
      <div class="empty"><p>یک استراتژی را از بالا انتخاب کن. تا انتخاب نشود، هیچ داده‌ای گرفته نمی‌شود.</p></div>
    </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const stage = $('sx-stage');
  const noneNote = $('sx-none');

  let query = '';
  // ═══ چرا ستارهٔ کنارِ نام کافی نبود ═══
  //
  // ساختارِ اجراناپذیر از قبل `⃰` می‌گرفت، ولی **در ترتیبِ فهرست با
  // اجراپذیرها قاطی بود**. کاربری که دنبال چیزی برای امروز می‌گشت، سه
  // دکمهٔ اول را می‌زد و هر سه به صفحه‌ای می‌رسیدند که می‌گفت «در تابلو
  // ممکن نیست». حالا همیشه ته گروه می‌نشینند، و با این تیک کلاً کنار
  // می‌روند. حذفِ همیشگی‌شان درست نبود: دانستنِ اینکه چنین ساختاری هست و
  // چرا نمی‌شود، خودش خبر است.
  let onlyFeasible = false;
  let pickedId = null;
  let dispose = null;
  // شمارندهٔ نسل: کلیک روی استراتژی دوم پیش از تمام شدنِ import/mount اولی،
  // بدون این می‌توانست دیرتر برگردد و روی صفحهٔ درستی بنشیند که کاربر
  // واقعاً می‌بیند — همان مسابقه‌ای که مدیر تبِ برنامه هم با `openGen`
  // می‌بندد.
  let gen = 0;

  const visible = (key) => {
    const q = normFa(query).toLowerCase();
    return CATALOG
      .filter((d) => d.group === key && (!q || haystack(d).includes(q)))
      .filter((d) => !onlyFeasible || d.feasible)
      // ترتیب پایدار است: میان دو هم‌وضعیت، ترتیبِ خودِ کاتالوگ می‌ماند.
      .sort((a, b) => (a.feasible === b.feasible ? 0 : (a.feasible ? -1 : 1)));
  };

  async function showStrategy(def) {
    if (!def) return;
    pickedId = def.id;
    for (const b of root.querySelectorAll('.sx-list .tab-btn')) {
      b.setAttribute('aria-current', b.dataset.tab === def.id ? 'true' : 'false');
    }
    const mine = ++gen;
    if (dispose) { try { dispose(); } catch { /* تبِ قبلی خودش را جمع نکرد */ } dispose = null; }
    stage.innerHTML = '<div class="empty"><p>در حال باز کردن…</p></div>';
    try {
      const mod = await import('/ui/tabs/strategy.mjs');
      if (mine !== gen) return;
      stage.innerHTML = '';
      const d = await mod.mount(stage, { tab: { id: def.id, title: def.name, def }, state, api });
      if (mine !== gen) { try { d?.(); } catch { /* کهنه شد */ } return; }
      dispose = d;
    } catch (e) {
      if (mine !== gen) return;
      stage.innerHTML = `<div class="card"><h3>استراتژی باز نشد</h3><p class="note">${esc(e.message)}</p></div>`;
    }
  }

  function paintLists() {
    let shown = 0;
    for (const key of GROUP_KEYS) {
      const host = root.querySelector(`.sx-list[data-group="${key}"]`);
      const defs = visible(key);
      shown += defs.length;
      host.innerHTML = '';
      if (!defs.length) {
        const p = document.createElement('p');
        p.className = 'note';
        p.textContent = 'در این گروه چیزی با این جست‌وجو نخواند.';
        host.appendChild(p);
        continue;
      }
      for (const def of defs) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tab-btn';
        b.dataset.tab = def.id;
        b.setAttribute('aria-current', pickedId === def.id ? 'true' : 'false');
        const infeasible = !def.feasible;
        b.title = infeasible ? def.infeasibleWhy : (def.note || def.dir || def.name);
        const [tone, cls] = dirTone(def);
        b.innerHTML = `
          ${icon(GROUP_ICON[def.group] || 'dot', 'ic tab-ic')}
          <span class="tab-name">${ltr(def.name)}</span>
          ${infeasible ? '<span class="tab-flag" title="اجرا در تابلو ممکن نیست">⃰</span>' : ''}
          ${tone ? `<span class="tone-dot ${cls}" title="${tone}"></span>` : ''}`;
        b.addEventListener('click', () => { showStrategy(def); });
        host.appendChild(b);
      }
    }
    const filtered = query || onlyFeasible;
    $('sx-count').textContent = filtered
      ? `${faDigits(shown)} از ${faDigits(CATALOG.length)}`
      : `${faDigits(CATALOG.length)} استراتژی`;
    noneNote.hidden = shown > 0;
  }

  paintLists();

  // نوار گروه‌ها. شمارِ هر گروه روی برچسب می‌نشیند چون با جست‌وجو عوض
  // می‌شود و کاربر باید بدون باز کردنِ گروه بداند آنجا چیزی مانده یا نه.
  const tabsOf = () => GROUP_KEYS.map((key) => ({
    id: `sx-${key}`,
    label: `${GROUPS[key]} (${faDigits(visible(key).length)})`,
    hint: GROUPS[key],
  }));
  let bar = mountSubtabs($('sx-tabs'), tabsOf(), { root });

  // برچسبِ گروه‌ها شمارِ همان گروه را دارد و با هر پالایه عوض می‌شود، پس
  // `mountSubtabs` نوار را واقعاً از نو می‌سازد. تبِ فعلی نگه داشته می‌شود
  // تا کاربر با هر حرفِ تایپ‌شده سر از گروه اول درنیاورد.
  const repaint = () => {
    paintLists();
    const keep = bar?.current;
    bar = mountSubtabs($('sx-tabs'), tabsOf(), { root, initial: keep }) || bar;
  };

  $('sx-feasible').addEventListener('change', (e) => {
    onlyFeasible = e.target.checked;
    repaint();
  });

  $('sx-q').addEventListener('input', (e) => {
    query = e.target.value;
    repaint();
  });

  return () => {
    if (dispose) { try { dispose(); } catch { /* بی‌اهمیت */ } }
    gen += 1;
  };
}
