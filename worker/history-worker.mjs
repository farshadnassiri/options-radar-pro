// محاسبات سنگین تحلیل تاریخی بیرون از نخ رابط کاربری.

import { CATALOG, GROUPS, byId } from '../strategies/catalog.mjs';
import { contractCensus, generateHistoricalCombos, historyPrice, normalizeHistoryDate, replayHistory, rollingEntryMatrix } from '../core/history.mjs';
import { summarizePortfolio } from '../core/portfolio.mjs';
import { buildPnlMatrix } from '../core/portfolio-matrix.mjs';
import { applyIntradayMark, marksAt } from '../core/intraday-mark.mjs';
import { momentKey, momentsFor } from '../core/intraday-grid.mjs';

self.onmessage = (event) => {
  const m = event.data;
  try {
    if (m.type === 'combos') {
      const def = byId(m.defId);
      if (!def) throw new Error('استراتژی ناشناخته است');
      const generated = generateHistoricalCombos({
        def, ua: m.ua, seriesByIns: m.seriesByIns, startDate: m.startDate,
        entryBasis: m.entryBasis, settings: m.settings, filtered: m.filtered,
        liquidity: m.liquidity,
      });
      const rows = [];
      for (let i = 0; i < generated.combos.length; i++) {
        const combo = generated.combos[i];
        const replay = replayHistory({
          legs: combo.legs, seriesByIns: m.seriesByIns, baseIns: combo.uaIns,
          startDate: m.startDate, endDate: m.endDate,
          entryBasis: m.entryBasis, exitBasis: m.exitBasis,
          units: m.units, fees: m.fees, settings: m.settings, liquidity: m.liquidity,
        });
        if (replay.ok) {
          rows.push({
            id: combo.id, legs: combo.legs, strikes: combo.strikes, expiries: combo.expiries,
            spot: combo.spot, summary: replay.summary,
            entry: { gross: replay.entry.gross, fee: replay.entry.fee, netCash: replay.entry.netCash,
              cashPaid: replay.entry.cashPaid, cashReceived: replay.entry.cashReceived,
              cashNetGross: replay.entry.cashNetGross,
              capital: replay.entry.capital, margin: replay.entry.margin,
              baseMarket: replay.entry.baseMarket,
              legsMarket: replay.priced.map((l) => ({
                volume: l.entryVolume, trades: l.entryTrades,
                value: l.entryValue, valueEstimated: l.entryValueEstimated,
              })) },
          });
        }
        if (i > 0 && i % 50 === 0) {
          self.postMessage({ type: 'progress', id: m.id, done: i, total: generated.combos.length });
        }
      }
      self.postMessage({
        type: 'combos', id: m.id, rows,
        generated: { built: generated.built, noEntry: generated.noEntry,
          noLiquidity: generated.noLiquidity, capped: generated.capped },
      });
      return;
    }

    if (m.type === 'rolling') {
      const result = rollingEntryMatrix(m.args);
      self.postMessage({ type: 'rolling', id: m.id, result });
      return;
    }

    /**
     * همان ترکیب‌های پذیرفته‌شده، ولی لحظه‌به‌لحظهٔ روز سنجش.
     *
     * ترکیب‌ها از نو ساخته نمی‌شوند — همان‌هایی‌اند که اجرای روزانه پذیرفت.
     * دلیلش صرفاً سرعت نیست: اگر در هر لحظه از نو غربال می‌شد، فهرست
     * استراتژی‌ها بین دو ستون فرق می‌کرد و نقشهٔ حرارتی ستون‌هایی با
     * جمعیت‌های متفاوت نشان می‌داد — چیزی که هیچ‌کس نمی‌تواند بخواند.
     *
     * روزهای پیش از روز سنجش دست‌نخورده‌اند؛ فقط قیمت خروج عوض می‌شود.
     */
    if (m.type === 'portfolio-intraday') {
      const moments = momentsFor(m.grain);
      const rows = [];
      const columns = [];
      let priced = 0;
      for (let index = 0; index < moments.length; index++) {
        const second = moments[index];
        const marked = applyIntradayMark(m.seriesByIns, marksAt(m.tape, second), { date: m.endDate, second });
        columns.push({ key: momentKey(m.endDate, second), second, marked: marked.marked, dropped: marked.dropped });
        if (!marked.marked) {
          self.postMessage({ type: 'portfolio-intraday-progress', id: m.id, done: index + 1, total: moments.length, priced });
          continue;
        }
        for (const combo of m.combos) {
          const replay = replayHistory({
            legs: combo.legs, seriesByIns: marked.series, baseIns: String(m.ua.ins),
            startDate: m.startDate, endDate: m.endDate,
            entryBasis: m.entryBasis, exitBasis: m.exitBasis,
            units: m.units, fees: m.fees, settings: m.settings, liquidity: m.liquidity,
          });
          if (!replay.ok) continue;
          const final = replay.rows.find((row) => row.date === Number(m.endDate));
          if (!final || final.status !== 'ok' || !Number.isFinite(final.netPnl)) continue;
          rows.push({ comboId: combo.id, key: momentKey(m.endDate, second), netPnl: final.netPnl });
          priced += 1;
        }
        self.postMessage({ type: 'portfolio-intraday-progress', id: m.id, done: index + 1, total: moments.length, priced });
      }
      self.postMessage({ type: 'portfolio-intraday', id: m.id, columns, rows, moments: moments.length });
      return;
    }

    if (m.type === 'portfolio') {
      const definitions = CATALOG.filter((def) => m.includeInfeasible || def.feasible);
      const rows = [];
      const generatedByStrategy = [];
      let invalidAtEnd = 0, replayErrors = 0;
      const settings = {
        ...m.settings,
        maxRows: Math.max(1, Math.trunc(Number(m.maxPerStrategy) || 120)),
        maxCombosPerExpiry: Math.max(1, Math.trunc(Number(m.maxPerStrategy) || 120)),
      };
      for (let strategyIndex = 0; strategyIndex < definitions.length; strategyIndex++) {
        const def = definitions[strategyIndex];
        const generated = generateHistoricalCombos({
          def, ua: m.ua, seriesByIns: m.seriesByIns, startDate: m.startDate,
          entryBasis: m.entryBasis, settings, filtered: m.filtered,
          liquidity: m.liquidity,
        });
        let accepted = 0;
        for (const combo of generated.combos) {
          const replay = replayHistory({
            legs: combo.legs, seriesByIns: m.seriesByIns, baseIns: combo.uaIns,
            startDate: m.startDate, endDate: m.endDate,
            entryBasis: m.entryBasis, exitBasis: m.exitBasis,
            units: m.units, fees: m.fees, settings: m.settings, liquidity: m.liquidity,
          });
          if (!replay.ok) { replayErrors += 1; continue; }
          const final = replay.rows.find((row) => row.date === Number(m.endDate));
          if (!final || final.status !== 'ok' || !Number.isFinite(final.netPnl) || !Number.isFinite(final.returnPct)) {
            invalidAtEnd += 1;
            continue;
          }
          accepted += 1;
          rows.push({
            id: `${def.id}:${combo.id}`,
            strategyId: def.id, strategyName: def.name,
            groupId: def.group, groupName: GROUPS[def.group] || def.group,
            direction: def.dir, feasible: def.feasible !== false,
            comboId: combo.id, legs: combo.legs, strikes: combo.strikes, expiries: combo.expiries,
            entry: {
              gross: replay.entry.gross, fee: replay.entry.fee, netCash: replay.entry.netCash,
              capital: replay.entry.capital?.value, capitalLabel: replay.entry.capital?.label,
              margin: replay.entry.margin?.marginNet,
              // اجزای مخرج، خام و جدا. رابط با همین‌ها هر مبنای بازدهی را
              // بدون اجرای دوباره بازمی‌سازد؛ اگر فقط درصدِ یک مبنا حمل
              // می‌شد، عوض‌کردن مبنا یعنی چند دقیقه اجرای دوباره.
              marginGross: replay.entry.margin?.margin,
              marginNet: replay.entry.margin?.marginNet,
              notional: replay.entry.notional, spot: replay.entry.spot,
              maxLoss: Number.isFinite(replay.entry.payoff?.maxLoss) ? replay.entry.payoff.maxLoss : null,
              maxProfit: Number.isFinite(replay.entry.payoff?.maxProfit) ? replay.entry.payoff.maxProfit : null,
              // شمار واحدی که این عددها بر آن بسته شده‌اند.
              //
              // بی این عدد، «مخرج» یک جعبهٔ بستهٔ N واحدی است و سبد فرضی
              // فقط می‌تواند بستهٔ کامل بخرد — با ۳۰۰ واحد، ۴ میلیارد
              // بودجه تنها سه بسته می‌خرد و ۸۷۱ میلیون بی‌کار می‌ماند.
              // وجه تضمین در این موتور دقیقاً خطیِ تعداد است، پس بهای هر
              // واحد از تقسیم بر همین عدد به‌دست می‌آید.
              units: Number.isFinite(m.units) && m.units > 0 ? m.units : 1,
              // ارزش معاملهٔ روز ورودِ پاها — پایهٔ وزن‌دهی بر ارزش معامله.
              legValue: replay.priced.reduce((sum, leg) => sum
                + (Number.isFinite(leg.entryValue) ? leg.entryValue : 0), 0),
              legValueComplete: replay.priced.every((leg) => Number.isFinite(leg.entryValue)),
            },
            final: {
              date: final.date, netPnl: final.netPnl, grossPnl: final.grossPnl,
              returnPct: final.returnPct, baseCumulativePct: final.baseCumulativePct,
              totalFees: final.totalFees, drawdown: final.drawdown,
            },
            path: {
              validDays: replay.summary.validDays,
              daily: replay.rows.filter((row) => row.status === 'ok'
                && Number.isFinite(row.netPnl) && Number.isFinite(row.returnPct)).map((row) => ({
                date: row.date, netPnl: row.netPnl, returnPct: row.returnPct,
              })),
              firstProfit: replay.summary.firstProfit ? {
                date: replay.summary.firstProfit.date,
                holdingDays: replay.summary.firstProfit.holdingDays,
                netPnl: replay.summary.firstProfit.netPnl,
                returnPct: replay.summary.firstProfit.returnPct,
              } : null,
              best: replay.summary.best ? { date: replay.summary.best.date, netPnl: replay.summary.best.netPnl, returnPct: replay.summary.best.returnPct } : null,
              worst: replay.summary.worst ? { date: replay.summary.worst.date, netPnl: replay.summary.worst.netPnl, returnPct: replay.summary.worst.returnPct } : null,
              maxDrawdown: replay.summary.maxDrawdown,
            },
          });
        }
        generatedByStrategy.push({
          strategyId: def.id, strategyName: def.name,
          built: generated.built, candidates: generated.combos.length, accepted,
          noEntry: generated.noEntry, noLiquidity: generated.noLiquidity,
          outOfWindow: generated.outOfWindow, noPriceStrikes: generated.noPriceStrikes,
          capped: generated.capped,
        });
        self.postMessage({
          type: 'portfolio-progress', id: m.id,
          done: strategyIndex + 1, total: definitions.length,
          strategyName: def.name, results: rows.length,
        });
      }
      // سرشماری قرارداد، یک بار برای کل جاروب. عددِ ترکیب بدون این عدد
      // قابل قضاوت نیست: «شش استرانگل» می‌تواند نتیجهٔ درستِ پانزده
      // قرارداد باشد یا نتیجهٔ غلطِ دفتری که هفتاد قرارداد داشت و نداد.
      const census = contractCensus({
        ua: m.ua, seriesByIns: m.seriesByIns, startDate: m.startDate,
        entryBasis: m.entryBasis, settings, liquidity: m.liquidity,
      });
      const report = summarizePortfolio(rows);
      // ماتریس پیش از پاک‌کردن فهرست روزانه ساخته می‌شود. از این به بعد
      // رابط با همین ماتریس کار می‌کند: مبنا، آماره، بازه و وزن، همه
      // لحظه‌ای و بدون اجرای دوباره.
      const matrix = buildPnlMatrix(rows);
      // مسیر خودِ نماد پایه روی همان ستون‌ها، تا نمودار روند بتواند «این
      // استراتژی نسبت به نگه‌داشتن خود سهم چه کرد» را نشان دهد. روزی که
      // قیمت پایانی ندارد `null` می‌ماند.
      const baseRows = new Map((m.seriesByIns?.[String(m.ua?.ins)] || [])
        .map((row) => [normalizeHistoryDate(row.date), row]));
      const startClose = historyPrice(baseRows.get(Number(m.startDate)), 'CLOSE');
      const baseSeries = matrix.dates.map((date) => {
        const close = historyPrice(baseRows.get(date), 'CLOSE');
        return Number.isFinite(close) && close > 0 && Number.isFinite(startClose) && startClose > 0
          ? ((close / startClose) - 1) * 100 : null;
      });
      for (const row of rows) delete row.path.daily;
      self.postMessage({
        type: 'portfolio', id: m.id, rows,
        report, generatedByStrategy, census,
        matrix: { dates: matrix.dates, pnl: matrix.pnl, rowCount: matrix.rowCount, baseSeries },
        excluded: { invalidAtEnd, replayErrors },
      }, [matrix.pnl.buffer]);
      return;
    }
  } catch (error) {
    self.postMessage({ type: 'error', id: m.id, error: String(error?.message || error) });
  }
};
