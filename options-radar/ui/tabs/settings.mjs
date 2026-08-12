// تب تنظیمات.
//
// فرم از SCHEMA ساخته می‌شود، نه دستی. پس اگر عددی به موتور اضافه شد و
// اینجا کنترلی ندارد، یعنی در SCHEMA ثبت نشده — و همین، جلوی سخت‌کد شدن
// اعداد در کد را می‌گیرد.

import { SCHEMA, GROUPS, defaults } from '/core/settings.mjs';

const SCOPE_LABEL = { server: 'سرور', client: 'مرورگر', both: 'هر دو' };

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
    <div id="groups"></div>
    <div class="bar card" style="position:sticky;bottom:12px">
      <button class="btn" id="save">ذخیره تنظیمات</button>
      <button class="btn sec" id="reset">بازگشت به پیش‌فرض</button>
      <button class="btn sec" id="clear-cache">خالی کردن کش سرور</button>
      <span class="sp"></span>
      <span id="msg" class="saved"></span>
    </div>`;

  const holder = root.querySelector('#groups');
  const inputs = new Map();

  for (const [key, meta] of Object.entries(GROUPS)) {
    const fields = SCHEMA.filter((f) => f.group === key);
    if (!fields.length) continue;
    const scopes = [...new Set(fields.map((f) => f.scope))];
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `
      <h3>${meta.title}<span class="scope">${scopes.map((x) => SCOPE_LABEL[x]).join(' + ')}</span></h3>
      ${meta.note ? `<p class="note">${meta.note}</p>` : ''}
      <div class="grid"></div>`;
    const grid = card.querySelector('.grid');

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
        const unit = f.unit ? `<span class="unit">${f.unit}</span>` : '';
        control = `<label for="${id}">${f.label} ${unit}</label>
          <input type="number" id="${id}" value="${s[f.key]}"
            ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''}
            step="${f.step ?? 'any'}">`;
      }

      wrap.innerHTML = control + (f.hint ? `<span class="hint">${f.hint}</span>` : '');
      grid.appendChild(wrap);
      inputs.set(f.key, { field: f, node: wrap.querySelector(`#${id}`) });
    }
    holder.appendChild(card);
  }

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
    for (const [key, { field, node }] of inputs) {
      if (field.kind === 'bool') node.checked = !!next[key];
      else node.value = next[key];
    }
  };

  const msg = root.querySelector('#msg');
  const flash = (t, bad = false) => {
    msg.textContent = t;
    msg.style.color = bad ? 'var(--loss)' : 'var(--gain)';
    setTimeout(() => { msg.textContent = ''; }, 2600);
  };

  root.querySelector('#save').addEventListener('click', async () => {
    try {
      const saved = await api.putSettings(read());
      write(saved);
      flash('ذخیره شد. حلقه دریافت داده از همین حالا با اعداد تازه کار می‌کند.');
    } catch (e) {
      flash(`ذخیره نشد: ${e.message}`, true);
    }
  });

  root.querySelector('#reset').addEventListener('click', () => {
    write(defaults());
    flash('پیش‌فرض‌ها بازگشت. برای اعمال، ذخیره را بزن.');
  });

  root.querySelector('#clear-cache').addEventListener('click', async () => {
    await fetch('/api/cache', { method: 'DELETE' });
    flash('کش سرور خالی شد. درخواست بعدی از بازار می‌آید.');
  });

  return () => {};
}
