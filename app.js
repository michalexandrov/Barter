'use strict';

/* ============================================================================
 *  Бартер-дашборд: поставка минеральной ваты ⇄ квартиры застройщика
 *  Финансовая логика — согласно CLAUDE.md
 * ========================================================================== */

const STORAGE_KEY = 'barter.dashboard.v2';   // v2: переход на тенге, НДС 16 %, КПН 20 %
const THEME_KEY = 'barter.theme';

/* ------------------------------ Регион: Казахстан ------------------------- */
const CURRENCY = '₸';      // тенге (KZT)
const PER_M3 = ' ₸/м³';
const VAT_RATE_DEFAULT = 16;   // стандартная ставка НДС в Республике Казахстан
const CIT_RATE_DEFAULT = 20;   // корпоративный подоходный налог (КПН)

/* ------------------------------- Значения по умолчанию -------------------- */
const DEFAULTS = {
  /* Производство */
  volume: 1000,
  pricePerM3: 24000,
  vatRate: VAT_RATE_DEFAULT,
  /* Себестоимость (на 1 м³) */
  rawPerM3: 8500,
  salaryPerM3: 4000,
  insuranceRate: 12,
  energyPerM3: 2400,
  overheadPerM3: 1800,
  /* Квартиры */
  apartmentsCount: 1,
  apartmentPrice: 32800000,
  developerDiscount: 15,
  /* Продажа квартир */
  quickSaleDiscount: 8,
  realtorFee: 2,
  otherExpenses: 1,
  /* Время и деньги */
  saleMonths: 12,
  monthlyReturn: 1.5,
  /* Налоги */
  profitTaxRate: CIT_RATE_DEFAULT,
  vatPayableOn: false,
  inputVat: 0
};

const PRESETS = {
  cautious: { developerDiscount: 25, quickSaleDiscount: 15, realtorFee: 3, otherExpenses: 2, saleMonths: 18, monthlyReturn: 2 },
  base: {},
  optimistic: { developerDiscount: 10, quickSaleDiscount: 5, realtorFee: 1.5, otherExpenses: 0.5, saleMonths: 6, monthlyReturn: 1 }
};

/* ------------------------------- Схема формы ------------------------------ */
const money = (v) => nf0.format(Math.round(v || 0)) + ' ' + CURRENCY;

const SECTIONS = [
  {
    id: 'production', icon: '🏭', title: 'Производство ваты', desc: 'Объём и стоимость поставки',
    fields: [
      { key: 'volume', label: 'Объём поставки', unit: 'м³', min: 0, hint: 'Сколько кубометров ваты уходит в сделку' },
      { key: 'pricePerM3', label: 'Базовая цена ваты (без НДС)', unit: '₸/м³', min: 0, hint: 'Прайсовая цена завода, тенге за м³' },
      { key: 'vatRate', label: 'Ставка НДС', unit: '%', min: 0, max: 100, hint: 'Стандартная ставка НДС в Казахстане — 16 %' }
    ],
    summary: (m) => [
      ['Поставка без НДС', money(m.deliveryNet)],
      ['Поставка с НДС', money(m.deliveryGross)]
    ]
  },
  {
    id: 'cost', icon: '⚙️', title: 'Себестоимость', desc: 'Производственные затраты на 1 м³',
    fields: [
      { key: 'rawPerM3', label: 'Сырьё', unit: '₸/м³', min: 0 },
      { key: 'salaryPerM3', label: 'ФОТ (зарплата)', unit: '₸/м³', min: 0 },
      { key: 'insuranceRate', label: 'Соцплатежи работодателя', unit: '% от ФОТ', min: 0, max: 100, hint: 'Соцналог, ОПВ/ОСМС/СО — ориентировочно 11–14 % в Казахстане' },
      { key: 'energyPerM3', label: 'Энергия', unit: '₸/м³', min: 0 },
      { key: 'overheadPerM3', label: 'Накладные расходы', unit: '₸/м³', min: 0 }
    ],
    summary: (m) => [
      ['Себестоимость 1 м³', money(m.unitCost)],
      ['На весь объём', money(m.costTotal)]
    ]
  },
  {
    id: 'apartments', icon: '🏙️', title: 'Квартиры от застройщика', desc: 'Что завод получает в обмен',
    fields: [
      { key: 'apartmentsCount', label: 'Количество квартир', unit: 'шт', min: 0, hint: 'Сколько объектов передаёт застройщик' },
      { key: 'apartmentPrice', label: 'Средняя розничная стоимость', unit: '₸', min: 0 },
      { key: 'developerDiscount', label: 'Скидка застройщика', unit: '%', min: 0, max: 100, hint: 'Уступка от розничной цены при зачёте' }
    ],
    summary: (m) => [
      ['Номинал квартир', money(m.retailTotal)],
      ['Цена зачёта', money(m.offsetPrice)],
      ['Баланс взаимозачёта', money(m.balance)]
    ]
  },
  {
    id: 'sale', icon: '💸', title: 'Продажа квартир', desc: 'Монетизация полученных объектов',
    fields: [
      { key: 'quickSaleDiscount', label: 'Скидка для быстрой продажи', unit: '%', min: 0, max: 100, hint: 'Дисконт рынку, чтобы продать объект быстро' },
      { key: 'realtorFee', label: 'Комиссия риелтора', unit: '% от розницы', min: 0, max: 100 },
      { key: 'otherExpenses', label: 'Прочие расходы', unit: '% от розницы', min: 0, max: 100, hint: 'Оформление, содержание, налог на имущество' }
    ],
    summary: (m) => [
      ['Кэш при продаже сегодня', money(m.cashNominal)],
      ['Издержки продажи', money(m.saleCosts)]
    ]
  },
  {
    id: 'time', icon: '⏳', title: 'Время и деньги', desc: 'Стоимость заморозки капитала',
    fields: [
      { key: 'saleMonths', label: 'Срок продажи квартир', unit: 'мес', min: 0, max: 120 },
      { key: 'monthlyReturn', label: 'Альтернативная доходность', unit: '% в месяц', min: 0, max: 50, hint: 'Куда можно вложить деньги вместо заморозки' }
    ],
    summary: (m) => [
      ['Приведённый кэш', money(m.discountedCash)],
      ['Потери от заморозки', money(m.timeLoss)]
    ]
  },
  {
    id: 'taxes', icon: '🧾', title: 'Налоги и НДС', desc: 'Обязательства перед бюджетом РК',
    fields: [
      { key: 'profitTaxRate', label: 'КПН (корпоративный подоходный налог)', unit: '%', min: 0, max: 100, hint: 'Базовая ставка КПН в Казахстане — 20 %' },
      { key: 'vatPayableOn', type: 'checkbox', label: 'Учитывать НДС к уплате', hint: 'В бартере НДС с поставки платится деньгами, если его не перекладывают на покупателя' },
      { key: 'inputVat', label: 'НДС к вычету (входящий)', unit: '₸', min: 0, hint: 'НДС по сырью, энергии и полученным квартирам' }
    ],
    summary: (m) => [
      ['КПН к уплате', money(m.profitTax)],
      ['НДС к уплате', money(m.vatPayable)]
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
const fmtInput = (v) => nf2.format(typeof v === 'number' ? v : 0);

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
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

  /* 1. Поставка ваты */
  const volume = Math.max(0, num(s.volume));
  const price = Math.max(0, num(s.pricePerM3));
  const deliveryNet = volume * price;                                  // без НДС
  const vatOut = deliveryNet * Math.max(0, num(s.vatRate)) / 100;      // исходящий НДС
  const deliveryGross = deliveryNet + vatOut;                          // с НДС

  /* 2. Производственная себестоимость */
  const unitCost =
    Math.max(0, num(s.rawPerM3)) +
    Math.max(0, num(s.salaryPerM3)) * (1 + Math.max(0, num(s.insuranceRate)) / 100) +
    Math.max(0, num(s.energyPerM3)) +
    Math.max(0, num(s.overheadPerM3));
  const costTotal = unitCost * volume;

  /* 3. Квартирный зачёт */
  const retailTotal = Math.max(0, num(s.apartmentsCount)) * Math.max(0, num(s.apartmentPrice));
  const offsetPrice = retailTotal * (1 - clamp(num(s.developerDiscount), 0, 100) / 100);
  const balance = deliveryGross - offsetPrice;
  const balanceShare = deliveryGross > 0 ? balance / deliveryGross : 0;

  /* 4. Монетизация квартир */
  const q = clamp(num(s.quickSaleDiscount), 0, 100) / 100;
  const c = clamp(num(s.realtorFee), 0, 100) / 100;
  const o = clamp(num(s.otherExpenses), 0, 100) / 100;
  const quickSaleLoss = retailTotal * q;
  const realtorCost = retailTotal * c;
  const otherCost = retailTotal * o;
  const saleCosts = quickSaleLoss + realtorCost + otherCost;
  const cashNominal = retailTotal - saleCosts;

  /* 5. Фактор времени (сложный процент) */
  const months = Math.max(0, num(s.saleMonths));
  const monthlyRate = Math.max(0, num(s.monthlyReturn)) / 100;
  const factor = Math.pow(1 + monthlyRate, months);
  const discountedCash = factor > 0 ? cashNominal / factor : cashNominal;
  const timeLoss = cashNominal - discountedCash;
  const annualEquivalent = (Math.pow(1 + monthlyRate, 12) - 1);

  /* 6. Налоги */
  const vatPayable = s.vatPayableOn ? Math.max(0, vatOut - Math.max(0, num(s.inputVat))) : 0;
  const taxableProfit = deliveryNet - costTotal;
  const profitTax = Math.max(0, taxableProfit) * Math.max(0, num(s.profitTaxRate)) / 100;

  /* 7. Итоги */
  const netProfit = discountedCash - costTotal - profitTax - vatPayable;
  const roi = costTotal > 0 ? netProfit / costTotal : 0;
  const effectivePrice = volume > 0 ? (netProfit + costTotal) / volume : 0;
  const priceDelta = price > 0 ? effectivePrice / price - 1 : 0;
  const margin = discountedCash > 0 ? netProfit / discountedCash : 0;

  return {
    volume, price, deliveryNet, vatOut, deliveryGross,
    unitCost, costTotal,
    retailTotal, offsetPrice, balance, balanceShare, developerDiscountPct: num(s.developerDiscount),
    q, c, o, quickSaleLoss, realtorCost, otherCost, saleCosts, cashNominal,
    months, monthlyRate, annualEquivalent, factor, discountedCash, timeLoss,
    vatPayable, taxableProfit, profitTax,
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
      <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-white p-3 transition hover:border-brand-400 dark:border-slate-700 dark:bg-[#0a1120]">
        <input type="checkbox" data-field="${f.key}" ${state[f.key] ? 'checked' : ''} class="mt-0.5 shrink-0" />
        <span class="min-w-0">
          <span class="block text-[13px] font-semibold text-slate-700 dark:text-slate-200">${f.label}</span>
          ${f.hint ? `<span class="mt-0.5 block text-[11px] leading-snug text-slate-400 dark:text-slate-500">${f.hint}</span>` : ''}
        </span>
      </label>`;
  }
  return `
    <label class="block">
      <span class="mb-1.5 flex items-baseline justify-between gap-2">
        <span class="text-[13px] font-medium text-slate-600 dark:text-slate-300">${f.label}</span>
        ${f.unit ? `<span class="shrink-0 text-[11px] font-semibold text-brand-600 dark:text-brand-400">${f.unit}</span>` : ''}
      </span>
      <input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
             data-field="${f.key}" value="${fmtInput(state[f.key])}" class="input-base" />
      ${f.hint ? `<span class="mt-1.5 block text-[11px] leading-snug text-slate-400 dark:text-slate-500">${f.hint}</span>` : ''}
    </label>`;
}

function renderInputs() {
  document.getElementById('inputSections').innerHTML = SECTIONS.map((sec) => `
    <details class="card input-card overflow-hidden" open>
      <summary class="flex items-center gap-3 p-4">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500/10 to-indigo-500/10 text-base dark:from-brand-500/20 dark:to-indigo-500/20">${sec.icon}</span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="truncate text-sm font-bold leading-tight">${sec.title}</span>
            <span class="chip chip--input shrink-0">ввод</span>
          </span>
          <span class="mt-0.5 block truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">${sec.desc}</span>
        </span>
        <svg class="chev h-4 w-4 shrink-0 text-slate-400 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div class="space-y-3.5 border-t border-slate-100 px-4 pb-4 pt-4 dark:border-slate-800">
        ${sec.fields.map(fieldHTML).join('')}
        <div class="calc-panel">
          <p class="mb-2 flex flex-wrap items-center gap-1.5">
            <span class="chip chip--auto">авто</span>
            <span class="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">рассчитывается автоматически</span>
          </p>
          <div data-summary="${sec.id}" class="grid grid-cols-2 gap-x-3 gap-y-2"></div>
        </div>
      </div>
    </details>`).join('');
}

function refreshInputValues() {
  document.querySelectorAll('[data-field]').forEach((el) => {
    const key = el.dataset.field;
    if (el.type === 'checkbox') el.checked = !!state[key];
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
    <div class="card auto-card flex flex-col p-3.5 sm:p-4">
      <div class="mb-1.5 flex items-center gap-2">
        <span class="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[13px] ${t.chip}">${icon}</span>
        <span class="chip chip--auto ml-auto shrink-0">авто</span>
      </div>
      <p class="text-[10.5px] font-bold uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400 sm:text-[11px]">${label}</p>
      <p class="tabular mt-1 truncate text-xl font-extrabold leading-tight sm:text-2xl ${t.text}" title="${value}">${value}</p>
      <p class="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">${sub}</p>
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

function renderVerdict(m) {
  const good = m.netProfit > 0 && m.roi > 0.15;
  const tight = m.netProfit > 0 && m.roi <= 0.15;
  const bad = m.netProfit <= 0;

  const cfg = good
    ? { tone: 'good', icon: '✅', title: 'Сделка экономически выгодна', text: `Завод получает ${money(m.netProfit)} чистой прибыли — это ${pct(m.roi)} доходности на вложенную себестоимость.` }
    : tight
      ? { tone: 'warn', icon: '⚠️', title: 'Сделка на грани: прибыль есть, но запас маленький', text: `Чистая прибыль ${money(m.netProfit)} (ROI ${pct(m.roi)}). Любой рост скидок или задержка продажи уведут сделку в минус.` }
      : { tone: 'bad', icon: '⛔', title: 'Сделка убыточна в текущих параметрах', text: `Убыток ${money(Math.abs(m.netProfit))}. Требуется изменить скидку застройщика, срок продажи или цены.` };

  const t = toneClasses(cfg.tone);
  document.getElementById('verdictWrap').innerHTML = `
    <div class="card auto-card animate-fade-up flex items-start gap-3 p-4 sm:items-center">
      <span class="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl ${t.chip}">${cfg.icon}</span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-extrabold leading-tight sm:text-base ${t.text}">${cfg.title}</p>
        <p class="mt-0.5 text-[12.5px] leading-snug text-slate-500 dark:text-slate-400">${cfg.text}</p>
      </div>
      <span class="chip chip--auto hidden shrink-0 sm:inline-flex">авто</span>
    </div>`;
}

function statTile(label, value, tone = 'default', sub = '') {
  const t = toneClasses(tone);
  return `
    <div class="card auto-card p-3">
      <p class="text-[10.5px] font-bold uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400">${label}</p>
      <p class="tabular mt-1 truncate text-[15px] font-bold ${t.text}" title="${value}">${value}</p>
      ${sub ? `<p class="mt-0.5 text-[10.5px] leading-tight text-slate-400 dark:text-slate-500">${sub}</p>` : ''}
    </div>`;
}

function renderStats(m) {
  const balanceTone = Math.abs(m.balanceShare) <= 0.02 ? 'good' : Math.abs(m.balanceShare) <= 0.1 ? 'warn' : 'bad';
  const balanceArrow = Math.abs(m.balanceShare) <= 0.02 ? '' : m.balance > 0 ? ' ↗' : ' ↘';
  const balanceSub = Math.abs(m.balanceShare) <= 0.02
    ? 'баланс сходится'
    : m.balance > 0 ? 'застройщик должен доплатить' : 'завод должен доплатить';

  document.getElementById('statGrid').innerHTML = [
    statTile('Стоимость поставки с НДС', money(m.deliveryGross), 'default', 'без НДС ' + money(m.deliveryNet)),
    statTile('Себестоимость ваты', money(m.costTotal), 'default', nf0.format(Math.round(m.unitCost)) + PER_M3),
    statTile('Цена зачёта квартир', money(m.offsetPrice), 'default', 'номинал ' + money(m.retailTotal)),
    statTile('Баланс взаимозачёта', money(Math.abs(m.balance)) + balanceArrow, balanceTone, balanceSub),
    statTile('Кэш при продаже сегодня', money(m.cashNominal), 'default', 'издержки ' + money(m.saleCosts)),
    statTile('Потери от заморозки', money(m.timeLoss), m.timeLoss > m.cashNominal * 0.12 ? 'bad' : 'warn', 'срок ' + nf1.format(m.months) + ' мес'),
    statTile('Приведённый кэш', money(m.discountedCash), 'default', 'реальные деньги'),
    statTile('КПН (налог на прибыль)', money(m.profitTax), m.profitTax > 0 ? 'warn' : 'default', 'база ' + money(Math.max(0, m.taxableProfit))),
    statTile('НДС к уплате', money(m.vatPayable), m.vatPayable > 0 ? 'warn' : 'good', m.vatPayable > 0 ? 'исходящий ' + money(m.vatOut) : 'переложен на покупателя'),
    statTile('Маржа по кэшу', pct(m.margin), m.margin > 0.15 ? 'good' : m.margin > 0 ? 'warn' : 'bad', 'от приведённого кэша'),
    statTile('Потери на времени', pct(m.cashNominal > 0 ? m.timeLoss / m.cashNominal : 0), 'warn', 'от суммы продажи'),
    statTile('Доходность альтернативы', pct(m.annualEquivalent), 'default', 'эквивалент в год')
  ].join('');
}

function renderSectionSummaries(m) {
  SECTIONS.forEach((sec) => {
    const host = document.querySelector(`[data-summary="${sec.id}"]`);
    if (!host || !sec.summary) return;
    host.innerHTML = sec.summary(m).map(([label, value]) => `
      <div class="min-w-0">
        <p class="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-400 dark:text-slate-500">${label}</p>
        <p class="tabular truncate text-[12.5px] font-bold text-slate-700 dark:text-slate-200" title="${value}">${value}</p>
      </div>`).join('');
  });
}

function renderInsights(m) {
  const items = [];

  /* Вердикт по балансу взаимозачёта */
  if (Math.abs(m.balanceShare) > 0.02) {
    items.push(m.balance > 0
      ? { tone: 'warn', icon: '⚖️', title: 'Баланс взаимозачёта не сходится', text: `Завод поставляет ваты на ${money(m.deliveryGross)}, а квартир получает на ${money(m.offsetPrice)}. Разница ${money(m.balance)} — застройщик должен доплатить деньгами.` }
      : { tone: 'bad', icon: '⚖️', title: 'Завод доплачивает застройщику', text: `Квартиры дороже поставки на ${money(Math.abs(m.balance))} (${pct(Math.abs(m.balanceShare))}). Нужно либо увеличить объём ваты, либо просить вторую квартиру/доплату.` });
  } else {
    items.push({ tone: 'good', icon: '⚖️', title: 'Баланс взаимозачёта сходится', text: `Расхождение всего ${money(Math.abs(m.balance))} (${pct(Math.abs(m.balanceShare))}) — стороны обмениваются равноценными активами.` });
  }

  /* Заморозка капитала */
  if (m.timeLoss > 0) {
    const share = m.cashNominal > 0 ? m.timeLoss / m.cashNominal : 0;
    items.push({
      tone: share > 0.15 ? 'bad' : share > 0.07 ? 'warn' : 'good',
      icon: '⏳',
      title: 'Заморозка денег: ' + money(m.timeLoss),
      text: `За ${nf1.format(m.months)} мес. ожидания при альтернативной доходности ${nf1.format(state.monthlyReturn)}%/мес. теряется ${pct(share)} ожидаемого кэша. Сокращение срока продажи — самый быстрый способ поднять выгоду.`
    });
  }

  /* НДС */
  if (m.vatPayable > 0) {
    items.push({
      tone: 'warn', icon: '🧾', title: 'НДС придётся заплатить деньгами',
      text: `К уплате ${money(m.vatPayable)}. Если удастся переложить НДС на покупателя или зачесть входящий НДС по квартирам, прибыль вырастет ровно на эту сумму.`
    });
  } else {
    items.push({
      tone: 'info', icon: '🧾', title: 'НДС не уменьшает прибыль',
      text: 'НДС по поставке перекладывается на покупателя. Если часть налога придётся платить деньгами — включите переключатель в блоке «Налоги и НДС».'
    });
  }

  /* Структура издержек продажи */
  if (m.saleCosts > 0) {
    items.push({
      tone: m.saleCosts > m.discountedCash ? 'bad' : 'info',
      icon: '💸', title: 'Издержки продажи: ' + pct(m.cashNominal > 0 ? m.saleCosts / m.retailTotal : 0),
      text: `Дисконт ${money(m.quickSaleLoss)}, риелтор ${money(m.realtorCost)}, прочие расходы ${money(m.otherCost)}. Итого ${money(m.saleCosts)} от номинала квартир.`
    });
  }

  /* Себестоимость против поставки */
  if (m.deliveryNet > 0) {
    const grossMargin = (m.deliveryNet - m.costTotal) / m.deliveryNet;
    items.push({
      tone: grossMargin > 0.2 ? 'good' : grossMargin > 0 ? 'warn' : 'bad',
      icon: '🏭',
      title: 'Маржа производства ' + pct(grossMargin),
      text: `Стоимость поставки без НДС ${money(m.deliveryNet)} против себестоимости ${money(m.costTotal)}. Валовая прибыль ${money(m.deliveryNet - m.costTotal)}.`
    });
  }

  /* Эффективная цена */
  if (m.volume > 0 && m.price > 0) {
    items.push({
      tone: m.priceDelta >= 0 ? 'good' : 'warn',
      icon: '🎯',
      title: 'Эффективная цена ' + nf0.format(Math.round(m.effectivePrice)) + PER_M3,
      text: m.priceDelta >= 0
        ? `Это на ${pct(m.priceDelta)} выше прайсовой цены ${money(m.price)} за м³ — бартер выгоднее прямой продажи за деньги.`
        : `Это на ${pct(Math.abs(m.priceDelta))} ниже прайсовой цены ${money(m.price)} за м³ — фактически завод даёт скидку покупателю.`
    });
  }

  document.getElementById('insights').innerHTML = items.map((it) => {
    const t = toneClasses(it.tone);
    return `
      <div class="card auto-card flex items-start gap-3 p-3.5">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base ${t.chip}">${it.icon}</span>
        <div class="min-w-0">
          <p class="text-[12.5px] font-bold leading-tight ${t.text}">${it.title}</p>
          <p class="mt-0.5 text-[12px] leading-snug text-slate-500 dark:text-slate-400">${it.text}</p>
        </div>
      </div>`;
  }).join('');
}

function renderDetails(m) {
  const rows = [
    ['Стоимость поставки без НДС', money(m.deliveryNet), `${nf0.format(m.volume)} м³ × ${nf0.format(m.price)} ${CURRENCY}`],
    ['НДС исходящий', money(m.vatOut), `${nf1.format(state.vatRate)}% от стоимости без НДС`],
    ['Стоимость поставки с НДС', money(m.deliveryGross), 'сумма к взаимозачёту'],
    ['Себестоимость 1 м³', money(m.unitCost), 'сырьё + ФОТ со взносами + энергия + накладные'],
    ['Себестоимость всего объёма', money(m.costTotal), 'вложения завода'],
    ['Прибыль от реализации', money(m.deliveryNet - m.costTotal), 'без НДС минус себестоимость'],
    ['Номинальная стоимость квартир', money(m.retailTotal), `${nf0.format(state.apartmentsCount)} шт × ${nf0.format(state.apartmentPrice)} ${CURRENCY}`],
    ['Цена зачёта квартир', money(m.offsetPrice), `скидка застройщика ${nf1.format(state.developerDiscount)}%`],
    ['Баланс взаимозачёта', money(m.balance), `доля расхождения ${pct(Math.abs(m.balanceShare))}`],
    ['Кэш при продаже без учёта времени', money(m.cashNominal), 'номинал минус издержки продажи'],
    ['Потери от заморозки', money(m.timeLoss), `${nf1.format(m.months)} мес при ${nf1.format(state.monthlyReturn)}%/мес`],
    ['Приведённый (реальный) кэш', money(m.discountedCash), 'фактически полученные деньги'],
    ['КПН (корпоративный подоходный налог)', money(m.profitTax), `ставка ${nf1.format(state.profitTaxRate)}% · база ${money(Math.max(0, m.taxableProfit))}`],
    ['НДС к уплате', money(m.vatPayable), state.vatPayableOn ? `вычет ${money(state.inputVat)}` : 'переложен на покупателя'],
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
    ch = new Chart(el, { type, data: spec.data, options: spec.options });
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

/* --- 1. Водопад: от номинала квартир к чистой прибыли ---------------------- */
function waterfallSpec(m, t) {
  const steps = [];
  let cursor = m.retailTotal;

  steps.push({ label: 'Номинал квартир', from: 0, to: cursor, kind: 'total' });
  const push = (label, amount, kind) => {
    if (Math.abs(amount) < 0.5) return;
    const next = cursor - amount;
    steps.push({ label, from: next, to: cursor, kind });
    cursor = next;
  };
  push('Скидка быстрой продажи', m.quickSaleLoss, 'minus');
  push('Комиссия риелтора', m.realtorCost, 'minus');
  push('Прочие расходы', m.otherCost, 'minus');
  steps.push({ label: 'Кэш при продаже', from: 0, to: cursor, kind: 'subtotal' });
  push('Потери от заморозки', m.timeLoss, 'minus');
  steps.push({ label: 'Приведённый кэш', from: 0, to: cursor, kind: 'subtotal' });
  push('Себестоимость ваты', m.costTotal, 'minus');
  push('КПН', m.profitTax, 'minus');
  push('НДС к уплате', m.vatPayable, 'minus');
  steps.push({ label: 'Чистая прибыль', from: 0, to: cursor, kind: cursor >= 0 ? 'profit' : 'loss' });

  const colorOf = (kind) => ({
    total: C.brand, subtotal: C.violet, minus: C.loss,
    profit: C.profit, loss: C.loss
  }[kind] || C.cost);

  return {
    data: {
      labels: steps.map((s) => s.label),
      datasets: [{
        label: 'Сумма',
        data: steps.map((s) => [Math.min(s.from, s.to), Math.max(s.from, s.to)]),
        backgroundColor: steps.map((s) => colorOf(s.kind) + 'e6'),
        hoverBackgroundColor: steps.map((s) => colorOf(s.kind)),
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.72,
        categoryPercentage: 0.85
      }]
    },
    options: baseOptions(t, {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.tooltipBg, titleColor: t.tooltipTitle, bodyColor: t.tooltipBody,
          borderColor: t.border, borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: false,
          callbacks: {
            label: (ctx) => {
              const [a, b] = ctx.raw;
              const step = steps[ctx.dataIndex];
              const isTotal = step.kind === 'total' || step.kind === 'subtotal' || step.kind === 'profit' || step.kind === 'loss';
              return isTotal ? ' Итог: ' + money(b) : ' Изменение: −' + money(Math.abs(b - a));
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: t.grid, drawBorder: false },
          border: { display: false },
          ticks: { color: t.muted, font: { size: 10.5 }, callback: (v) => nfShort.format(v), maxTicksLimit: 7 }
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: t.text, font: { size: 11.5, weight: '600' }, crossAlign: 'far' }
        }
      }
    })
  };
}

/* --- 2. Пончик: структура стоимости квартир -------------------------------- */
function doughnutSpec(m, t) {
  const slices = [
    { label: 'Скидка быстрой продажи', value: m.quickSaleLoss, color: C.qsale },
    { label: 'Комиссия риелтора', value: m.realtorCost, color: C.realtor },
    { label: 'Прочие расходы', value: m.otherCost, color: C.other },
    { label: 'Потери от заморозки', value: m.timeLoss, color: C.time },
    { label: 'Себестоимость ваты', value: m.costTotal, color: C.cost },
    { label: 'КПН', value: m.profitTax, color: C.tax },
    { label: 'НДС к уплате', value: m.vatPayable, color: C.vat },
    { label: m.netProfit >= 0 ? 'Чистая прибыль' : 'Убыток', value: Math.abs(m.netProfit), color: m.netProfit >= 0 ? C.profit : C.loss }
  ].filter((s) => s.value > 0.5);

  const total = slices.reduce((a, s) => a + s.value, 0);

  if (!slices.length) {
    return {
      data: { labels: ['Нет данных'], datasets: [{ data: [1], backgroundColor: ['#cbd5e1'], borderWidth: 0 }] },
      options: baseOptions(t, {
        cutout: '64%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      })
    };
  }

  return {
    data: {
      labels: slices.map((s) => s.label),
      datasets: [{
        data: slices.map((s) => s.value),
        backgroundColor: slices.map((s) => s.color),
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: baseOptions(t, {
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: t.muted, boxWidth: 10, boxHeight: 10, usePointStyle: true,
            pointStyle: 'circle', padding: 10, font: { size: 11, weight: '600' }
          }
        },
        tooltip: {
          backgroundColor: t.tooltipBg, titleColor: t.tooltipTitle, bodyColor: t.tooltipBody,
          borderColor: t.border, borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: false,
          callbacks: {
            label: (ctx) => ' ' + money(ctx.parsed) + '  ·  ' + pct(total > 0 ? ctx.parsed / total : 0)
          }
        }
      }
    })
  };
}

/* --- 3. Ключевые суммы ----------------------------------------------------- */
function barsSpec(m, t) {
  const rows = [
    ['Номинал квартир', m.retailTotal, C.brand],
    ['Цена зачёта', m.offsetPrice, C.indigo],
    ['Поставка с НДС', m.deliveryGross, C.sky],
    ['Себестоимость ваты', m.costTotal, C.cost],
    ['Приведённый кэш', m.discountedCash, C.violet],
    ['Чистая прибыль', m.netProfit, m.netProfit >= 0 ? C.profit : C.loss]
  ];

  return {
    data: {
      labels: rows.map((r) => r[0]),
      datasets: [{
        data: rows.map((r) => r[1]),
        backgroundColor: rows.map((r) => r[2] + 'd9'),
        hoverBackgroundColor: rows.map((r) => r[2]),
        borderRadius: 7,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.85
      }]
    },
    options: baseOptions(t, {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.tooltipBg, titleColor: t.tooltipTitle, bodyColor: t.tooltipBody,
          borderColor: t.border, borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: false,
          callbacks: { label: (ctx) => ' ' + money(ctx.parsed.x) }
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
          ticks: { color: t.text, font: { size: 11.5, weight: '600' } }
        }
      }
    })
  };
}

/* --- 4. Зависимость от срока продажи -------------------------------------- */
function termSpec(t) {
  const points = new Set();
  for (let i = 0; i <= 12; i++) points.add(i * 3);
  points.add(Math.max(0, Math.round(state.saleMonths)));
  const list = Array.from(points).filter((v) => v >= 0).sort((a, b) => a - b);

  const profits = list.map((x) => calc(Object.assign({}, state, { saleMonths: x })).netProfit);
  const cash = list.map((x) => calc(Object.assign({}, state, { saleMonths: x })).discountedCash);

  const current = list.indexOf(Math.max(0, Math.round(state.saleMonths)));

  const pt = (color) => (ctx) => ctx.dataIndex === current ? 6 : 0;
  const ptColor = (color) => (ctx) => ctx.dataIndex === current ? color : 'transparent';

  return {
    data: {
      labels: list.map((x) => x + ' мес'),
      datasets: [
        {
          label: 'Чистая прибыль',
          data: profits,
          borderColor: C.profit,
          backgroundColor: C.profit,
          borderWidth: 2.5,
          tension: 0.35,
          fill: false,
          pointRadius: pt(C.profit),
          pointHoverRadius: 6,
          pointBackgroundColor: ptColor(C.profit)
        },
        {
          label: 'Приведённый кэш',
          data: cash,
          borderColor: C.violet,
          backgroundColor: C.violet,
          borderWidth: 2,
          borderDash: [5, 4],
          tension: 0.35,
          fill: false,
          pointRadius: pt(C.violet),
          pointHoverRadius: 6,
          pointBackgroundColor: ptColor(C.violet)
        }
      ]
    },
    options: baseOptions(t, {
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: t.muted, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 11, weight: '600' } }
        },
        tooltip: {
          backgroundColor: t.tooltipBg, titleColor: t.tooltipTitle, bodyColor: t.tooltipBody,
          borderColor: t.border, borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: true, boxWidth: 8, boxHeight: 8, usePointStyle: true,
          callbacks: {
            label: (ctx) => ' ' + ctx.dataset.label + ': ' + money(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false }, border: { display: false },
          ticks: { color: t.muted, font: { size: 10.5 }, maxTicksLimit: 8 }
        },
        y: {
          grid: { color: t.grid, drawBorder: false }, border: { display: false },
          ticks: { color: t.muted, font: { size: 10.5 }, callback: (v) => nfShort.format(v), maxTicksLimit: 6 }
        }
      }
    })
  };
}

/* --- 5. Чувствительность к скидке при продаже ------------------------------ */
function sensSpec(t) {
  const list = [];
  for (let v = 0; v <= 35.0001; v += 2.5) list.push(Math.round(v * 10) / 10);
  const cur = clamp(state.quickSaleDiscount, 0, 35);
  if (!list.some((v) => Math.abs(v - cur) < 0.05)) { list.push(Math.round(cur * 10) / 10); list.sort((a, b) => a - b); }

  const profits = list.map((x) => calc(Object.assign({}, state, { quickSaleDiscount: x })).netProfit);
  const current = list.findIndex((v) => Math.abs(v - Math.round(cur * 10) / 10) < 0.0001);

  return {
    data: {
      labels: list.map((x) => nf1.format(x) + '%'),
      datasets: [{
        label: 'Чистая прибыль',
        data: profits,
        borderColor: C.brand,
        backgroundColor: 'rgba(59,130,246,.14)',
        borderWidth: 2.5,
        tension: 0.3,
        fill: true,
        pointRadius: (ctx) => ctx.dataIndex === current ? 6 : 0,
        pointHoverRadius: 6,
        pointBackgroundColor: () => C.brand
      }]
    },
    options: baseOptions(t, {
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.tooltipBg, titleColor: t.tooltipTitle, bodyColor: t.tooltipBody,
          borderColor: t.border, borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: false,
          callbacks: { label: (ctx) => ' Прибыль: ' + money(ctx.parsed.y) }
        }
      },
      scales: {
        x: {
          grid: { display: false }, border: { display: false },
          ticks: { color: t.muted, font: { size: 10.5 }, maxTicksLimit: 8 },
          title: { display: true, text: 'Скидка для быстрой продажи', color: t.muted, font: { size: 10.5, weight: '600' } }
        },
        y: {
          grid: { color: t.grid, drawBorder: false }, border: { display: false },
          ticks: { color: t.muted, font: { size: 10.5 }, callback: (v) => nfShort.format(v), maxTicksLimit: 6 }
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
  renderVerdict(m);
  renderHero(m);
  renderStats(m);
  renderSectionSummaries(m);
  renderInsights(m);
  renderDetails(m);

  const t = themeTokens();
  renderChart('waterfall', 'chartWaterfall', 'bar', waterfallSpec(m, t));
  renderChart('doughnut', 'chartDoughnut', 'doughnut', doughnutSpec(m, t));
  renderChart('bars', 'chartBars', 'bar', barsSpec(m, t));
  renderChart('term', 'chartTerm', 'line', termSpec(t));
  renderChart('sens', 'chartSens', 'line', sensSpec(t));
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

function bindInputs() {
  const host = document.getElementById('inputSections');

  host.addEventListener('input', (e) => {
    const el = e.target.closest('[data-field]');
    if (!el || el.type === 'checkbox') return;
    state[el.dataset.field] = readInput(el);
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
    el.value = fmtInput(v);
    render();
    scheduleSave();
  });
}

function applyPreset(name) {
  const p = PRESETS[name] || {};
  state = Object.assign({}, DEFAULTS, p);
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
    btnTheme.innerHTML = document.documentElement.classList.contains('dark') ? sunIcon : moonIcon;
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
  renderInputs();
  bindInputs();
  bindToolbar();
  bindShare();
  render();
})();
