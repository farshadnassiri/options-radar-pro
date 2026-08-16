// محاسبات سنگین تحلیل تاریخی بیرون از نخ رابط کاربری.

import { CATALOG, GROUPS, byId } from '../strategies/catalog.mjs';
import { generateHistoricalCombos, replayHistory, rollingEntryMatrix } from '../core/history.mjs';
import { summarizePortfolio } from '../core/portfolio.mjs';

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
            },
            final: {
              date: final.date, netPnl: final.netPnl, grossPnl: final.grossPnl,
              returnPct: final.returnPct, baseCumulativePct: final.baseCumulativePct,
              totalFees: final.totalFees, drawdown: final.drawdown,
            },
            path: {
              validDays: replay.summary.validDays,
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
          noEntry: generated.noEntry, noLiquidity: generated.noLiquidity, capped: generated.capped,
        });
        self.postMessage({
          type: 'portfolio-progress', id: m.id,
          done: strategyIndex + 1, total: definitions.length,
          strategyName: def.name, results: rows.length,
        });
      }
      self.postMessage({
        type: 'portfolio', id: m.id, rows,
        report: summarizePortfolio(rows), generatedByStrategy,
        excluded: { invalidAtEnd, replayErrors },
      });
      return;
    }
  } catch (error) {
    self.postMessage({ type: 'error', id: m.id, error: String(error?.message || error) });
  }
};
