// ۲۴۵. نقشهٔ بازار و مسیر پایه ← سررسید ← قرارداد

import { check, near, group, readSrc } from '../harness.mjs';
import {
  MARKET_MAP_METRICS, marketMapRows, marketMapSummary,
} from '../../core/decision-dashboard.mjs';

group('۲۴۵. نقشهٔ بازار و کاوش زنجیره');

const universe245 = {
  underlyings: [
    { ins: '11', name: 'اهرم', changePct: 2.5, callValue: 700, putValue: 300, value: 1000, uaValue: 5000, volume: 90, oi: 400 },
    { ins: '22', name: 'توان', changePct: -1.2, callValue: 0, putValue: 0, value: 0, uaValue: 0, volume: 0, oi: 0 },
  ],
  contracts: [
    { ins: '111', uaIns: '11', value: 700, volume: 60, trades: 4, oi: 250, bid: 10, ask: 12 },
    { ins: '112', uaIns: '11', value: 300, volume: 30, trades: 2, oi: 150, bid: 0, ask: 8 },
    { ins: '221', uaIns: '22', value: 0, volume: 0, trades: 0, oi: 0, bid: 0, ask: 0 },
  ],
};

check('شش مبنای درخواستی نقشه در قرارداد داده وجود دارد',
  ['callValue', 'putValue', 'value', 'uaValue', 'volume', 'changePct'].every((key) => MARKET_MAP_METRICS.some((item) => item.key === key)));

const valueMap245 = marketMapRows(universe245, 'value');
check('نماد بدون معامله از نقشه حذف نمی‌شود و خانه قابل‌کلیک می‌ماند',
  valueMap245.length === 2 && valueMap245[1].metricValue === 0 && valueMap245[1].mapWeight > 0);
const changeMap245 = marketMapRows(universe245, 'changePct');
check('اندازه در مبنای تغییر از قدرمطلق می‌آید ولی علامت اصلی حفظ می‌شود',
  near(changeMap245[1].sizeValue, 1.2) && changeMap245[1].metricValue === -1.2);

const summary245 = marketMapSummary(universe245);
check('جمع‌بندی بازار، ارزش کال و پوت و خود پایه را قاطی نمی‌کند',
  summary245.callValue === 700 && summary245.putValue === 300
  && summary245.optionValue === 1000 && summary245.underlyingValue === 5000);
check('قرارداد معامله‌شده و مظنه دوطرفه از خود قرارداد شمرده می‌شوند',
  summary245.tradedContracts === 2 && summary245.twoSided === 1 && summary245.contracts === 3);

const mapUi245 = readSrc('../ui/live-market-map.mjs');
const dashboard245 = readSrc('../ui/tabs/live-market-dashboard.mjs');
check('نقشه بین پایه‌ها و قراردادهای نماد انتخابی جابه‌جا می‌شود',
  mapUi245.includes('data-lmm-map-mode="underlyings"')
  && mapUi245.includes('data-lmm-map-mode="contracts"')
  && mapUi245.includes('selectContractFromMap'));
check('انتخاب سررسید، بازه واقعی روزانه را دسته‌ای می‌گیرد و عدد گمشده نمی‌سازد',
  mapUi245.includes('/api/infos?ins=')
  && mapUi245.includes('Number(row.first) > 0')
  && mapUi245.includes('Number(row.low) > 0')
  && mapUi245.includes('Number(row.high) > 0'));
check('نمودار بازه، هر پنج قیمت و سه مبنای مرتب‌سازی را دارد',
  ['کمینه', 'اولین', 'آخرین', 'پایانی', 'بیشینه'].every((label) => mapUi245.includes(label))
  && ['value', 'volume', 'oi'].every((key) => mapUi245.includes(`'${key}'`)));
check('بازه امروز به کندل تعاملی تبدیل شده و درصد آخرین و پایانی را جدا نشان می‌دهد',
  mapUi245.includes('کندل قیمت امروز قراردادها') && mapUi245.includes("addEventListener('pointermove'")
  && mapUi245.includes('آخرین ${fmt.pct(lastPct)}٪') && mapUi245.includes('پایانی ${fmt.pct(closePct)}٪'));
check('زنجیره از کاتالوگ ستون مشترک استفاده می‌کند و انتخاب قرارداد دارد',
  mapUi245.includes('contractColumns.filter') && mapUi245.includes('onPick: (row) => selectContract(row.ins)')
  && dashboard245.includes('contractColumns: COLS_CONTRACT'));
check('نقشه نمای اصلی است و همه نماهای قبلی پشت بخش تکمیلی حفظ شده‌اند',
  dashboard245.indexOf('id="dd-market-explorer"') < dashboard245.indexOf('class="decision-advanced"')
  && dashboard245.includes('DASHBOARD_MODES.map') && dashboard245.includes('mountLiveMarketMap'));
