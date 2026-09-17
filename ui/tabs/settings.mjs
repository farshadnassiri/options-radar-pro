// تب تنظیمات.
//
// فرم از SCHEMA ساخته می‌شود، نه دستی. پس اگر عددی به موتور اضافه شد و
// اینجا کنترلی ندارد، یعنی در SCHEMA ثبت نشده — و همین، جلوی سخت‌کد شدن
// اعداد در کد را می‌گیرد.

import { SCHEMA, GROUPS, defaults } from '/core/settings.mjs';
import { FORMULAS, FORMULA_GROUPS, STRATEGY_FORMULAS, SYMBOLS } from '/core/formulas.mjs';
import { CATALOG, GROUPS as STRAT_GROUPS } from '/strategies/catalog.mjs';
import { faDigits, fmt, ltr } from '/ui/fmt.mjs';
import { BACKUP_PARTS, buildBackup, readBackup, restorePlan } from '/core/backup-bundle.mjs';

const SCOPE_LABEL = { server: 'سرور', client: 'مرورگر', both: 'هر دو' };

const esc = (t) => String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * بخش مرجع فرمول‌ها.
 *
 * جایش همین تب است، نه یک صفحه راهنمای جدا: عددی که کاربر می‌خواهد عوض
 * کند و توضیحِ اینکه آن عدد کجای محاسبه می‌نشیند، باید کنار هم باشند.
 * هر کارت فهرست کلیدهایی را که می‌خواند نشان می‌دهد و کلیک روی هر کلید،
 * کنترلش را در همین صفحه پیدا و برجسته می‌کند.
 */
function renderFormulas(host, { labelOf, focusKey }) {
  const chip = (k) => {
    const label = labelOf(k);
    return label ? `<button type="button" class="fx-key" data-key="${esc(k)}">${esc(label)}</button>` : '';
  };

  const cards = Object.entries(FORMULA_GROUPS).map(([gid, meta]) => {
    const items = FORMULAS.filter((f) => f.group === gid).map((f) => `
      <article class="fx-item">
        <h4>${esc(f.title)}</h4>
        <pre class="fx-expr">${f.lines.map(esc).join('\n')}</pre>
        ${f.note ? `<p class="fx-note">${esc(f.note)}</p>` : ''}
        ${f.reads.length ? `<div class="fx-keys"><span>می‌خواند از</span>${f.reads.map(chip).join('')}</div>` : ''}
      </article>`).join('');
    return `
      <section class="card settings-card fx-card" id="fx-${esc(gid)}">
        <h3>${esc(meta.title)}</h3>
        ${meta.note ? `<p class="note">${esc(meta.note)}</p>` : ''}
        <div class="fx-list">${items}</div>
      </section>`;
  }).join('');

  const byGroup = Object.entries(STRAT_GROUPS).map(([gid, gname]) => {
    const rows = CATALOG.filter((d) => d.group === gid).map((d) => {
      const c = STRATEGY_FORMULAS[d.id];
      if (!c) return '';
      const walk = c.walkthrough
        ? `<ol class="fx-walk">${c.walkthrough.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`
        : '';
      return `
        <details class="fx-strategy">
          <summary><b>${ltr(esc(d.name))}</b><span>${esc(d.dir)}</span></summary>
          <div class="fx-strategy-body">
            <p class="fx-capital"><span>سرمایه درگیر</span> ${esc(c.capital)}</p>
            <table class="fx-rows"><tbody>
              ${c.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
            </tbody></table>
            ${walk}
            <p class="fx-watch">${esc(c.watch)}</p>
          </div>
        </details>`;
    }).join('');
    return rows ? `<div class="fx-strategy-group"><h4>${esc(gname)}</h4>${rows}</div>` : '';
  }).join('');

  host.innerHTML = `
    <div class="page-head fx-head">
      <h2>فرمول‌ها</h2>
      <p>همان محاسبه‌ای که موتور می‌کند، به زبان آدم. هر رابطه می‌گوید کدام
         عدد این صفحه را می‌خواند؛ روی نامش بزن تا کنترلش را پیدا کنی.
         عددی که ندانی از کجا آمده، قابل اعتماد نیست — چه درست باشد چه غلط.</p>
    </div>
    <section class="card settings-card">
      <h3>نمادها</h3>
      <table class="fx-rows"><tbody>
        ${SYMBOLS.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
      </tbody></table>
    </section>
    ${cards}
    <section class="card settings-card">
      <h3>هر استراتژی، جداگانه</h3>
      <p class="note">همه استراتژی‌ها از همان موتور بالا عبور می‌کنند و هیچ‌کدام
         محاسبه‌گر اختصاصی ندارد. آنچه اینجا می‌آید، همان چیزی است که از
         استراتژی به استراتژی فرق می‌کند.</p>
      <div class="fx-strategies">${byGroup}</div>
    </section>`;

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('.fx-key');
    if (btn) focusKey(btn.dataset.key);
  });
}


export async function mount(root, { state, api }) {
  // اگر فایل تنظیمات از نسخه قبلی مانده و کلید تازه‌ای نداشته باشد، پیش‌فرض
  // همان کلید می‌نشیند. سرور هم همین کار را می‌کند؛ این لایه دوم است.
  const s = { ...defaults(), ...state.settings };

  root.innerHTML = `
    <div class="page-head">
      <h2>تنظیمات</h2>
      <p>هر عددی که در محاسبه اثر دارد اینجاست و در هیچ جای کد سخت‌کد نشده.
         تنظیمات سرور روی حلقه دریافت داده اثر می‌گذارد، تنظیمات مرورگر روی محاسبه و نمایش.</p>
    </div>
    <nav class="settings-nav" id="settings-nav"></nav>
    <div id="groups"></div>
    <div id="formulas"></div>

    <!-- پشتیبان و بازیابی. دادهٔ کاربر در سه جای مستقل زندگی می‌کند —
         دیسک سرور، حافظهٔ مرورگر، و ترجیح‌های نما — و هیچ‌کدام نسخهٔ دوم
         ندارند. موقعیت‌ها با قیمتِ ورودِ دستی از هیچ‌جا بازتولید نمی‌شوند. -->
    <section class="card" id="backup-card">
      <div class="section-head"><div><p class="eyebrow">نسخهٔ دوم</p><h3>پشتیبان و بازیابی</h3></div></div>
      <p class="note">تنظیمات و موقعیت‌ها روی دیسک سرورند، قاعده‌های دیده‌بان و بایگانی اجراها در حافظهٔ مرورگر. یک پاک‌کردن دادهٔ سایت یا یک حذف پوشهٔ data، همه‌اش را می‌برد.
        کشِ قیمت و تاریخچه در پشتیبان نمی‌آیند: از بالادست دوباره می‌آیند و بازیابی‌شان دادهٔ کهنه را روی تازه می‌نشاند.</p>
      <div class="bar" style="flex-wrap:wrap;gap:10px;margin-top:10px">
        <button class="btn sec" id="backup-save">گرفتن پشتیبان</button>
        <label class="btn sec" for="backup-file" style="cursor:pointer">انتخاب فایل پشتیبان
          <input type="file" id="backup-file" accept="application/json,.json" hidden></label>
        <span class="sp"></span>
        <span id="backup-msg" class="saved" role="status" aria-live="polite"></span>
      </div>
      <div id="backup-plan"></div>
    </section>

    <div class="bar card" style="position:sticky;bottom:12px">
      <button class="btn" id="save">ذخیره تنظیمات</button>
      <button class="btn sec" id="reset">بازگشت به پیش‌فرض</button>
      <button class="btn sec" id="clear-cache">خالی کردن کش سرور</button>
      <span class="sp"></span>
      <span id="msg" class="saved" role="status" aria-live="polite"></span>
    </div>`;

  const holder = root.querySelector('#groups');
  // سهمِ پرشدهٔ ریلِ اسلایدر. CSS نمی‌تواند نسبتِ مقدار به بازه را حساب
  // کند، پس همین یک درصد را JS می‌نشاند و بقیهٔ شکل در شیوه‌نامه می‌ماند.
  // اگر این تابع هرگز صدا نشود، ریل خالیِ سالم است نه خراب — مقدارِ
  // پیش‌فرضِ `--fill` صفر است.
  const paintRange = (r) => {
    if (!r) return;
    const min = Number(r.min);
    const max = Number(r.max);
    const value = Number(r.value);
    const share = max > min && Number.isFinite(value)
      ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
      : 0;
    r.style.setProperty('--fill', `${share}%`);
  };

  const nav = root.querySelector('#settings-nav');
  const inputs = new Map();
  const navByCard = new Map();

  for (const [key, meta] of Object.entries(GROUPS)) {
    const fields = SCHEMA.filter((f) => f.group === key);
    if (!fields.length) continue;
    const scopes = [...new Set(fields.map((f) => f.scope))];
    const card = document.createElement('section');
    card.className = 'card settings-card';
    card.id = `grp-${key}`;
    card.innerHTML = `
      <h3>${meta.title}<span class="scope">${scopes.map((x) => SCOPE_LABEL[x]).join(' + ')}</span></h3>
      ${meta.note ? `<p class="note">${meta.note}</p>` : ''}
      <div class="grid"></div>`;
    const grid = card.querySelector('.grid');

    const navBtn = document.createElement('button');
    navBtn.type = 'button';
    navBtn.className = 'chip';
    navBtn.textContent = meta.title;
    navBtn.setAttribute('aria-pressed', 'false');
    navBtn.addEventListener('click', () => card.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    nav.appendChild(navBtn);
    navByCard.set(card, navBtn);

    for (const f of fields) {
      const wrap = document.createElement('div');
      wrap.className = f.kind === 'bool' ? 'field row' : 'field';
      const id = `f-${f.key}`;
      let control;

      if (f.kind === 'bool') {
        control = `<input type="checkbox" id="${id}" ${s[f.key] ? 'checked' : ''}>
                   <label for="${id}">${f.label}</label>`;
      } else if (f.kind === 'pick') {
        control = `<label for="${id}">${f.label}</label>
          <select id="${id}">${f.options.map(([v, t]) =>
            `<option value="${v}" ${s[f.key] === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
      } else if (f.kind === 'text') {
        control = `<label for="${id}">${f.label}</label>
                   <input type="text" id="${id}" value="${s[f.key] ?? ''}">`;
      } else {
        // اسلایدر و دکمه گام به‌جای فیلد خام (خواسته پ-۵): min/max/step از
        // قبل در SCHEMA آماده است، همان دادهٔ لازم برای input[type=range].
        // فیلد عددی هم می‌ماند چون برای مقدار دقیق (مثل کارمزد با شش رقم
        // اعشار) اسلایدر به‌تنهایی کافی نیست.
        const unit = f.unit ? `<span class="unit">${f.unit}</span>` : '';
        const bounded = f.min != null && f.max != null;
        control = `<label for="${id}">${f.label} ${unit}</label>
          <div class="num-ctl">
            <button type="button" class="step-btn" data-dir="-1" tabindex="-1" aria-label="کم کردن یک گام">−</button>
            <input type="number" id="${id}" value="${s[f.key]}"
              ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''}
              step="${f.step ?? 'any'}">
            <button type="button" class="step-btn" data-dir="1" tabindex="-1" aria-label="زیاد کردن یک گام">+</button>
          </div>
          ${bounded ? `<input type="range" class="num-range" id="${id}-r" tabindex="-1"
              min="${f.min}" max="${f.max}" step="${f.step ?? (f.max - f.min) / 100}" value="${s[f.key]}">` : ''}`;
      }

      wrap.innerHTML = control + (f.hint ? `<span class="hint">${f.hint}</span>` : '');
      grid.appendChild(wrap);
      const node = wrap.querySelector(`#${id}`);
      const rangeNode = wrap.querySelector(`#${id}-r`);
      inputs.set(f.key, { field: f, node, rangeNode });
      paintRange(rangeNode);

      if (f.kind === 'num' || f.kind === 'pct') {
        const clamp = (v) => Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, v));
        node.addEventListener('input', () => {
          const v = Number(node.value);
          if (rangeNode && Number.isFinite(v)) { rangeNode.value = clamp(v); paintRange(rangeNode); }
        });
        rangeNode?.addEventListener('input', () => { node.value = rangeNode.value; paintRange(rangeNode); });
        for (const btn of wrap.querySelectorAll('.step-btn')) {
          btn.addEventListener('click', () => {
            const step = f.step || 1;
            const cur = Number(node.value) || 0;
            const next = clamp(cur + Number(btn.dataset.dir) * step);
            node.value = next;
            if (rangeNode) { rangeNode.value = next; paintRange(rangeNode); }
          });
        }
      }
    }
    holder.appendChild(card);
  }

  // ——— مرجع فرمول‌ها ———
  // پس از کنترل‌ها می‌نشیند، نه پیش از آن‌ها: کسی که برای عوض‌کردن یک عدد
  // آمده باید اول عدد را ببیند؛ کسی که برای فهمیدن آمده، تا پایین می‌آید.
  const labelOf = (k) => SCHEMA.find((f) => f.key === k)?.label || '';
  const focusKey = (k) => {
    const entry = inputs.get(k);
    if (!entry) return;
    entry.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    entry.node.focus({ preventScroll: true });
    // برجسته‌سازی کوتاه: در فرم بلند تنظیمات، پرش تنها کافی نیست تا چشم
    // بفهمد کدام کنترل مقصد بوده.
    const field = entry.node.closest('.field');
    if (!field) return;
    field.classList.remove('flash');
    void field.offsetWidth;
    field.classList.add('flash');
  };
  const fxHost = root.querySelector('#formulas');
  renderFormulas(fxHost, { labelOf, focusKey });

  const fxBtn = document.createElement('button');
  fxBtn.type = 'button';
  fxBtn.className = 'chip';
  fxBtn.textContent = 'فرمول‌ها';
  fxBtn.setAttribute('aria-pressed', 'false');
  fxBtn.addEventListener('click', () => fxHost.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  nav.appendChild(fxBtn);
  // در همان نوار پرش ثبت می‌شود تا چیپش هم مثل بقیه با اسکرول روشن شود —
  // و چون آخرین بخش صفحه است، همان چیزی است که `atBottom` باید روشن کند.
  navByCard.set(fxHost, fxBtn);

  // نوار پرش، پیشِ‌رو: چیپ کارتی که زیر نوار ایستاده روشن می‌ماند، تا در
  // فهرست بلند تنظیمات معلوم باشد الان کجای صفحه‌ای — بی‌آنکه کلیک لازم باشد.
  const cardsArr = [...navByCard.keys()];
  const setActive = (card) => {
    for (const [c, btn] of navByCard) btn.setAttribute('aria-pressed', String(c === card));
  };
  // کارت آخر («نمایش») کوتاه‌تر از نوار مشاهده است و ممکن است هیچ‌وقت
  // داخلش نیفتد؛ رسیدن واقعی به ته صفحه خودش باید چیپ آخر را روشن کند —
  // این بررسی هم در رویداد اسکرول اجرا می‌شود هم داخل خودِ IntersectionObserver،
  // چون ترتیب اجرای آن دو تضمینی نیست و هرکدام دیرتر برسد باید همین را بگوید.
  const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
  // پیش از اولین اسکرول هنوز هیچ کارتی وارد نوار مشاهده نشده، پس کارت اول
  // پیش‌فرض روشن می‌ماند.
  setActive(cardsArr[0]);
  const spy = new IntersectionObserver((entries) => {
    if (atBottom()) { setActive(cardsArr[cardsArr.length - 1]); return; }
    for (const en of entries) if (en.isIntersecting) setActive(en.target);
  }, { rootMargin: '-112px 0px -70% 0px', threshold: 0 });
  for (const card of cardsArr) spy.observe(card);
  const onScroll = () => { if (atBottom()) setActive(cardsArr[cardsArr.length - 1]); };
  window.addEventListener('scroll', onScroll, { passive: true });

  const read = () => {
    const out = {};
    for (const [key, { field, node }] of inputs) {
      out[key] = field.kind === 'bool' ? node.checked
        : field.kind === 'num' || field.kind === 'pct' ? Number(node.value)
        : node.value;
    }
    return out;
  };

  const write = (next) => {
    for (const [key, { field, node, rangeNode }] of inputs) {
      if (field.kind === 'bool') node.checked = !!next[key];
      else node.value = next[key];
      if (rangeNode) { rangeNode.value = next[key]; paintRange(rangeNode); }
    }
  };

  const msg = root.querySelector('#msg');
  let flashTimer = null;
  const flash = (t, bad = false) => {
    msg.textContent = t;
    msg.style.color = bad ? 'var(--loss)' : 'var(--gain)';
    // اگر پیام قبلی هنوز پاک نشده، تایمرش هم لغو شود — وگرنه تایمر پیام
    // کهنه‌تر این پیام تازه‌تر را زودتر از موعد پاک می‌کرد (مثلاً «بازگشت
    // به پیش‌فرض» سریع پشت‌سرِ «ذخیره تنظیمات»).
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { msg.textContent = ''; }, 2600);
  };

  const saveBtn = root.querySelector('#save');
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    try {
      const saved = await api.putSettings(read());
      write(saved);
      flash('ذخیره شد. حلقه دریافت داده از همین حالا با اعداد تازه کار می‌کند.');
    } catch (e) {
      flash(`ذخیره نشد: ${e.message}`, true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  root.querySelector('#reset').addEventListener('click', () => {
    write(defaults());
    flash('پیش‌فرض‌ها بازگشت. برای اعمال، ذخیره را بزن.');
  });

  const clearCacheBtn = root.querySelector('#clear-cache');
  clearCacheBtn.addEventListener('click', async () => {
    if (clearCacheBtn.disabled) return;
    clearCacheBtn.disabled = true;
    try {
      const r = await fetch('/api/cache', { method: 'DELETE' });
      if (!r.ok) throw new Error('خالی نشد');
      flash('کش سرور خالی شد. درخواست بعدی از بازار می‌آید.');
    } catch (e) {
      flash(`خالی نشد: ${e.message}`, true);
    } finally {
      clearCacheBtn.disabled = false;
    }
  });

  // ——————————————— پشتیبان و بازیابی ———————————————
  //
  // کلیدهای مرورگر با نام صریح نوشته می‌شوند، نه با پیمایشِ همهٔ
  // `localStorage`: پیمایشِ کور، کلیدِ هر سایتِ دیگری روی همان مبدأ و هر
  // کلیدِ موقتِ آینده را هم برمی‌دارد و در پشتیبان می‌گذارد.
  const BROWSER_KEYS = {
    watchRules: 'watchtower:rules',
    backtestRuns: 'options-radar:backtest-runs',
  };
  const PREF_PREFIX = 'options-radar:';
  // ترجیح‌های نما با پیشوند شناخته می‌شوند ولی دو کلیدِ بالا از آن جدا
  // می‌مانند تا دو بار در بسته نیایند، و کلیدِ یک‌بارمصرفِ انتقال هم نه:
  // عمرش ده دقیقه است و بازیابی‌اش بی‌معنی.
  const PREF_SKIP = new Set([BROWSER_KEYS.backtestRuns]);
  const PREF_SKIP_PREFIX = 'options-radar:handoff:';

  const backupMsg = root.querySelector('#backup-msg');
  const backupFlash = (text, bad = false) => {
    backupMsg.textContent = text;
    backupMsg.style.color = bad ? 'var(--loss)' : 'var(--gain)';
  };
  const ls = () => { try { return window.localStorage; } catch { return null; } };
  const readJson = (key, fallback) => {
    const store = ls();
    if (!store) return fallback;
    try { return JSON.parse(store.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
  };
  const readPrefs = () => {
    const store = ls();
    if (!store) return {};
    const out = {};
    for (let at = 0; at < store.length; at += 1) {
      const key = store.key(at);
      if (!key?.startsWith(PREF_PREFIX)) continue;
      if (PREF_SKIP.has(key) || key.startsWith(PREF_SKIP_PREFIX)) continue;
      out[key] = store.getItem(key);
    }
    return out;
  };

  const currentParts = () => ({
    settings: read(),
    positions: null,
    watchRules: readJson(BROWSER_KEYS.watchRules, []),
    backtestRuns: readJson(BROWSER_KEYS.backtestRuns, []),
    preferences: readPrefs(),
  });

  root.querySelector('#backup-save').addEventListener('click', async () => {
    let positions = null;
    try { positions = await (await fetch('/api/positions')).json(); }
    catch { positions = null; }
    const bundle = buildBackup({ ...currentParts(), positions, at: Date.now() });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `options-radar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    const parts = BACKUP_PARTS.filter((part) => bundle[part.key] != null).map((part) => part.label);
    backupFlash(parts.length ? `پشتیبان گرفته شد: ${parts.join('، ')}.` : 'چیزی برای پشتیبان‌گیری نبود.');
  });

  root.querySelector('#backup-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    let parsed = null;
    try { parsed = JSON.parse(await file.text()); }
    catch (error) { backupFlash(`فایل خوانده نشد: ${error.message}`, true); return; }
    const checked = readBackup(parsed);
    if (!checked.ok) { backupFlash(checked.why, true); root.querySelector('#backup-plan').innerHTML = ''; return; }

    // بازیابی جایگزینی است نه ادغام، پس تأیید باید عددِ واقعی بگوید.
    let positions = [];
    try { positions = await (await fetch('/api/positions')).json(); } catch { positions = []; }
    const plan = restorePlan(checked.bundle, { ...currentParts(), positions });
    root.querySelector('#backup-plan').innerHTML = `
      <table class="mini" style="margin-top:10px">
        <thead><tr><th>بخش</th><th>الان</th><th>پس از بازیابی</th></tr></thead>
        <tbody>${plan.map((row) => `<tr><td>${esc(row.label)}</td>
          <td class="n">${fmt.int(row.from)}</td><td class="n">${fmt.int(row.to)}</td></tr>`).join('')}</tbody>
      </table>
      <p class="note">بازیابی <b>جایگزینی</b> است، نه ادغام: ادغام یعنی تصمیم دربارهٔ رکوردی که در هر دو هست ولی فرق دارد، و هر تصمیمی آنجا می‌تواند قیمت ورود واقعی را با نسخهٔ کهنه عوض کند.</p>`;

    const what = plan.map((row) => `${row.label}: ${faDigits(row.from)} ← ${faDigits(row.to)}`).join('\n');
    if (!confirm(`این بخش‌ها جایگزین می‌شوند و بازگشتی ندارند:\n\n${what}\n\nادامه؟`)) {
      backupFlash('بازیابی انجام نشد.');
      return;
    }
    const done = [];
    const failed = [];
    if (checked.bundle.settings) {
      try { write(await api.putSettings(checked.bundle.settings)); done.push('تنظیمات'); }
      catch (error) { failed.push(`تنظیمات (${error.message})`); }
    }
    if (checked.bundle.positions) {
      try {
        const response = await fetch('/api/positions', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(checked.bundle.positions),
        });
        if (!response.ok) throw new Error('سرور نپذیرفت');
        done.push('موقعیت‌ها');
      } catch (error) { failed.push(`موقعیت‌ها (${error.message})`); }
    }
    const store = ls();
    if (store) {
      try {
        if (checked.bundle.watchRules) {
          store.setItem(BROWSER_KEYS.watchRules, JSON.stringify(checked.bundle.watchRules));
          done.push('قاعده‌های دیده‌بان');
        }
        if (checked.bundle.backtestRuns) {
          store.setItem(BROWSER_KEYS.backtestRuns, JSON.stringify(checked.bundle.backtestRuns));
          done.push('بایگانی اجراها');
        }
        for (const [key, value] of Object.entries(checked.bundle.preferences || {})) store.setItem(key, value);
        if (checked.bundle.preferences) done.push('ترجیح‌های نما');
      } catch (error) { failed.push(`حافظهٔ مرورگر (${error.message})`); }
    } else if (checked.bundle.watchRules || checked.bundle.backtestRuns || checked.bundle.preferences) {
      failed.push('حافظهٔ مرورگر در دسترس نیست');
    }
    // شکستِ نیمه پنهان نمی‌شود: بخشی که ننشسته باید نام ببرد، وگرنه کاربر
    // فکر می‌کند همه‌چیز برگشته.
    backupFlash(
      failed.length
        ? `بازیابی ناقص — انجام‌شده: ${done.join('، ') || 'هیچ'} · نشد: ${failed.join('، ')}`
        : `بازیابی شد: ${done.join('، ')}. برای اثر کامل، صفحه را تازه کن.`,
      failed.length > 0,
    );
  });

  return () => { spy.disconnect(); window.removeEventListener('scroll', onScroll); clearTimeout(flashTimer); };
}
