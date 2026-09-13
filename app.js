'use strict';

/* ============================================================================
 *  Бартер-дашборд: поставка минеральной ваты ⇄ квартиры застройщика
 *  Три экрана: 1) Показатели  2) Исходные данные  3) Факт
 * ========================================================================== */

const STORAGE_KEY = 'barter.dashboard.v3';   // v3: три экрана, зачёт в м², годовая доходность
const THEME_KEY = 'barter.theme';
const SCREEN_KEY = 'barter.screen';

/* ------------------------------ Регион: Казахстан ------------------------- */
const CURRENCY = '₸';      // тенге (KZT)
const PER_M3 = ' ₸/м³';
const PER_M2 = ' ₸/м²';
const VAT_RATE_DEFAULT = 16;   // стандартная ставка НДС в Республике Казахстан
const CIT_RATE_DEFAULT = 20;   // корпоративный подоходный налог (КПН)
const MONTHS_MAX = 24;         // верхняя граница срока продажи квартир, мес

/* ------------------------------- Значения по умолчанию -------------------- */
const DEFAULTS = {
  /* Экран 1 — параметры сделки */
  volume: 1000,          // м³ ваты в поставке
  areaM2: 62745,         // м² квартир к зачёту (пересчитывается от объёма)
  areaDriven: false,     // true — последним меняли метры, а не объём
  saleMonths: 12,        // срок продажи квартир, мес
  /* Экран 2 — завод */
  pricePerM3: 24000,     // базовая (прайсовая) цена ваты, ₸/м³ без НДС
  rawPerM3: 8500,
  salaryPerM3: 4000,
  insuranceRate: 12,
  energyPerM3: 2400,
  overheadPerM3: 1800,
  inputVat: 0,           // НДС к вычету, ₸
  /* Экран 2 — застройщик */
  pricePerM2: 450000,    // розничная цена 1 м² квартиры, ₸/м²
  developerDiscount: 15, // скидка по договору, %
  /* Экран 2 — продажа квартир */
  quickSaleDiscount: 8,
  realtorFee: 2,
  otherExpenses: 1,
  /* Экран 2 — общие */
  vatRate: VAT_RATE_DEFAULT,
  vatEnabled: true,
  profitTaxRate: CIT_RATE_DEFAULT,
  annualReturn: 18,      // альтернативная доходность, % годовых
  /* Экран 3 — факт */
  factRevenue: 0,
  factQuickSaleLoss: 0,
  factRealtorFee: 0,
  factOtherExpenses: 0,
  factVat: 0,
  factTimeLoss: 0,
  factCost: 0,
  factCit: 0
};

const PRESETS = {
  cautious: { developerDiscount: 25, quickSaleDiscount: 15, realtorFee: 3, otherExpenses: 2, saleMonths: 18, annualReturn: 24 },
  base: {},
  optimistic: { developerDiscount: 10, quickSaleDiscount: 5, realtorFee: 1.5, otherExpenses: 0.5, saleMonths: 6, annualReturn: 12 }
};

/* ------------------------------- Схема формы ------------------------------ */
const money = (v) => nf0.format(Math.round(v || 0)) + ' ' + CURRENCY;

const SECTIONS = [
  {
    id: 'general', icon: '⚖️', title: 'Общие', desc: 'Налоги и стоимость денег',
    fields: [
      { key: 'vatRate', label: 'Ставка НДС', unit: '%', min: 0, max: 100 },
      { key: 'profitTaxRate', label: 'КПН (налог на прибыль)', unit: '%', min: 0, max: 100 },
      { key: 'annualReturn', label: 'Доходность альтернативы', unit: '% в год', min: 0, max: 100, full: true },
      { key: 'vatEnabled', type: 'checkbox', label: 'Использовать НДС в расчётах', hint: 'НДС берётся от выручки: выручка × ставка / (100 + ставка)' }
    ],
    summary: (m) => [
      ['НДС к уплате', money(m.vatPayable)],
      ['КПН к уплате', money(m.profitTax)]
    ]
  },
  {
    id: 'plant', icon: '🏭', title: 'Завод', desc: 'Цена ваты и себестоимость 1 м³',
    fields: [
      { key: 'pricePerM3', label: 'Базовая цена ваты по прайсу', unit: '₸/м³', min: 0, full: true },
      { key: 'rawPerM3', label: 'Сырьё', unit: '₸/м³', min: 0 },
      { key: 'salaryPerM3', label: 'ФОТ (зарплата)', unit: '₸/м³', min: 0 },
      { key: 'insuranceRate', label: 'Соцплатежи', unit: '% от ФОТ', min: 0, max: 100 },
      { key: 'energyPerM3', label: 'Энергия', unit: '₸/м³', min: 0 },
      { key: 'overheadPerM3', label: 'Накладные', unit: '₸/м³', min: 0 },
      { key: 'inputVat', label: 'НДС к вычету', unit: '₸', min: 0 }
    ],
    summary: (m) => [
      ['Себестоимость 1 м³', money(m.unitCost)],
      ['На весь объём', money(m.costTotal)]
    ]
  },
  {
    id: 'developer', icon: '🏙️', title: 'Застройщик', desc: 'Цена квартир и скидка по договору',
    fields: [
      { key: 'pricePerM2', label: 'Цена 1 м² (розница)', unit: '₸/м²', min: 0 },
      { key: 'developerDiscount', label: 'Скидка застройщика', unit: '%', min: 0, max: 100 }
    ],
    summary: (m) => [
      ['Цена зачёта 1 м²', money(m.priceM2Offset)],
      ['Кв. м к зачёту', nf1.format(m.areaM2) + ' м²']
    ]
  },
  {
    id: 'sale', icon: '💸', title: 'Продажа квартир', desc: 'Издержки монетизации объектов',
    fields: [
      { key: 'quickSaleDiscount', label: 'Скидка быстрой продажи', unit: '%', min: 0, max: 100 },
      { key: 'realtorFee', label: 'Комиссия риелтора', unit: '%', min: 0, max: 100 },
      { key: 'otherExpenses', label: 'Прочие расходы', unit: '%', min: 0, max: 100 }
    ],
    summary: (m) => [
      ['Издержки продажи', money(m.saleCosts)],
      ['Выручка от продажи', money(m.revenue)]
    ]
  }
];

/* ------------------------------- Форматирование --------------------------- */
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const nfShort = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

const fmtShort = (v) => nfShort.format(v || 0) + ' ' + CURRENCY;
const pct = (frac, d = 1) => (isFinite(frac) ? (frac * 100).toFixed(d).replace('.', ',') : '0,0') + '%';
const signedPct = (frac, d = 1) => (frac >= 0 ? '+' : '−') + Math.abs(frac * 100).toFixed(d).replace('.', ',') + '%';
const signedMoney = (v) => (v >= 0 ? '+' : '−') + nf0.format(Math.round(Math.abs(v || 0))) + ' ' + CURRENCY;
const fmtInput = (v) => nf2.format(typeof v === 'number' ? v : 0);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const round2 = (v) => Math.round(v * 100) / 100;

/* Связка «объём ваты ⇄ метры квартир к зачёту».
 * Баланс взаимозачёта равен нулю по построению:
 *   объём × прайс ваты = метры × цена метра × (1 − скидка застройщика)
 * Ввод в любое из двух полей пересчитывает второе. */
function areaFromVolume(volume, s) {
  const denom = Math.max(0, num(s.pricePerM2)) * (1 - clamp(num(s.developerDiscount), 0, 99.9) / 100);
  return denom > 0 ? (Math.max(0, num(volume)) * Math.max(0, num(s.pricePerM3))) / denom : 0;
}

function volumeFromArea(area, s) {
  const price = Math.max(0, num(s.pricePerM3));
  const numen = Math.max(0, num(area)) * Math.max(0, num(s.pricePerM2)) * (1 - clamp(num(s.developerDiscount), 0, 99.9) / 100);
  return price > 0 ? numen / price : 0;
}

/* Пересчитывает зависимую сторону сделки (ту, которую пользователь не трогал) */
function syncDeal() {
  if (state.areaDriven) {
    state.volume = round2(volumeFromArea(num(state.areaM2), state));
  } else {
    state.areaM2 = round2(areaFromVolume(num(state.volume), state));
  }
}

/* ------------------------------- Состояние -------------------------------- */
function loadState() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch (e) { stored = {}; }

  const s = {};
  Object.keys(DEFAULTS).forEach((k) => {
    const def = DEFAULTS[k];
    const raw = stored[k];
    if (typeof def === 'boolean') {
      s[k] = typeof raw === 'boolean' ? raw : def;
    } else {
      const n = typeof raw === 'string' ? parseFloat(raw.replace(',', '.')) : raw;
      s[k] = typeof n === 'number' && isFinite(n) ? n : def;
    }
  });
  return s;
}

let state = loadState();
let saveTimer = null;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* noop */ }
  }, 300);
}

/* ============================================================================
 *  ФИНАНСОВАЯ МОДЕЛЬ
 * ========================================================================== */
function calc(s) {
  /* 1. Взаимозачёт: объём ваты по прайсу ⇄ метры квартир со скидкой застройщика */
  const volume = Math.max(0, num(s.volume));
  const price = Math.max(0, num(s.pricePerM3));
  const priceM2 = Math.max(0, num(s.pricePerM2));
  const devDiscount = clamp(num(s.developerDiscount), 0, 100) / 100;
  const dealSum = volume * price;                                                 // сумма сделки, без НДС
  const retailTotal = devDiscount < 1 ? dealSum / (1 - devDiscount) : dealSum;    // номинал квартир
  const developerDiscountSum = retailTotal - dealSum;
  const areaM2 = priceM2 > 0 ? retailTotal / priceM2 : 0;
  const priceM2Offset = priceM2 * (1 - devDiscount);

  /* 2. Производственная себестоимость */
  const unitCost =
    Math.max(0, num(s.rawPerM3)) +
    Math.max(0, num(s.salaryPerM3)) * (1 + Math.max(0, num(s.insuranceRate)) / 100) +
    Math.max(0, num(s.energyPerM3)) +
    Math.max(0, num(s.overheadPerM3));
  const costTotal = unitCost * volume;

  /* 3. Монетизация квартир */
  const q = clamp(num(s.quickSaleDiscount), 0, 100) / 100;
  const c = clamp(num(s.realtorFee), 0, 100) / 100;
  const o = clamp(num(s.otherExpenses), 0, 100) / 100;
  const quickSaleLoss = retailTotal * q;
  const realtorCost = retailTotal * c;
  const otherCost = retailTotal * o;
  const saleCosts = quickSaleLoss + realtorCost + otherCost;
  const revenue = retailTotal - saleCosts;                                        // выручка от продажи

  /* 4. НДС: выделяется из выручки и уменьшается на входящий НДС */
  const vatEnabled = !!s.vatEnabled;
  const vatRate = vatEnabled ? Math.max(0, num(s.vatRate)) : 0;
  const vatPayable = vatEnabled
    ? Math.max(0, revenue * vatRate / (100 + vatRate) - Math.max(0, num(s.inputVat)))
    : 0;
  const cashNet = revenue - vatPayable;                                           // чистый кэш до заморозки

  /* 5. Фактор времени */
  const months = Math.max(0, num(s.saleMonths));
  const annualRate = Math.max(0, num(s.annualReturn)) / 100;
  const factor = Math.pow(1 + annualRate, months / 12);
  const discountedCash = factor > 0 ? cashNet / factor : cashNet;
  const timeLoss = cashNet - discountedCash;

  /* 6. Налоги */
  const profitBeforeTax = discountedCash - costTotal;
  const profitTax = Math.max(0, profitBeforeTax) * Math.max(0, num(s.profitTaxRate)) / 100;

  /* 7. Итоги */
  const netProfit = profitBeforeTax - profitTax;
  const roi = costTotal > 0 ? netProfit / costTotal : 0;
  const effectivePrice = volume > 0 ? (netProfit + costTotal) / volume : 0;
  const priceDelta = price > 0 ? effectivePrice / price - 1 : 0;
  const margin = revenue > 0 ? netProfit / revenue : 0;

  return {
    volume, price, priceM2, dealSum, retailTotal, developerDiscountSum, areaM2, priceM2Offset,
    unitCost, costTotal,
    q, c, o, quickSaleLoss, realtorCost, otherCost, saleCosts, revenue,
    vatEnabled, vatRate, vatPayable, cashNet,
    months, annualRate, factor, discountedCash, timeLoss,
    profitBeforeTax, profitTax,
    netProfit, roi, effectivePrice, priceDelta, margin
  };
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/* ============================================================================
 *  РЕНДЕР: ФОРМА ВВОДА
 * ========================================================================== */
function fieldHTML(f) {
  if (f.type === 'checkbox') {
    return `
      <label class="sm:col-span-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-300 bg-white px-2.5 py-2 transition hover:border-brand-400 dark:border-slate-700 dark:bg-[#0a1120]">
        <input type="checkbox" data-field="${f.key}" ${state[f.key] ? 'checked' : ''} class="mt-0.5 shrink-0" />
        <span class="min-w-0">
          <span class="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">${f.label}</span>
          ${f.hint ? `<span class="mt-0.5 block text-[10.5px] leading-snug text-slate-400 dark:text-slate-500">${f.hint}</span>` : ''}
        </span>
      </label>`;
  }
  const caption = f.unit ? `${f.label}, ${f.unit}` : f.label;
  return `
    <label class="block${f.full ? ' sm:col-span-2' : ''}">
      <span class="flex items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 transition hover:border-brand-400 dark:border-slate-700 dark:bg-[#0a1120]">
        <span class="min-w-0 flex-1 text-[12.5px] font-medium leading-tight text-slate-600 sm:truncate dark:text-slate-300" title="${caption}">${caption}</span>
        <input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
               data-field="${f.key}" value="${fmtInput(state[f.key])}" class="input-base h-12 w-24 shrink-0 px-2 text-right sm:h-10 sm:w-28" />
      </span>
    </label>`;
}

function renderInputs() {
  document.getElementById('inputSections').innerHTML = SECTIONS.map((sec) => `
    <details class="card input-card overflow-hidden" open>
      <summary class="flex items-center gap-2 px-3 py-2">
        <span class="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500/10 to-indigo-500/10 text-[14px] dark:from-brand-500/20 dark:to-indigo-500/20">${sec.icon}</span>
        <span class="min-w-0 shrink-0 text-[13px] font-bold leading-tight">${sec.title}</span>
        <span class="chip chip--input shrink-0">ввод</span>
        <span class="hidden min-w-0 flex-1 truncate text-[10.5px] leading-tight text-slate-500 dark:text-slate-400 sm:block">${sec.desc}</span>
        <svg class="chev h-4 w-4 shrink-0 text-slate-400 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div class="border-t border-slate-100 px-3 pb-3 pt-2.5 dark:border-slate-800">
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">${sec.fields.map(fieldHTML).join('')}</div>
        <div class="calc-panel mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span class="chip chip--auto shrink-0">авто</span>
          <div data-summary="${sec.id}" class="flex flex-wrap items-center gap-x-4 gap-y-1"></div>
        </div>
      </div>
    </details>`).join('');
}

function refreshInputValues() {
  document.querySelectorAll('[data-field]').forEach((el) => {
    const key = el.dataset.field;
    if (el.type === 'checkbox') el.checked = !!state[key];
    else if (el.hasAttribute('data-zero-empty') && !num(state[key])) el.value = '';
    else el.value = fmtInput(state[key]);
  });
}

/* ============================================================================
 *  РЕНДЕР: ИТОГИ
 * ========================================================================== */
function toneClasses(tone) {
  switch (tone) {
    case 'good': return { text: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
    case 'warn': return { text: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' };
    case 'bad':  return { text: 'text-rose-600 dark:text-rose-400', chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' };
    default:     return { text: 'text-slate-800 dark:text-slate-100', chip: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' };
  }
}

function heroCard({ label, value, sub, tone = 'default', icon }) {
  const t = toneClasses(tone);
  return `
    <div class="card auto-card flex flex-col p-3">
      <div class="flex items-center gap-2">
        <span class="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[12px] ${t.chip}">${icon}</span>
        <p class="min-w-0 flex-1 text-[10.5px] font-bold uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400">${label}</p>
        <span class="chip chip--auto shrink-0">авто</span>
      </div>
      <p class="tabular mt-1 truncate text-lg font-extrabold leading-tight sm:text-xl ${t.text}" title="${value}">${value}</p>
      <p class="mt-0.5 text-[10.5px] leading-snug text-slate-500 dark:text-slate-400">${sub}</p>
    </div>`;
}

function renderHero(m) {
  const profitTone = m.netProfit > 0 ? 'good' : m.netProfit < 0 ? 'bad' : 'default';
  const roiTone = m.roi >= 0.25 ? 'good' : m.roi > 0 ? 'warn' : 'bad';
  const priceTone = m.priceDelta >= 0 ? 'good' : m.priceDelta > -0.1 ? 'warn' : 'bad';

  document.getElementById('heroKpis').innerHTML = [
    heroCard({
      label: 'Чистая денежная прибыль', icon: '💰',
      value: nf0.format(Math.round(m.netProfit)) + ' ' + CURRENCY,
      sub: 'после себестоимости, налогов и заморозки',
      tone: profitTone
    }),
    heroCard({
      label: 'ROI сделки', icon: '📈',
      value: pct(m.roi),
      sub: 'к производственной себестоимости',
      tone: roiTone
    }),
    heroCard({
      label: 'Эффективная цена ваты', icon: '🧱',
      value: nf0.format(Math.round(m.effectivePrice)) + PER_M3,
      sub: 'при прайсе ' + money(m.price) + '/м³',
      tone: priceTone
    }),
    heroCard({
      label: 'Отклонение от прайса', icon: '⚖️',
      value: signedPct(m.priceDelta),
      sub: m.priceDelta >= 0 ? 'сделка выгоднее прямой продажи' : 'скидка к прайсовой цене',
      tone: priceTone
    })
  ].join('');
}

function renderSectionSummaries(m) {
  SECTIONS.forEach((sec) => {
    const host = document.querySelector(`[data-summary="${sec.id}"]`);
    if (!host || !sec.summary) return;
    host.innerHTML = sec.summary(m).map(([label, value]) => `
      <div class="flex flex-wrap items-baseline gap-x-1.5">
        <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">${label}</span>
        <span class="tabular text-[12px] font-bold text-slate-700 dark:text-slate-200">${value}</span>
      </div>`).join('');
  });
}

/* ------------------------------- Экран 1: водопад ------------------------- */
function renderMonths(m) {
  const range = document.getElementById('monthsRange');
  const input = document.getElementById('monthsInput');
  const out = document.getElementById('monthsOut');
  if (range && document.activeElement !== range) range.value = String(clamp(Math.round(m.months), 0, MONTHS_MAX));
  if (input && document.activeElement !== input) input.value = String(Math.round(m.months));
  if (out) {
    const share = m.cashNet > 0 ? m.timeLoss / m.cashNet : 0;
    out.textContent = money(m.timeLoss) + (m.months > 0 ? '  ·  ' + pct(share) : '  (продажа сразу)');
  }
}

function renderDetails(m) {
  const rows = [
    ['Объём поставки', nf1.format(m.volume) + ' м³', 'по прайсу ' + money(m.price) + PER_M3],
    ['Сумма сделки (взаимозачёт)', money(m.dealSum), 'объём × прайс, без НДС'],
    ['Скидка застройщика', money(m.developerDiscountSum), nf1.format(state.developerDiscount) + '% от номинала квартир'],
    ['Номинал квартир', money(m.retailTotal), nf2.format(m.areaM2) + ' м² × ' + money(m.pricePerM2) + PER_M2],
    ['Цена зачёта 1 м²', money(m.priceM2Offset), 'розничная цена минус скидка застройщика'],
    ['Скидка быстрой продажи', money(m.quickSaleLoss), nf1.format(state.quickSaleDiscount) + '% от номинала'],
    ['Комиссия риелтора', money(m.realtorCost), nf1.format(state.realtorFee) + '% от номинала'],
    ['Прочие расходы', money(m.otherCost), nf1.format(state.otherExpenses) + '% от номинала'],
    ['Выручка от продажи', money(m.revenue), 'номинал минус издержки продажи'],
    ['НДС к уплате', money(m.vatPayable), m.vatEnabled ? `выделен из выручки по ставке ${nf1.format(state.vatRate)}%, вычет ${money(state.inputVat)}` : 'НДС в расчёте не участвует'],
    ['Чистый кэш до заморозки', money(m.cashNet), 'выручка минус НДС'],
    ['Потери от заморозки', money(m.timeLoss), nf1.format(m.months) + ' мес при ' + nf1.format(state.annualReturn) + '% годовых'],
    ['Приведённый (реальный) кэш', money(m.discountedCash), 'фактически полученные деньги'],
    ['Себестоимость 1 м³', money(m.unitCost), 'сырьё + ФОТ со взносами + энергия + накладные'],
    ['Себестоимость всего объёма', money(m.costTotal), 'вложения завода'],
    ['Прибыль до налога', money(m.profitBeforeTax), 'реальный кэш минус себестоимость'],
    ['КПН', money(m.profitTax), `ставка ${nf1.format(state.profitTaxRate)}%`],
    ['Чистая денежная прибыль', money(m.netProfit), 'итог сделки'],
    ['ROI', pct(m.roi), 'к производственной себестоимости'],
    ['Эффективная цена 1 м³', nf0.format(Math.round(m.effectivePrice)) + PER_M3, `отклонение от прайса ${signedPct(m.priceDelta)}`]
  ];

  document.getElementById('detailsBody').innerHTML = `
    <div class="divide-y divide-slate-100 dark:divide-slate-800">
      ${rows.map(([label, value, note]) => `
        <div class="flex items-baseline justify-between gap-3 py-2">
          <div class="min-w-0">
            <p class="text-[12.5px] font-medium text-slate-600 dark:text-slate-300">${label}</p>
            <p class="text-[10.5px] leading-tight text-slate-400 dark:text-slate-500">${note}</p>
          </div>
          <p class="tabular shrink-0 text-[13px] font-bold text-slate-800 dark:text-slate-100">${value}</p>
        </div>`).join('')}
    </div>`;
}

/* ============================================================================
 *  ГРАФИКИ
 * ========================================================================== */
const charts = {};

const C = {
  profit: '#10b981',
  loss: '#ef4444',
  cost: '#64748b',
  qsale: '#f472b6',
  realtor: '#c084fc',
  other: '#818cf8',
  time: '#f59e0b',
  tax: '#fb923c',
  vat: '#ef4444',
  brand: '#3b82f6',
  sky: '#0ea5e9',
  indigo: '#6366f1',
  violet: '#8b5cf6'
};

function themeTokens() {
  const dark = document.documentElement.classList.contains('dark');
  return {
    name: dark ? 'dark' : 'light',
    text: dark ? '#e2e8f0' : '#1e293b',
    muted: dark ? '#94a3b8' : '#64748b',
    grid: dark ? 'rgba(148,163,184,.14)' : 'rgba(100,116,139,.14)',
    tooltipBg: dark ? 'rgba(15,23,42,.96)' : 'rgba(255,255,255,.98)',
    tooltipTitle: dark ? '#f1f5f9' : '#0f172a',
    tooltipBody: dark ? '#cbd5e1' : '#334155',
    border: dark ? 'rgba(148,163,184,.25)' : 'rgba(100,116,139,.25)'
  };
}

function baseOptions(t, extra) {
  return Object.assign({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 260 },
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: t.muted, boxWidth: 10, boxHeight: 10, usePointStyle: true,
          pointStyle: 'circle', padding: 12, font: { size: 11, weight: '600' }
        }
      },
      tooltip: {
        backgroundColor: t.tooltipBg,
        titleColor: t.tooltipTitle,
        bodyColor: t.tooltipBody,
        borderColor: t.border,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
        titleFont: { size: 12, weight: '700' },
        bodyFont: { size: 12 }
      }
    }
  }, extra || {});
}

function renderChart(key, canvasId, type, spec) {
  const t = themeTokens();
  let ch = charts[key];
  if (ch && ch._theme !== t.name) { ch.destroy(); delete charts[key]; ch = null; }
  if (!ch) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    ch = new Chart(el, { type, data: spec.data, options: spec.options, plugins: spec.plugins || [] });
    ch._theme = t.name;
    charts[key] = ch;
  } else {
    ch.data = spec.data;
    ch.options = spec.options;
    ch.update('none');
  }
}

function destroyCharts() {
  Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; });
}

/* --- Водопад: от суммы сделки к чистой прибыли ----------------------------- */

/* Переносит длинные подписи на две строки, чтобы влезали на телефоне */
function wrapAxisLabel(text, max = 17) {
  if (text.length <= max) return text;
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (best < 0 || Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2))) best = i;
  }
  return best > 0 ? [text.slice(0, best), text.slice(best + 1)] : text;
}

/* Подписывает суммы прямо на столбцах (без внешних библиотек) */
const barValueLabels = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    const steps = chart.data.datasets[0] && chart.data.datasets[0].steps;
    if (!meta || !steps) return;
    const ctx = chart.ctx;
    const t = themeTokens();
    ctx.save();
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    meta.data.forEach((bar, i) => {
      const s = steps[i];
      if (!s) return;
      const isTotal = s.kind === 'total' || s.kind === 'subtotal' || s.kind === 'profit' || s.kind === 'loss';
      const amount = isTotal ? s.to : Math.abs(s.to - s.from);
      const text = (isTotal ? '' : s.kind === 'plus' ? '+' : '−') + nfShort.format(Math.round(amount)) + ' ' + CURRENCY;
      /* подпись всегда справа от столбца — на сам столбец текст не заходит.
         У горизонтальных столбцов Chart.js хранит концы в bar.x и bar.base */
      const x1 = Math.max(bar.x, bar.base);
      ctx.fillStyle = t.text;
      ctx.textAlign = 'left';
      ctx.fillText(text, x1 + 6, bar.y);
    });
    ctx.restore();
  }
};

function waterfallSpec(m, t) {
  const steps = [];
  let cursor = 0;

  const subtotal = (label, kind) => steps.push({ label, from: 0, to: cursor, kind: kind || 'subtotal' });
  const up = (label, amount) => {
    if (Math.abs(amount) < 0.5) return;
    steps.push({ label, from: cursor, to: cursor + amount, kind: 'plus' });
    cursor += amount;
  };
  const down = (label, amount) => {
    if (Math.abs(amount) < 0.5) return;
    steps.push({ label, from: cursor - amount, to: cursor, kind: 'minus' });
    cursor -= amount;
  };

  /* 1. сумма сделки (взаимозачёт) — по прайсу ваты либо по метрам квартир */
  steps.push({ label: 'Сумма сделки (взаимозачёт)', from: 0, to: m.dealSum, kind: 'total' });
  cursor = m.dealSum;
  /* 2. скидка застройщика — плюсом вправо от конца предыдущего столбца */
  up('Скидка застройщика', m.developerDiscountSum);
  subtotal('Номинал квартир');
  /* 3. издержки монетизации квартир */
  down('Скидка быстрой продажи', m.quickSaleLoss);
  down('Комиссия риелтора', m.realtorCost);
  down('Прочие расходы', m.otherCost);
  subtotal('Выручка от продажи');
  /* 4. НДС (от выручки), заморозка, себестоимость */
  down('НДС к уплате', m.vatPayable);
  down('Потери от заморозки', m.timeLoss);
  down('Себестоимость ваты', m.costTotal);
  subtotal('Прибыль до налога');
  down('КПН', m.profitTax);
  steps.push({ label: 'Чистая прибыль', from: 0, to: cursor, kind: cursor >= 0 ? 'profit' : 'loss' });

  const colorOf = (kind) => ({
    total: C.brand, plus: C.profit, subtotal: C.violet, minus: C.loss,
    profit: C.profit, loss: C.loss
  }[kind] || C.cost);

  const isTotalKind = (kind) => kind === 'total' || kind === 'subtotal' || kind === 'profit' || kind === 'loss';

  return {
    plugins: [barValueLabels],
    data: {
      labels: steps.map((s) => wrapAxisLabel(s.label, window.innerWidth < 640 ? 17 : 30)),
      datasets: [{
        label: 'Сумма',
        steps: steps,
        data: steps.map((s) => [Math.min(s.from, s.to), Math.max(s.from, s.to)]),
        backgroundColor: steps.map((s) => colorOf(s.kind) + 'e6'),
        hoverBackgroundColor: steps.map((s) => colorOf(s.kind)),
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.74,
        categoryPercentage: 0.86
      }]
    },
    options: baseOptions(t, {
      indexAxis: 'y',
      layout: { padding: { right: 12, left: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.tooltipBg, titleColor: t.tooltipTitle, bodyColor: t.tooltipBody,
          borderColor: t.border, borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: false,
          callbacks: {
            title: (items) => (steps[items[0].dataIndex] || {}).label || '',
            label: (ctx) => {
              const s = steps[ctx.dataIndex];
              if (!s) return '';
              if (isTotalKind(s.kind)) return ' Итог: ' + money(s.to);
              return (s.kind === 'plus' ? ' Плюс: +' : ' Минус: −') + money(Math.abs(s.to - s.from));
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: t.grid, drawBorder: false },
          border: { display: false },
          suggestedMax: Math.max(m.retailTotal, m.dealSum, m.revenue, 0) * (window.innerWidth < 640 ? 1.45 : 1.4),
          ticks: { color: t.muted, font: { size: 10.5 }, callback: (v) => nfShort.format(v), maxTicksLimit: 7 }
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: t.text, font: { size: 11, weight: '600' }, crossAlign: 'far', autoSkip: false }
        }
      }
    })
  };
}

/* --- Экран 3: план и факт по статьям -------------------------------------- */
function factChartSpec(m, t) {
  const rows = FACT_ROWS.map((r) => ({
    label: r.label,
    plan: Math.abs(r.plan(m)),
    fact: Math.abs(num(state[r.key]))
  }));

  return {
    data: {
      labels: rows.map((r) => wrapAxisLabel(r.label, 20)),
      datasets: [
        {
          label: 'План',
          data: rows.map((r) => r.plan),
          backgroundColor: C.violet + 'b3',
          hoverBackgroundColor: C.violet,
          borderRadius: 6, borderSkipped: false, barPercentage: 0.85, categoryPercentage: 0.8
        },
        {
          label: 'Факт',
          data: rows.map((r) => r.fact),
          backgroundColor: C.brand + 'd9',
          hoverBackgroundColor: C.brand,
          borderRadius: 6, borderSkipped: false, barPercentage: 0.85, categoryPercentage: 0.8
        }
      ]
    },
    options: baseOptions(t, {
      indexAxis: 'y',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: t.muted, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 11, weight: '600' } }
        },
        tooltip: {
          backgroundColor: t.tooltipBg, titleColor: t.tooltipTitle, bodyColor: t.tooltipBody,
          borderColor: t.border, borderWidth: 1, padding: 10, cornerRadius: 10,
          displayColors: true, boxWidth: 8, boxHeight: 8, usePointStyle: true,
          callbacks: { label: (ctx) => ' ' + ctx.dataset.label + ': ' + money(ctx.parsed.x) }
        }
      },
      scales: {
        x: {
          grid: { color: t.grid, drawBorder: false },
          border: { display: false },
          ticks: { color: t.muted, font: { size: 10.5 }, callback: (v) => nfShort.format(v), maxTicksLimit: 6 }
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: t.text, font: { size: 10.5, weight: '600' }, autoSkip: false }
        }
      }
    })
  };
}

/* ============================================================================
 *  ГЛАВНЫЙ РЕНДЕР
 * ========================================================================== */
function render() {
  const m = calc(state);
  renderHero(m);
  renderSectionSummaries(m);
  renderMonths(m);
  renderDetails(m);
  renderFact(m);

  const t = themeTokens();
  if (isScreenActive('screen1')) renderChart('waterfall', 'chartWaterfall', 'bar', waterfallSpec(m, t));
  if (isScreenActive('screen3')) renderChart('planfact', 'chartPlanFact', 'bar', factChartSpec(m, t));
}

/* ============================================================================
 *  ЭКРАН 3: ФАКТ — ПЛАН / ФАКТ
 * ========================================================================== */
const FACT_ROWS = [
  { key: 'factRevenue', label: 'Номинал квартир к продаже', sign: 1, plan: (m) => m.retailTotal },
  { key: 'factQuickSaleLoss', label: 'Скидка быстрой продажи', sign: -1, plan: (m) => m.quickSaleLoss },
  { key: 'factRealtorFee', label: 'Комиссия риелтора', sign: -1, plan: (m) => m.realtorCost },
  { key: 'factOtherExpenses', label: 'Прочие расходы', sign: -1, plan: (m) => m.otherCost },
  { key: 'factVat', label: 'НДС к уплате', sign: -1, plan: (m) => m.vatPayable },
  { key: 'factTimeLoss', label: 'Потери от заморозки', sign: -1, plan: (m) => m.timeLoss },
  { key: 'factCost', label: 'Себестоимость ваты', sign: -1, plan: (m) => m.costTotal },
  { key: 'factCit', label: 'КПН', sign: -1, plan: (m) => m.profitTax }
];

const ZERO_EPS = 1.5;   // допуск на округление: разница меньше считается «план совпал»

/* Журнал строится один раз, чтобы поля не теряли фокус при пересчёте */
function renderFactRows() {
  const host = document.getElementById('factRows');
  if (!host) return;
  const head = `
    <div class="mt-2 hidden gap-2 px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_8.5rem_7.5rem] dark:text-slate-500">
      <span>Статья</span><span class="text-right">План, ${CURRENCY}</span><span class="text-right">Факт, ${CURRENCY}</span><span class="text-right">Отклонение</span>
    </div>`;
  const rows = FACT_ROWS.map((r) => `
    <div class="grid grid-cols-1 items-center gap-2 border-t border-slate-100 py-3 dark:border-slate-800 sm:grid-cols-[minmax(0,1fr)_8rem_8.5rem_7.5rem]">
      <p class="text-[12.5px] font-medium text-slate-600 dark:text-slate-300">
        <span class="mr-1 font-bold ${r.sign < 0 ? 'text-rose-500' : 'text-emerald-500'}">${r.sign < 0 ? '−' : '+'}</span>${r.label}
      </p>
      <p data-plan="${r.key}" class="tabular text-[12px] font-bold text-slate-500 dark:text-slate-400 sm:text-right"></p>
      <input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-field="${r.key}" data-zero-empty class="input-base h-11 text-right text-[14px]" />
      <p data-dev="${r.key}" class="tabular text-[12px] font-bold sm:text-right"></p>
    </div>`).join('');
  host.innerHTML = head + rows;
}

function factMetrics(m) {
  let factNet = 0;
  let planNet = 0;
  let filled = 0;
  FACT_ROWS.forEach((r) => {
    const f = Math.max(0, num(state[r.key]));
    if (f > 0) filled++;
    factNet += r.sign * f;
    planNet += r.sign * r.plan(m);
  });
  return { factNet, planNet, filled, total: FACT_ROWS.length, delta: factNet - planNet };
}

function renderFact(m) {
  const fm = factMetrics(m);
  const round = (v) => nf0.format(Math.round(Math.abs(v))) + ' ' + CURRENCY;

  FACT_ROWS.forEach((r) => {
    const plan = Math.abs(r.plan(m));
    const fact = Math.max(0, num(state[r.key]));

    const planEl = document.querySelector(`[data-plan="${r.key}"]`);
    if (planEl) planEl.textContent = round(plan);

    const devEl = document.querySelector(`[data-dev="${r.key}"]`);
    if (!devEl) return;
    if (fact <= 0) {
      devEl.textContent = '—';
      devEl.className = 'tabular text-[12px] font-bold text-slate-300 sm:text-right dark:text-slate-600';
      return;
    }
    const dev = fact - plan;
    const good = r.sign < 0 ? dev <= 0 : dev >= 0;
    const close = Math.abs(dev) < ZERO_EPS;
    devEl.textContent = close ? '0 ' + CURRENCY : signedMoney(dev);
    devEl.className = 'tabular text-[12px] font-bold sm:text-right ' + (
      close
        ? 'text-slate-400 dark:text-slate-500'
        : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
    );
  });

  const host = document.getElementById('factSummary');
  if (!host) return;

  if (fm.filled === 0) {
    host.innerHTML = `
      <div class="card auto-card col-span-2 p-3.5 lg:col-span-4">
        <p class="text-[12.5px] font-bold text-slate-600 dark:text-slate-300">Факт пока не заполнен</p>
        <p class="mt-0.5 text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">
          Впишите фактические суммы в журнал ниже или нажмите «Скопировать план» — отклонения и итог посчитаются сами.
        </p>
      </div>`;
    return;
  }

  const factCost = Math.max(0, num(state.factCost));
  const roiFact = factCost > 0 ? fm.factNet / factCost : 0;
  const deltaShare = fm.planNet !== 0 ? fm.delta / Math.abs(fm.planNet) : 0;
  const sameAsPlan = Math.abs(fm.delta) < ZERO_EPS;

  host.innerHTML = [
    heroCard({
      label: 'Фактическая чистая прибыль', icon: '💰',
      value: money(fm.factNet),
      sub: 'план ' + money(fm.planNet),
      tone: fm.factNet > 0 ? 'good' : fm.factNet < 0 ? 'bad' : 'default'
    }),
    heroCard({
      label: 'Отклонение от плана', icon: '⚖️',
      value: sameAsPlan ? '0 ' + CURRENCY : signedMoney(fm.delta),
      sub: sameAsPlan
        ? 'факт совпал с планом'
        : (fm.delta > 0 ? 'лучше плана на ' : 'хуже плана на ') + pct(Math.abs(deltaShare)),
      tone: sameAsPlan ? 'default' : fm.delta > 0 ? 'good' : 'bad'
    }),
    heroCard({
      label: 'ROI по факту', icon: '📈',
      value: pct(roiFact),
      sub: factCost > 0 ? 'к фактической себестоимости' : 'укажите фактическую себестоимость',
      tone: roiFact >= 0.25 ? 'good' : roiFact > 0 ? 'warn' : 'bad'
    }),
    heroCard({
      label: 'Заполнено статей', icon: '🧾',
      value: fm.filled + ' из ' + fm.total,
      sub: 'чем больше статей, тем точнее итог',
      tone: fm.filled >= fm.total ? 'good' : 'default'
    })
  ].join('');
}

/* ============================================================================
 *  СОБЫТИЯ
 * ========================================================================== */
function readInput(el) {
  const raw = String(el.value || '')
    .replace(/[\u00a0\u202f\s]/g, '')
    .replace(',', '.');
  if (raw === '' || raw === '-' || raw === '.') return 0;
  const n = parseFloat(raw);
  return isFinite(n) ? n : 0;
}

function fieldByKey(key) {
  for (const sec of SECTIONS) {
    const f = sec.fields.find((x) => x.key === key);
    if (f) return f;
  }
  return null;
}

function setLinkValue(key, v) {
  const el = document.querySelector(`[data-link="${key}"]`);
  if (el && document.activeElement !== el) el.value = fmtInput(v);
}

function refreshDealInputs() {
  document.querySelectorAll('[data-link]').forEach((el) => { el.value = fmtInput(state[el.dataset.link]); });
}

/* Экран 1: любое из двух полей задаёт второе, баланс взаимозачёта всегда сходится */
function bindDealInputs() {
  const host = document.getElementById('dealInputs');
  if (!host) return;

  host.addEventListener('input', (e) => {
    const el = e.target.closest('[data-link]');
    if (!el) return;
    const key = el.dataset.link;
    const v = Math.max(0, readInput(el));

    if (key === 'volume') {
      state.volume = v;
      state.areaDriven = false;
      state.areaM2 = round2(areaFromVolume(v, state));
      setLinkValue('areaM2', state.areaM2);
    } else {
      state.areaM2 = v;
      state.areaDriven = true;
      state.volume = round2(volumeFromArea(v, state));
      setLinkValue('volume', state.volume);
    }
    render();
    scheduleSave();
  });

  host.addEventListener('focusout', (e) => {
    if (!e.target.closest('[data-link]')) return;
    refreshDealInputs();
    render();
    scheduleSave();
  });
}

/* Срок продажи: бегунок + прямое поле ввода (влияет на «Потери от заморозки») */
function bindMonths() {
  const range = document.getElementById('monthsRange');
  const input = document.getElementById('monthsInput');
  if (!range || !input) return;

  const apply = (v, from) => {
    const n = clamp(Math.round(v), 0, MONTHS_MAX);
    state.saleMonths = n;
    if (from !== 'range') range.value = String(n);
    if (from !== 'input') input.value = String(n);
    render();
    scheduleSave();
  };

  range.addEventListener('input', () => apply(parseFloat(range.value) || 0, 'range'));
  input.addEventListener('input', () => apply(readInput(input), 'input'));
  input.addEventListener('focusout', () => {
    input.value = String(clamp(Math.round(state.saleMonths), 0, MONTHS_MAX));
    render();
    scheduleSave();
  });
}

function bindInputs() {
  const hosts = [document.getElementById('inputSections'), document.getElementById('factRows')].filter(Boolean);

  hosts.forEach((host) => {
    const fromInputs = host.id === 'inputSections';

    host.addEventListener('input', (e) => {
      const el = e.target.closest('[data-field]');
      if (!el || el.type === 'checkbox') return;
      state[el.dataset.field] = readInput(el);
      if (fromInputs) { syncDeal(); refreshDealInputs(); }
      render();
      scheduleSave();
    });

    host.addEventListener('change', (e) => {
      const el = e.target.closest('[data-field]');
      if (!el || el.type !== 'checkbox') return;
      state[el.dataset.field] = el.checked;
      render();
      scheduleSave();
    });

    host.addEventListener('focusout', (e) => {
      const el = e.target.closest('[data-field]');
      if (!el || el.type === 'checkbox') return;
      const key = el.dataset.field;
      const f = fieldByKey(key);
      let v = readInput(el);
      if (f) {
        if (typeof f.min === 'number') v = Math.max(f.min, v);
        if (typeof f.max === 'number') v = Math.min(f.max, v);
      }
      state[key] = v;
      el.value = el.hasAttribute('data-zero-empty') && !v ? '' : fmtInput(v);
      if (fromInputs) { syncDeal(); refreshDealInputs(); }
      render();
      scheduleSave();
    });
  });
}

/* --------------------------- Экраны (вкладки) ---------------------------- */
function isScreenActive(id) {
  const el = document.getElementById(id);
  return !!el && !el.classList.contains('hidden');
}

function showScreen(n, silent) {
  const target = 'screen' + n;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== target));
  document.querySelectorAll('[data-screen]').forEach((b) => {
    b.classList.toggle('tab-btn--active', b.dataset.screen === String(n));
  });
  try { localStorage.setItem(SCREEN_KEY, String(n)); } catch (e) { /* noop */ }
  if (!silent && location.hash !== '#screen' + n) {
    try { history.replaceState(null, '', '#screen' + n); } catch (e) { location.hash = 'screen' + n; }
  }
  render();
  requestAnimationFrame(() => {
    Object.keys(charts).forEach((k) => {
      const ch = charts[k];
      if (ch && ch.canvas && ch.canvas.offsetParent !== null) ch.resize();
    });
  });
}

function initialScreen() {
  const fromHash = parseInt((location.hash.match(/screen(\d)/) || [])[1] || '0', 10);
  if (fromHash >= 1 && fromHash <= 3) return fromHash;
  const saved = parseInt(localStorage.getItem(SCREEN_KEY) || '1', 10);
  return saved >= 1 && saved <= 3 ? saved : 1;
}

function bindTabs() {
  document.querySelectorAll('[data-screen]').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(parseInt(btn.dataset.screen, 10)));
  });
  window.addEventListener('hashchange', () => {
    const found = location.hash.match(/screen(\d)/);
    const n = found ? parseInt(found[1], 10) : 1;
    if (document.getElementById('screen' + n)) showScreen(n, true);
  });
}

/* Экран 3: «Скопировать план» и «Очистить» */
function bindFactButtons() {
  const fill = document.getElementById('factFill');
  const clear = document.getElementById('factClear');
  if (fill) {
    fill.addEventListener('click', () => {
      const m = calc(state);
      FACT_ROWS.forEach((r) => { state[r.key] = Math.round(Math.abs(r.plan(m))); });
      refreshInputValues();
      render();
      scheduleSave();
    });
  }
  if (clear) {
    clear.addEventListener('click', () => {
      FACT_ROWS.forEach((r) => { state[r.key] = 0; });
      refreshInputValues();
      render();
      scheduleSave();
    });
  }
}

function applyPreset(name) {
  const p = PRESETS[name] || {};
  state = Object.assign({}, DEFAULTS, p);
  syncDeal();
  refreshInputValues();
  render();
  scheduleSave();
}

function bindToolbar() {
  /* Тема */
  const btnTheme = document.getElementById('btnTheme');
  const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-[18px] w-[18px]"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-[18px] w-[18px]"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  const syncThemeIcon = () => {
    const dark = document.documentElement.classList.contains('dark');
    btnTheme.innerHTML = (dark ? sunIcon : moonIcon) + `<span class="hidden sm:inline">${dark ? 'Светлая' : 'Тёмная'}</span>`;
  };
  syncThemeIcon();

  btnTheme.addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (e) { /* noop */ }
    syncThemeIcon();
    destroyCharts();
    render();
  });

  /* Сброс */
  document.getElementById('btnReset').addEventListener('click', () => {
    state = Object.assign({}, DEFAULTS);
    syncDeal();
    refreshInputValues();
    render();
    scheduleSave();
  });

  /* Печать */
  document.getElementById('btnPrint').addEventListener('click', () => window.print());

  /* Пресеты */
  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
      btn.classList.add('pulse-ring');
      setTimeout(() => btn.classList.remove('pulse-ring'), 1300);
    });
  });
}

/* ============================================================================
 *  МОДАЛКА «ОТКРЫТЬ НА ТЕЛЕФОНЕ» (QR-код текущего адреса)
 * ========================================================================== */
function bindShare() {
  const modal = document.getElementById('shareModal');
  const urlInput = document.getElementById('shareUrl');
  const qrBox = document.getElementById('qrBox');
  const hint = document.getElementById('shareHint');
  const btn = document.getElementById('btnShare');
  if (!modal || !btn) return;

  const isFile = location.protocol === 'file:';
  const isLocalhost = !isFile && ['localhost', '127.0.0.1', '::1', ''].indexOf(location.hostname) !== -1;

  function drawQr(url) {
    qrBox.innerHTML = '';
    if (typeof qrcode !== 'function') {
      qrBox.innerHTML = '<p class="p-3 text-center text-[11px] text-slate-400">Библиотека QR не загрузилась</p>';
      return;
    }
    try {
      const qr = qrcode(0, 'M');   // 0 — автоматически подобрать размер
      qr.addData(url);
      qr.make();
      qrBox.innerHTML = qr.createSvgTag(5, 2);
      const svg = qrBox.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.display = 'block';
      }
    } catch (e) {
      qrBox.innerHTML = '<p class="p-3 text-center text-[11px] text-slate-400">Не удалось построить QR-код</p>';
    }
  }

  function open() {
    urlInput.value = location.href;
    const caption = document.getElementById('shareCaption');

    if (isFile || isLocalhost) {
      caption.classList.add('hidden');
      qrBox.innerHTML = `
        <div class="p-3 text-center">
          <p class="text-2xl">📱</p>
          <p class="mt-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">QR-код появится, если открыть дашборд по сетевому адресу</p>
        </div>`;
      hint.innerHTML = isFile
        ? 'Файл открыт как <b>file://</b> — телефон по такой ссылке страницу не получит. '
          + 'Запустите в папке проекта <code class="font-mono">python -m http.server 8000</code> '
          + 'и откройте дашборд по адресу <b>http://192.168.x.x:8000</b> (IP вашего компьютера).'
        : 'Адрес <b>localhost</b> существует только на этом компьютере, поэтому QR-код для телефона был бы бесполезен. '
          + 'Узнайте IP компьютера командой <code class="font-mono">ipconfig</code> и откройте дашборд по адресу '
          + '<b>http://192.168.x.x:8000</b> — тогда здесь появится рабочий QR-код.';
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      return;
    }

    drawQr(location.href);
    caption.classList.remove('hidden');
    hint.innerHTML = 'Отсканируйте код камерой телефона — откроется эта же страница. '
      + 'Ссылку можно отправить заказчику в мессенджере.';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function close() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  btn.addEventListener('click', open);
  document.getElementById('shareClose').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });

  document.getElementById('shareCopy').addEventListener('click', async (e) => {
    const target = e.currentTarget;
    const text = urlInput.value;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (err) {
      urlInput.removeAttribute('readonly');
      urlInput.select();
      ok = document.execCommand('copy');
      urlInput.setAttribute('readonly', 'readonly');
    }
    const old = target.textContent;
    target.textContent = ok ? 'Скопировано' : 'Не вышло';
    setTimeout(() => { target.textContent = old; }, 1400);
  });
}

/* ============================================================================
 *  СТАРТ
 * ========================================================================== */
(function init() {
  state.saleMonths = clamp(Math.round(num(state.saleMonths)), 0, MONTHS_MAX);
  syncDeal();
  renderInputs();
  renderFactRows();
  refreshInputValues();
  refreshDealInputs();
  bindInputs();
  bindDealInputs();
  bindMonths();
  bindFactButtons();
  bindTabs();
  bindToolbar();
  bindShare();
  showScreen(initialScreen(), true);
})();
