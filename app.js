const REQUIRED_SOURCES = {
  restaurant: ["Google", "Yelp", "Michelin", "TripAdvisor"],
  hotel: ["Google", "Booking", "Agoda", "TripAdvisor"],
};

const PROVIDER_BATCH_SOURCES = ["tripadvisor", "booking", "yelp", "michelin", "brave", "tavily", "gemini"];

const USER_RATINGS_STORAGE_KEY = "poi-ratings:user-ratings";

const PLATFORM_SEARCH_URLS = {
  Agoda: (poi) => `https://www.agoda.com/search?text=${encodeURIComponent(`${poi.name} ${poi.city}`)}`,
  Booking: (poi) => `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${poi.name} ${poi.city}`)}`,
  Google: (poi) => `https://www.google.com/maps/search/${encodeURIComponent(`${poi.name} ${poi.city}`)}`,
  Michelin: (poi) => `https://guide.michelin.com/us/en/search?q=${encodeURIComponent(`${poi.name} ${poi.city}`)}`,
  TripAdvisor: (poi) => `https://www.tripadvisor.com/Search?q=${encodeURIComponent(`${poi.name} ${poi.city}`)}`,
  Yelp: (poi) => `https://www.yelp.com/search?find_desc=${encodeURIComponent(poi.name)}&find_loc=${encodeURIComponent(poi.city)}`,
};

const poiData = [
  {
    id: "jardin-bleu",
    type: "restaurant",
    name: "Jardin Bleu",
    city: "上海",
    area: "静安区",
    category: "现代法餐 · 米其林",
    description: "适合商务晚餐和纪念日的现代法餐，酒单强，甜品评价稳定。",
    price: "人均 980 CNY",
    tags: ["米其林", "法餐", "Booking"],
    ratings: {
      Google: { score: 4.6, max: 5, reviews: 1842, updated: "2026-05-12" },
      Yelp: { score: 4.4, max: 5, reviews: 318, updated: "2026-04-28" },
      Michelin: { score: 1, max: 3, label: "1 星", reviews: null, updated: "2026 指南" },
      TripAdvisor: { score: 4.5, max: 5, reviews: 906, updated: "2026-05-08" },
    },
  },
  {
    id: "sumire-tokyo",
    type: "restaurant",
    name: "Sumire Tokyo",
    city: "Tokyo",
    area: "Ginza",
    category: "寿司 · Omakase",
    description: "小体量吧台寿司店，Google 和 TripAdvisor 分数接近，Yelp 评论量较少。",
    price: "人均 28,000 JPY",
    tags: ["寿司", "Omakase"],
    ratings: {
      Google: { score: 4.8, max: 5, reviews: 1290, updated: "2026-05-11" },
      Yelp: { score: 4.2, max: 5, reviews: 96, updated: "2026-04-20" },
      Michelin: { score: 0, max: 3, label: "入选", reviews: null, updated: "2026 指南" },
      TripAdvisor: { score: 4.7, max: 5, reviews: 544, updated: "2026-05-04" },
    },
  },
  {
    id: "ember-table",
    type: "restaurant",
    name: "Ember Table",
    city: "New York",
    area: "SoHo",
    category: "美式炭火 · 酒吧",
    description: "高热度餐酒馆，Yelp 评论更活跃，米其林来源暂未收录。",
    price: "人均 110 USD",
    tags: ["美式", "Yelp"],
    ratings: {
      Google: { score: 4.3, max: 5, reviews: 3215, updated: "2026-05-10" },
      Yelp: { score: 4.6, max: 5, reviews: 1880, updated: "2026-05-14" },
      TripAdvisor: { score: 4.1, max: 5, reviews: 702, updated: "2026-05-02" },
    },
  },
  {
    id: "the-riverhouse",
    type: "hotel",
    name: "The Riverhouse Shanghai",
    city: "上海",
    area: "外滩",
    category: "精品酒店 · 江景",
    description: "江景房和早餐反馈较好，Booking 与 Agoda 的评分略高于 Google。",
    price: "每晚 1,860 CNY 起",
    tags: ["Booking", "Agoda", "江景"],
    ratings: {
      Google: { score: 4.5, max: 5, reviews: 2103, updated: "2026-05-13" },
      Booking: { score: 9.1, max: 10, reviews: 1386, updated: "2026-05-15" },
      Agoda: { score: 9.0, max: 10, reviews: 1650, updated: "2026-05-12" },
      TripAdvisor: { score: 4.5, max: 5, reviews: 1198, updated: "2026-05-09" },
    },
  },
  {
    id: "nami-hotel",
    type: "hotel",
    name: "Nami Hotel Tokyo",
    city: "Tokyo",
    area: "Shinjuku",
    category: "商务酒店 · 近车站",
    description: "交通便利，适合短住。Agoda 评论量最高，TripAdvisor 最新评价偏谨慎。",
    price: "每晚 24,500 JPY 起",
    tags: ["Agoda", "商务"],
    ratings: {
      Google: { score: 4.2, max: 5, reviews: 3404, updated: "2026-05-09" },
      Booking: { score: 8.7, max: 10, reviews: 2507, updated: "2026-05-14" },
      Agoda: { score: 8.9, max: 10, reviews: 4270, updated: "2026-05-16" },
      TripAdvisor: { score: 4.0, max: 5, reviews: 802, updated: "2026-05-01" },
    },
  },
  {
    id: "casa-lumen",
    type: "hotel",
    name: "Casa Lumen Barcelona",
    city: "Barcelona",
    area: "Eixample",
    category: "设计酒店 · 露台",
    description: "设计感强，Booking 表现突出；Agoda 暂无足够有效评分。",
    price: "每晚 230 EUR 起",
    tags: ["Booking", "设计酒店"],
    ratings: {
      Google: { score: 4.4, max: 5, reviews: 972, updated: "2026-05-07" },
      Booking: { score: 9.3, max: 10, reviews: 740, updated: "2026-05-15" },
      TripAdvisor: { score: 4.6, max: 5, reviews: 512, updated: "2026-05-05" },
    },
  },
];

const state = {
  query: "",
  type: "all",
  selectedId: poiData[0].id,
  userSelectedPoi: false,
  providerLookup: null,
  googlePois: [],
  tripAdvisorPois: [],
  bookingPois: [],
  yelpPois: [],
  michelinPois: [],
  geminiPois: [],
  bravePois: [],
  tavilyPois: [],
  isSearchingGoogle: false,
  isSearchingTripAdvisor: false,
  isSearchingBooking: false,
  isSearchingYelp: false,
  isSearchingMichelin: false,
  isSearchingGemini: false,
  isSearchingBrave: false,
  isSearchingTavily: false,
  googleStatus: "loading",
  googleError: "",
  googleFallbackSignature: "",
  tripAdvisorStatus: "ready",
  tripAdvisorError: "",
  bookingStatus: "ready",
  bookingError: "",
  yelpStatus: "ready",
  yelpError: "",
  michelinStatus: "ready",
  michelinError: "",
  geminiStatus: "ready",
  geminiError: "",
  geminiPlatformStatus: {},
  braveStatus: "ready",
  braveError: "",
  bravePlatformStatus: {},
  tavilyStatus: "ready",
  tavilyError: "",
  tavilyPlatformStatus: {},
  knowBeforeYouGo: null,
  knowBeforeYouGoStatus: "idle",
  knowBeforeYouGoError: "",
  knowBeforeYouGoSignature: "",
  knowBeforeYouGoCache: null,
  providerBatchId: 0,
  providerPendingCount: 0,
  providerTotalCount: 0,
  userRatings: loadUserRatings(),
};

const elements = {
  searchInput: document.querySelector("#searchInput"),
  typeTabs: document.querySelectorAll(".type-tab"),
  quickFilters: document.querySelector(".quick-filters"),
  poiList: document.querySelector("#poiList"),
  detailView: document.querySelector("#detailView"),
  resultCount: document.querySelector("#resultCount"),
  emptyTemplate: document.querySelector("#emptyTemplate"),
  googleStatus: document.querySelector("#googleStatus"),
  tripAdvisorStatus: document.querySelector("#tripAdvisorStatus"),
  bookingStatus: document.querySelector("#bookingStatus"),
  yelpStatus: document.querySelector("#yelpStatus"),
  michelinStatus: document.querySelector("#michelinStatus"),
  geminiStatus: document.querySelector("#geminiStatus"),
  braveStatus: document.querySelector("#braveStatus"),
  tavilyStatus: document.querySelector("#tavilyStatus"),
  runtimeNotice: document.querySelector("#runtimeNotice"),
};

let googlePlacesService = null;
let googleAutocompleteService = null;
let googleSearchTimer = null;
let googleSearchToken = 0;
let googleFallbackTimer = null;
let tripAdvisorSearchTimer = null;
let tripAdvisorSearchToken = 0;
let bookingSearchTimer = null;
let bookingSearchToken = 0;
let yelpSearchTimer = null;
let yelpSearchToken = 0;
let michelinSearchTimer = null;
let michelinSearchToken = 0;
let geminiSearchTimer = null;
let geminiSearchToken = 0;
let braveSearchTimer = null;
let braveSearchToken = 0;
let tavilySearchTimer = null;
let tavilySearchToken = 0;
let knowBeforeYouGoTimer = null;
let knowBeforeYouGoToken = 0;

function isFileRuntime() {
  return window.location.protocol === "file:";
}

function loadUserRatings() {
  try {
    return JSON.parse(localStorage.getItem(USER_RATINGS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveUserRatings() {
  localStorage.setItem(USER_RATINGS_STORAGE_KEY, JSON.stringify(state.userRatings));
}

function normalizeScore(rating) {
  if (!rating) return 0;
  return Math.round((rating.score / rating.max) * 100);
}

function averageScore(poi) {
  const values = Object.values(poi.ratings).filter((rating) => rating.score > 0);
  if (!values.length) return 0;
  const total = values.reduce((sum, rating) => sum + normalizeScore(rating), 0);
  return Math.round(total / values.length);
}

function formatReviewCount(reviews) {
  if (reviews === null || reviews === undefined) return "专家评定";
  return `${reviews.toLocaleString("zh-CN")} 条评价`;
}

function formatRating(rating) {
  if (!rating) return "未收录";
  if (rating.label) return rating.label;
  return rating.score.toFixed(1);
}

function sourceSummary(poi) {
  return REQUIRED_SOURCES[poi.type]
    .map((source) => {
      const rating = poi.ratings[source];
      return {
        source,
        value: formatRating(rating),
      };
    })
    .slice(0, 4);
}

function normalizeText(value) {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
}

function getPoiMergeKey(poi) {
  return `${poi.type}:${normalizeText(poi.name)}`;
}

function getPoiRank(poi, normalizedQuery) {
  const normalizedName = normalizeText(poi.name);
  const requiredSources = REQUIRED_SOURCES[poi.type] || [];
  const sourceCoverage = requiredSources.filter((source) => poi.ratings[source]).length;
  let rank = sourceCoverage * 25;

  if (normalizedQuery) {
    if (normalizedName === normalizedQuery) {
      rank += 1200;
    } else if (normalizedName.startsWith(normalizedQuery)) {
      rank += 700;
    } else if (normalizedName.includes(normalizedQuery)) {
      rank += 350;
    }
  }

  if (poi.ratings.Google?.score > 0) rank += 500;
  if (poi.ratings.TripAdvisor?.score > 0) rank += 120;
  if (poi.ratings.Yelp?.score > 0) rank += 80;
  if (poi.ratings.Michelin) rank += 60;
  if (poi.ratings.Booking?.score > 0 || poi.ratings.Agoda?.score > 0) rank += 80;

  return rank;
}

function getUserRatingKey(poi, source) {
  return `${getPoiMergeKey(poi)}:${source}`;
}

function applyUserRatings(poi) {
  const ratings = { ...poi.ratings };

  REQUIRED_SOURCES[poi.type].forEach((source) => {
    const userRating = state.userRatings[getUserRatingKey(poi, source)];
    if (userRating) {
      ratings[source] = userRating;
    }
  });

  return { ...poi, ratings };
}

function clearProviderResults() {
  clearTimeout(tripAdvisorSearchTimer);
  clearTimeout(bookingSearchTimer);
  clearTimeout(yelpSearchTimer);
  clearTimeout(michelinSearchTimer);
  clearTimeout(geminiSearchTimer);
  clearTimeout(braveSearchTimer);
  clearTimeout(tavilySearchTimer);
  clearTimeout(knowBeforeYouGoTimer);

  tripAdvisorSearchToken += 1;
  bookingSearchToken += 1;
  yelpSearchToken += 1;
  michelinSearchToken += 1;
  geminiSearchToken += 1;
  braveSearchToken += 1;
  tavilySearchToken += 1;
  knowBeforeYouGoToken += 1;
  state.providerBatchId += 1;
  state.providerPendingCount = 0;
  state.providerTotalCount = 0;

  state.tripAdvisorPois = [];
  state.bookingPois = [];
  state.yelpPois = [];
  state.michelinPois = [];
  state.geminiPois = [];
  state.bravePois = [];
  state.tavilyPois = [];
  state.tripAdvisorStatus = "ready";
  state.tripAdvisorError = "";
  state.bookingStatus = "ready";
  state.bookingError = "";
  state.yelpStatus = "ready";
  state.yelpError = "";
  state.michelinStatus = "ready";
  state.michelinError = "";
  state.geminiStatus = "ready";
  state.geminiError = "";
  state.geminiPlatformStatus = {};
  state.braveStatus = "ready";
  state.braveError = "";
  state.bravePlatformStatus = {};
  state.tavilyStatus = "ready";
  state.tavilyError = "";
  state.tavilyPlatformStatus = {};
  state.knowBeforeYouGo = null;
  state.knowBeforeYouGoStatus = "idle";
  state.knowBeforeYouGoError = "";
  state.knowBeforeYouGoSignature = "";
  state.knowBeforeYouGoCache = null;
}

function beginProviderBatch() {
  state.providerBatchId += 1;
  state.providerPendingCount = PROVIDER_BATCH_SOURCES.length;
  state.providerTotalCount = PROVIDER_BATCH_SOURCES.length;
  state.knowBeforeYouGo = null;
  state.knowBeforeYouGoStatus = "waiting";
  state.knowBeforeYouGoError = "";
  state.knowBeforeYouGoSignature = "";
  state.knowBeforeYouGoCache = null;
  clearTimeout(knowBeforeYouGoTimer);
  knowBeforeYouGoToken += 1;
  return state.providerBatchId;
}

function finishProviderBatchSource(batchId) {
  if (batchId !== state.providerBatchId || state.providerPendingCount <= 0) return;

  state.providerPendingCount = Math.max(0, state.providerPendingCount - 1);

  if (state.providerPendingCount === 0) {
    const hadReadySummary = state.knowBeforeYouGoStatus === "ready";
    if (state.knowBeforeYouGoStatus !== "ready") {
      state.knowBeforeYouGoStatus = "idle";
    }
    maybeGenerateKnowBeforeYouGo();
    if (hadReadySummary) render();
  }
}

function mergeProviderRatingsIntoPoi(basePoi) {
  if (!basePoi) return null;

  const merged = {
    ...basePoi,
    ratings: { ...basePoi.ratings },
    tags: [...basePoi.tags],
  };

  const providerPois = [
    ...state.geminiPois,
    ...state.bravePois,
    ...state.tavilyPois,
    ...state.yelpPois,
    ...state.bookingPois,
    ...state.michelinPois,
    ...state.tripAdvisorPois,
  ];

  providerPois.forEach((poi) => {
    merged.ratings = { ...merged.ratings, ...poi.ratings };
    merged.tags = Array.from(new Set([...merged.tags, ...poi.tags]));
    merged.tripAdvisorUrl = merged.tripAdvisorUrl || poi.tripAdvisorUrl;
    merged.bookingUrl = merged.bookingUrl || poi.bookingUrl;
    merged.michelinUrl = merged.michelinUrl || poi.michelinUrl;
    merged.photoUrl = merged.photoUrl || poi.photoUrl;
  });

  return applyUserRatings(merged);
}

function mergeLivePois() {
  const merged = new Map();

  [...state.googlePois, ...state.tripAdvisorPois, ...state.bookingPois, ...state.yelpPois, ...state.michelinPois, ...state.geminiPois, ...state.bravePois, ...state.tavilyPois].forEach((poi) => {
    const key = getPoiMergeKey(poi);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...poi, ratings: { ...poi.ratings } });
      return;
    }

    existing.ratings = { ...poi.ratings, ...existing.ratings };
    existing.tags = Array.from(new Set([...existing.tags, ...poi.tags]));
    existing.tripAdvisorUrl = existing.tripAdvisorUrl || poi.tripAdvisorUrl;
    existing.bookingUrl = existing.bookingUrl || poi.bookingUrl;
    existing.michelinUrl = existing.michelinUrl || poi.michelinUrl;
    existing.photoUrl = existing.photoUrl || poi.photoUrl;
    existing.description =
      existing.description.includes("其他平台") && !poi.description.includes("其他平台")
        ? poi.description
        : existing.description;
  });

  return Array.from(merged.values());
}

function getFilteredPois() {
  const query = state.query.trim().toLowerCase();
  const normalizedQuery = normalizeText(state.query);
  if (query.length >= 2) {
    return state.googlePois
      .filter((poi) => state.type === "all" || poi.type === state.type)
      .sort((a, b) => getPoiRank(b, normalizedQuery) - getPoiRank(a, normalizedQuery))
      .map(applyUserRatings);
  }

  const localPois = poiData.filter((poi) => {
    const matchesType = state.type === "all" || poi.type === state.type;
    const haystack = [
      poi.name,
      poi.city,
      poi.area,
      poi.category,
      poi.price,
      ...poi.tags,
      ...Object.keys(poi.ratings),
    ]
      .join(" ")
      .toLowerCase();
    return matchesType && (!query || haystack.includes(query));
  });

  const livePois = mergeLivePois().filter((poi) => {
    return state.type === "all" || poi.type === state.type;
  });

  const seen = new Set();
  return [...livePois, ...localPois].filter((poi) => {
    const key = `${poi.type}:${poi.name.toLowerCase()}:${poi.city.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => getPoiRank(b, normalizedQuery) - getPoiRank(a, normalizedQuery)).map(applyUserRatings);
}

function selectPoi(id) {
  state.selectedId = id;
  state.userSelectedPoi = true;
  const selectedPoi = getFilteredPois().find((poi) => poi.id === id);
  const cacheIdentity = selectedPoi ? getKnowBeforeCacheIdentity(selectedPoi, selectedPoi) : null;
  state.providerLookup = selectedPoi
    ? {
        id: selectedPoi.id,
        query: selectedPoi.name,
        type: selectedPoi.type,
        city: selectedPoi.city,
        poiId: cacheIdentity?.id || selectedPoi.id,
        poiSource: cacheIdentity?.source || "local",
      }
    : null;
  clearProviderResults();
  render();
  tryLoadCachedKnowBeforeYouGo(selectedPoi);
  searchProviderSourcesForSelected(selectedPoi);
}

function renderPoiList(pois) {
  elements.resultCount.textContent = `${pois.length} 个`;
  elements.poiList.innerHTML = "";

  pois.forEach((poi) => {
    const card = document.createElement("button");
    card.className = `poi-card ${poi.id === state.selectedId ? "is-selected" : ""}`;
    card.type = "button";
    card.addEventListener("click", () => selectPoi(poi.id));

    const miniScores = sourceSummary(poi)
      .map(
        ({ source, value }) => `
          <div class="mini-score">
            <strong>${value}</strong>
            <span>${source}</span>
          </div>
        `,
      )
      .join("");

    card.innerHTML = `
      <div class="poi-title-row">
        <h3>${poi.name}</h3>
        <span class="tag">${poi.type === "restaurant" ? "餐厅" : "酒店"}</span>
      </div>
      <p class="poi-meta">${poi.city} · ${poi.area}<br>${poi.category}</p>
      <div class="mini-scores">${miniScores}</div>
    `;
    elements.poiList.append(card);
  });
}

function renderVisual(poi) {
  if (poi.photoUrl) {
    return `
      <div class="visual-card">
        <img src="${poi.photoUrl}" alt="${poi.name}" loading="lazy" />
      </div>
    `;
  }

  const isHotel = poi.type === "hotel";
  const colors = isHotel
    ? ["#315b9d", "#e7eef7", "#98a9c7", "#f8fafc"]
    : ["#1d6f5f", "#f4eee1", "#c78635", "#fbfaf6"];
  const title = isHotel ? "Hotel rating visual" : "Restaurant rating visual";

  return `
    <div class="visual-card" aria-label="${title}">
      <svg viewBox="0 0 260 200" role="img" aria-hidden="true">
        <rect width="260" height="200" fill="${colors[3]}"></rect>
        <rect x="20" y="24" width="220" height="152" rx="8" fill="${colors[1]}" stroke="${colors[2]}"></rect>
        <rect x="44" y="48" width="76" height="104" rx="6" fill="${colors[0]}" opacity="0.92"></rect>
        <rect x="136" y="48" width="80" height="16" rx="4" fill="${colors[0]}" opacity="0.82"></rect>
        <rect x="136" y="78" width="64" height="12" rx="4" fill="${colors[2]}" opacity="0.82"></rect>
        <rect x="136" y="108" width="88" height="12" rx="4" fill="${colors[2]}" opacity="0.62"></rect>
        <rect x="136" y="136" width="56" height="16" rx="4" fill="${colors[0]}" opacity="0.82"></rect>
      </svg>
    </div>
  `;
}

function renderRatingCards(poi) {
  return REQUIRED_SOURCES[poi.type]
    .map((source) => {
      const rating = poi.ratings[source];
      const scoreWidth = normalizeScore(rating);
      const isMissing = !rating;
      const searchUrl = PLATFORM_SEARCH_URLS[source]?.(poi);
      const isUserProvided = rating?.source === "user";
      const isAssisted = rating?.source === "assist";
      const sourceState = getRatingSourceState(rating, source);
      return `
        <article class="rating-card ${isMissing ? "missing" : ""}">
          <div class="rating-topline">
            <span class="platform-name">${source}</span>
            <span class="tag">${sourceState.tag}</span>
          </div>
          <div class="rating-value">
            ${formatRating(rating)}
            ${rating && !rating.label ? `<small>/ ${rating.max}</small>` : ""}
          </div>
          <div class="rating-bar" aria-hidden="true">
            <span style="--score-width: ${scoreWidth}%"></span>
          </div>
          <p class="rating-meta">
            ${rating ? `${formatReviewCount(rating.reviews)} · 更新 ${rating.updated}` : sourceState.note}
          </p>
          <p class="rating-meta">${sourceState.note}</p>
          <div class="rating-actions">
            ${searchUrl ? `<a href="${searchUrl}" target="_blank" rel="noreferrer">打开查询</a>` : ""}
            <button type="button" data-rating-action="assist" data-poi-id="${poi.id}" data-source="${source}">自动识别</button>
            <button type="button" data-rating-action="manual" data-poi-id="${poi.id}" data-source="${source}">录入分数</button>
            ${isUserProvided || isAssisted ? `<button type="button" data-rating-action="clear" data-poi-id="${poi.id}" data-source="${source}">清除补录</button>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char];
  });
}

function coerceList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function renderListItems(items = [], fallbackItems = []) {
  const list = coerceList(items);
  const fallback = coerceList(fallbackItems);
  return (list.length ? list : fallback).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function normalizeDimensionInsights(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return { label: "维度", summary: item };
        return {
          label: item?.label || item?.name || "",
          summary: item?.summary || item?.text || item?.description || "",
        };
      })
      .filter((item) => item.label && item.summary);
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([label, summary]) => ({
        label,
        summary: typeof summary === "string" ? summary : summary?.summary || summary?.text || "",
      }))
      .filter((item) => item.label && item.summary);
  }

  return [];
}

function renderDimensionInsights(summary) {
  const items = normalizeDimensionInsights(summary.dimensionInsights);
  if (!items.length) return "";

  return `
    <div class="decision-dimensions">
      <h4>体验维度</h4>
      <div class="decision-dimension-grid">
        ${items
          .map(
            (item) => `
              <article class="decision-dimension">
                <h5>${escapeHtml(item.label)}</h5>
                <p>${escapeHtml(item.summary)}</p>
              </article>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderKnowBeforeCacheLabel() {
  const status = state.knowBeforeYouGoCache?.status;
  const labels = {
    hit: "缓存命中",
    stored: "新生成",
    refreshed: "已刷新",
  };
  return labels[status] ? ` · ${labels[status]}` : "";
}

function renderKnowBeforeActions(label, options = {}) {
  const disabled = options.disabled ? " disabled" : "";
  const buttonLabel = options.buttonLabel || "重新生成";
  return `
    <div class="decision-actions">
      <span class="platform-note">${escapeHtml(label)}</span>
      <button type="button" class="decision-refresh" data-know-before-action="refresh"${disabled}>${escapeHtml(buttonLabel)}</button>
    </div>
  `;
}

function renderKnowBeforeReadyCard(summary) {
  const isWaitingForProviders = state.providerPendingCount > 0;
  return `
    <section class="decision-card">
      <div class="section-heading">
        <h3>Know Before You Go</h3>
        ${renderKnowBeforeActions(`信心：${summary.confidence || "medium"}${renderKnowBeforeCacheLabel()}`, {
          disabled: isWaitingForProviders,
          buttonLabel: isWaitingForProviders ? "等待刷新" : "重新生成",
        })}
      </div>
      <p class="decision-summary">${escapeHtml(summary.overview || summary.headline || "到访前速览")}</p>
      <div class="decision-profile">
        <div class="decision-profile-block">
          <h4>独特特点</h4>
          <ul>${renderListItems(summary.uniqueTraits, summary.keyTakeaways)}</ul>
        </div>
        <div class="decision-profile-block is-positive">
          <h4>优势</h4>
          <ul>${renderListItems(summary.advantages, summary.bestFor)}</ul>
        </div>
        <div class="decision-profile-block is-caution">
          <h4>劣势 / 取舍</h4>
          <ul>${renderListItems(summary.tradeoffs, summary.watchouts)}</ul>
        </div>
      </div>
      ${renderDimensionInsights(summary)}
      <div class="decision-takeaways">
        <h4>重点总结</h4>
        <ul>${renderListItems(summary.keyTakeaways, [summary.headline].filter(Boolean))}</ul>
      </div>
      <div class="decision-grid">
        <div>
          <h4>评分怎么读</h4>
          <ul>${renderListItems(summary.ratingRead, summary.decisionTips)}</ul>
        </div>
        <div>
          <h4>适合你如果</h4>
          <ul>${renderListItems(summary.bestFor)}</ul>
        </div>
        <div>
          <h4>注意事项</h4>
          <ul>${renderListItems(summary.watchouts)}</ul>
        </div>
        <div>
          <h4>到访建议</h4>
          <ul>${renderListItems(summary.decisionTips)}</ul>
        </div>
      </div>
      <p class="decision-source">${escapeHtml(summary.sourceSummary || "")}</p>
    </section>
  `;
}

function renderKnowBeforeYouGoCard() {
  const summary = state.knowBeforeYouGo;
  if (summary && state.knowBeforeYouGoStatus === "ready") {
    return renderKnowBeforeReadyCard(summary);
  }

  if (state.providerPendingCount > 0) {
    const total = state.providerTotalCount || PROVIDER_BATCH_SOURCES.length;
    const finished = Math.max(0, total - state.providerPendingCount);
    return `
      <section class="decision-card">
        <div class="section-heading">
          <h3>Know Before You Go</h3>
          ${renderKnowBeforeActions(`等待 provider ${finished}/${total}`, {
            disabled: true,
            buttonLabel: "等待中",
          })}
        </div>
        <p class="decision-summary">所有 provider 返回成功、失败或无结果后，才会发起一次 LLM 汇总。当前还剩 ${state.providerPendingCount} 个来源。</p>
      </section>
    `;
  }

  if (state.knowBeforeYouGoStatus === "loading") {
    return `
      <section class="decision-card">
        <div class="section-heading">
          <h3>Know Before You Go</h3>
          ${renderKnowBeforeActions("正在整理各来源信息", {
            disabled: true,
            buttonLabel: "生成中",
          })}
        </div>
        <p class="decision-summary">所有 provider 已返回，正在汇总 Google、TripAdvisor、Tavily、Brave、Gemini 等来源，生成决策摘要。</p>
      </section>
    `;
  }

  if (state.knowBeforeYouGoStatus === "error") {
    return `
      <section class="decision-card is-warn">
        <div class="section-heading">
          <h3>Know Before You Go</h3>
          ${renderKnowBeforeActions("整理失败")}
        </div>
        <p class="decision-summary">${state.knowBeforeYouGoError || "暂时无法生成摘要。"}</p>
      </section>
    `;
  }

  if (!summary) {
    return `
      <section class="decision-card">
        <div class="section-heading">
          <h3>Know Before You Go</h3>
          ${renderKnowBeforeActions("等待来源返回", {
            disabled: true,
            buttonLabel: "待生成",
          })}
        </div>
        <p class="decision-summary">选中 POI 后，我会在这里汇总各搜索来源，给出决策前要点。</p>
      </section>
    `;
  }
  return renderKnowBeforeReadyCard(summary);
}

function getKnowBeforeCacheIdentity(selected, merged) {
  const stableId = selected.placeId || selected.id;
  const isGooglePlace = Boolean(selected.placeId || selected.id?.startsWith("google-"));
  return {
    source: isGooglePlace ? "google-places" : "local",
    id: stableId,
    type: merged.type,
    name: merged.name,
    city: merged.city,
    area: merged.area,
  };
}

function getProviderEvidence() {
  const selected = getFilteredPois().find((poi) => poi.id === state.selectedId);
  const merged = mergeProviderRatingsIntoPoi(selected);
  if (!merged) return null;

  const sourcePois = [
    ...state.googlePois.filter((poi) => poi.id === selected.id),
    ...state.tripAdvisorPois,
    ...state.tavilyPois,
    ...state.bravePois,
    ...state.geminiPois,
    ...state.yelpPois,
    ...state.bookingPois,
    ...state.michelinPois,
  ];

  return {
    cacheIdentity: getKnowBeforeCacheIdentity(selected, merged),
    poi: {
      id: selected.placeId || selected.id,
      name: merged.name,
      type: merged.type,
      city: merged.city,
      area: merged.area,
      category: merged.category,
      description: merged.description,
      price: merged.price,
    },
    ratings: merged.ratings,
    sources: sourcePois.map((poi) => ({
      name: poi.tags?.[0] || poi.category,
      category: poi.category,
      description: poi.description,
      city: poi.city,
      area: poi.area,
      ratings: poi.ratings,
      reviewsPreview: poi.reviewsPreview,
      photosPreview: poi.photosPreview,
      urls: [poi.tripAdvisorUrl, poi.bookingUrl, poi.yelpUrl, poi.michelinUrl, poi.sourceUrls].flat().filter(Boolean),
    })),
  };
}

async function tryLoadCachedKnowBeforeYouGo(selectedPoi) {
  if (!selectedPoi || isFileRuntime()) return;

  const identity = getKnowBeforeCacheIdentity(selectedPoi, selectedPoi);
  const token = ++knowBeforeYouGoToken;

  try {
    const response = await fetch("/api/know-before-you-go?cacheOnly=1", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        cacheIdentity: identity,
        poi: {
          id: identity.id,
          name: selectedPoi.name,
          type: selectedPoi.type,
          city: selectedPoi.city,
          area: selectedPoi.area,
          category: selectedPoi.category,
          description: selectedPoi.description,
          price: selectedPoi.price,
        },
      }),
    });
    const payload = await response.json();

    if (token !== knowBeforeYouGoToken || response.status === 404) return;
    if (!response.ok) throw new Error(payload.error || `Know Before You Go 缓存返回 ${response.status}`);

    state.knowBeforeYouGo = payload.data;
    state.knowBeforeYouGoStatus = "ready";
    state.knowBeforeYouGoError = payload.warning || "";
    state.knowBeforeYouGoCache = payload.cache || null;
    render();
  } catch {
    if (token === knowBeforeYouGoToken && state.knowBeforeYouGoStatus === "ready") render();
  }
}

function maybeGenerateKnowBeforeYouGo(options = {}) {
  clearTimeout(knowBeforeYouGoTimer);

  if (state.providerPendingCount > 0) return;

  const force = Boolean(options.force);
  if (!force && state.knowBeforeYouGo && state.knowBeforeYouGoCache?.scope === "poi-identity") return;

  knowBeforeYouGoTimer = setTimeout(async () => {
    if (state.providerPendingCount > 0) return;

    const evidence = getProviderEvidence();
    if (!evidence || !state.selectedId) return;

    const signature = JSON.stringify({
      id: state.selectedId,
      ratings: evidence.ratings,
      sourceCount: evidence.sources.length,
    });
    if (!force && signature === state.knowBeforeYouGoSignature) return;

    const token = ++knowBeforeYouGoToken;
    state.knowBeforeYouGoSignature = signature;
    state.knowBeforeYouGoStatus = "loading";
    state.knowBeforeYouGoError = "";
    render();

    try {
      const endpoint = force ? "/api/know-before-you-go?refresh=1" : "/api/know-before-you-go";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(force ? { "x-cache-refresh": "1" } : {}),
        },
        body: JSON.stringify(evidence),
      });
      const payload = await response.json();

      if (token !== knowBeforeYouGoToken) return;
      if (!response.ok) {
        throw new Error(payload.error || `Know Before You Go 返回 ${response.status}`);
      }

      state.knowBeforeYouGo = payload.data;
      state.knowBeforeYouGoStatus = "ready";
      state.knowBeforeYouGoError = payload.warning || "";
      state.knowBeforeYouGoCache = payload.cache || null;
    } catch (error) {
      if (token !== knowBeforeYouGoToken) return;
      state.knowBeforeYouGo = null;
      state.knowBeforeYouGoStatus = "error";
      state.knowBeforeYouGoError = error.message;
      state.knowBeforeYouGoCache = null;
    } finally {
      if (token === knowBeforeYouGoToken) render();
    }
  }, force ? 0 : 800);
}

function renderDetail(poi) {
  if (!poi) {
    const emptyNode = elements.emptyTemplate.content.cloneNode(true);
    elements.detailView.innerHTML = "";
    elements.detailView.append(emptyNode);
    return;
  }

  const avg = averageScore(poi);
  const sourceCount = REQUIRED_SOURCES[poi.type].filter((source) => poi.ratings[source]).length;
  const requiredCount = REQUIRED_SOURCES[poi.type].length;
  const bestSource = Object.entries(poi.ratings)
    .filter(([, rating]) => rating.score > 0)
    .sort((a, b) => normalizeScore(b[1]) - normalizeScore(a[1]))[0];

  elements.detailView.innerHTML = `
    <div class="hero-detail">
      <div>
        <div class="detail-title-row">
          <div>
            <span class="tag">${poi.type === "restaurant" ? "餐厅" : "酒店"}</span>
            <h2>${poi.name}</h2>
          </div>
        </div>
        <p class="description">${poi.city} · ${poi.area} · ${poi.category}。${poi.description}</p>
        <div class="summary-grid">
          <div class="summary-tile">
            <span>综合百分制</span>
            <strong>${avg}</strong>
          </div>
          <div class="summary-tile">
            <span>来源覆盖</span>
            <strong>${sourceCount}/${requiredCount}</strong>
          </div>
          <div class="summary-tile">
            <span>参考价格</span>
            <strong>${poi.price}</strong>
          </div>
        </div>
      </div>
      ${renderVisual(poi)}
    </div>

    <section class="ratings-section">
      <div class="section-heading">
        <h3>平台评分</h3>
        <span class="platform-note">${poi.type === "restaurant" ? "Google / Yelp / 米其林 / TripAdvisor" : "Google / Booking / Agoda / TripAdvisor"}</span>
      </div>
      <div class="rating-grid">${renderRatingCards(poi)}</div>
    </section>

    ${renderKnowBeforeYouGoCard()}

    <section class="insight-row">
      <article class="insight">
        <h3>评分解读</h3>
        <p>${bestSource ? `${bestSource[0]} 当前表现最高，归一化后约为 ${normalizeScore(bestSource[1])} 分。` : "暂无可比较评分。"}</p>
      </article>
      <article class="insight">
        <h3>接入建议</h3>
        <p>页面已按平台拆分字段，真实环境中可把每个平台接成独立数据源，并保留更新时间与评价量用于可信度判断。</p>
      </article>
    </section>
  `;
}

function renderSelectionPrompt() {
  elements.detailView.innerHTML = `
    <div class="empty-state">
      <div class="empty-visual" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <h2>选择一个 Google POI</h2>
      <p>左侧列表来自 Google Places。选中后，我会用该 POI 的完整名称和类型去查询其它来源并填写评分卡。</p>
    </div>
  `;
}

function getCurrentPois() {
  return getFilteredPois();
}

function findPoiById(id) {
  return getCurrentPois().find((poi) => poi.id === id);
}

function getDefaultMaxScore(source) {
  if (source === "Booking" || source === "Agoda") return 10;
  if (source === "Michelin") return 3;
  return 5;
}

function getProviderLookup() {
  return state.providerLookup;
}

function getProviderSearchParams(lookup, type) {
  const params = new URLSearchParams({
    q: lookup?.query?.trim() || "",
    type,
    city: lookup?.city || "",
  });

  if (lookup?.poiId) params.set("poiId", lookup.poiId);
  if (lookup?.poiSource) params.set("poiSource", lookup.poiSource);

  return params;
}

function getGeminiPlatformsForType(type) {
  if (type === "hotel") return ["Booking", "Agoda"];
  if (type === "restaurant") return ["Yelp", "Michelin"];
  return [];
}

function resetGeminiPlatformStatus(type, status, message = "") {
  const nextStatus = {};
  getGeminiPlatformsForType(type).forEach((platform) => {
    nextStatus[platform] = { status, message };
  });
  state.geminiPlatformStatus = nextStatus;
}

function getRatingSourceState(rating, source) {
  const geminiStatus = state.geminiPlatformStatus[source];
  const braveStatus = state.bravePlatformStatus[source];
  const tavilyStatus = state.tavilyPlatformStatus[source];
  const michelinStatus = source === "Michelin" ? state.michelinStatus : null;

  if (rating?.source === "user") {
    return { tag: "用户补录", note: "用户手动录入" };
  }

  if (rating?.source === "assist") {
    return { tag: "自动识别", note: "本机浏览器辅助识别" };
  }

  if (rating?.source === "gemini") {
    return { tag: "Gemini 成功", note: "Gemini Search 返回该平台评分" };
  }

  if (rating?.source === "brave") {
    return { tag: "Brave 成功", note: "Brave Search 返回该平台评分" };
  }

  if (rating?.source === "tavily") {
    return { tag: "Tavily 成功", note: "Tavily Search 返回该平台评分" };
  }

  if (rating?.source === "michelin-my-maps") {
    return { tag: "Michelin 数据集", note: "来自 ngshiheng/michelin-my-maps 本地数据源" };
  }

  if (michelinStatus === "searching") {
    return { tag: "Michelin 查询中", note: "正在查询本地 Michelin My Maps 数据集" };
  }

  if (tavilyStatus?.status === "searching") {
    return { tag: "Tavily 搜索中", note: "正在用 Tavily Search 查询该平台评分" };
  }

  if (tavilyStatus?.status === "failed") {
    return { tag: "Tavily 失败", note: tavilyStatus.message || "Tavily Search 未返回该平台评分" };
  }

  if (tavilyStatus?.status === "missing") {
    return { tag: "Tavily 无结果", note: "Tavily Search 未找到该平台评分" };
  }

  if (braveStatus?.status === "searching") {
    return { tag: "Brave 搜索中", note: "正在用 Brave Search 查询该平台评分" };
  }

  if (braveStatus?.status === "failed") {
    return { tag: "Brave 失败", note: braveStatus.message || "Brave Search 未返回该平台评分" };
  }

  if (braveStatus?.status === "missing") {
    return { tag: "Brave 无结果", note: "Brave Search 未找到该平台评分" };
  }

  if (geminiStatus?.status === "searching") {
    return { tag: "Gemini 搜索中", note: "正在用 Gemini Search 查询该平台评分" };
  }

  if (geminiStatus?.status === "failed") {
    return { tag: "Gemini 失败", note: geminiStatus.message || "Gemini Search 未返回该平台评分" };
  }

  if (geminiStatus?.status === "missing") {
    return { tag: "Gemini 无结果", note: "Gemini Search 未找到该平台评分" };
  }

  if (michelinStatus === "error") {
    return { tag: "Michelin 失败", note: state.michelinError || "Michelin 数据集查询失败" };
  }

  if (source === "Michelin" && state.providerLookup && state.providerPendingCount === 0 && !rating) {
    return { tag: "Michelin 无结果", note: "Michelin My Maps 数据集中未匹配到该 POI" };
  }

  if (rating) {
    return { tag: "已收录", note: "来自实时 API 或示例数据" };
  }

  return { tag: "待查询", note: "当前没有该平台评分，可打开平台搜索后补录" };
}

function promptForManualRating(poi, source) {
  const max = getDefaultMaxScore(source);
  const scoreText = window.prompt(`请输入 ${source} 分数（0-${max}）：`);
  if (scoreText === null) return;

  const score = Number(scoreText.trim());
  if (!Number.isFinite(score) || score < 0 || score > max) {
    window.alert(`分数需要是 0 到 ${max} 之间的数字。`);
    return;
  }

  const reviewsText = window.prompt("请输入评价数量（可留空）：");
  if (reviewsText === null) return;

  const reviews = reviewsText.trim() ? Number(reviewsText.trim()) : null;
  if (reviews !== null && (!Number.isInteger(reviews) || reviews < 0)) {
    window.alert("评价数量需要是非负整数，或留空。");
    return;
  }

  state.userRatings[getUserRatingKey(poi, source)] = {
    score,
    max,
    reviews,
    updated: "用户补录",
    source: "user",
  };
  saveUserRatings();
  render();
}

function clearManualRating(poi, source) {
  delete state.userRatings[getUserRatingKey(poi, source)];
  saveUserRatings();
  render();
}

async function assistRatingLookup(poi, source, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "识别中";

  try {
    const params = new URLSearchParams({
      platform: source,
      q: poi.name,
      city: poi.city,
      type: poi.type,
    });
    const response = await fetch(`/api/assist-rating?${params}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || `自动识别返回 ${response.status}`);
    }

    if (!payload.data) {
      const shouldOpen = window.confirm(`${payload.warning || "未能自动识别评分。"}\n\n要打开查询页手动查看吗？`);
      if (shouldOpen && payload.searchUrl) {
        window.open(payload.searchUrl, "_blank", "noreferrer");
      }
      return;
    }

    const rating = payload.data;
    const label = rating.label || `${rating.score}/${rating.max}`;
    const reviews = rating.reviews === null || rating.reviews === undefined ? "无评价数" : `${rating.reviews} 条评价`;
    const shouldSave = window.confirm(`识别到 ${source}：${label}，${reviews}。\n\n是否保存到当前 POI？`);
    if (!shouldSave) return;

    state.userRatings[getUserRatingKey(poi, source)] = {
      score: rating.score,
      max: rating.max,
      label: rating.label,
      reviews: rating.reviews,
      updated: "自动识别",
      source: "assist",
      sourceUrl: rating.sourceUrl || payload.searchUrl,
    };
    saveUserRatings();
    render();
  } catch (error) {
    window.alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderGoogleStatus() {
  const hasKey = Boolean(window.POI_RATINGS_CONFIG?.googleMapsApiKey);
  elements.googleStatus.classList.toggle("is-warn", state.googleStatus === "error" || !hasKey);

  const label = {
    loading: "正在准备 Google Places",
    ready: "Google Places 已连接",
    searching: "正在搜索 Google Places",
    error: state.googleError || "Google Places 暂不可用",
  }[hasKey ? state.googleStatus : "error"];

  elements.googleStatus.innerHTML = `<span class="status-dot"></span>${label}`;
}

function renderTripAdvisorStatus() {
  const isUnavailable = state.tripAdvisorStatus === "error" || isFileRuntime();
  elements.tripAdvisorStatus.classList.toggle("is-warn", isUnavailable);

  const label = {
    ready: "TripAdvisor 已准备",
    searching: "正在搜索 TripAdvisor",
    error: state.tripAdvisorError || "TripAdvisor 暂不可用",
  }[isFileRuntime() ? "error" : state.tripAdvisorStatus];

  elements.tripAdvisorStatus.innerHTML = `<span class="status-dot"></span>${label}`;
}

function renderBookingStatus() {
  const isUnavailable = state.bookingStatus === "error" || isFileRuntime();
  elements.bookingStatus.classList.toggle("is-warn", isUnavailable);

  const label = {
    ready: "Booking 由 Gemini Search 补全",
    searching: "正在搜索 Booking",
    error: state.bookingError || "Booking 暂不可用",
  }[isFileRuntime() ? "error" : state.bookingStatus];

  elements.bookingStatus.innerHTML = `<span class="status-dot"></span>${label}`;
}

function renderYelpStatus() {
  const isUnavailable = state.yelpStatus === "error" || isFileRuntime();
  elements.yelpStatus.classList.toggle("is-warn", isUnavailable);

  const label = {
    ready: "Yelp 由 Gemini Search 补全",
    searching: "正在搜索 Yelp",
    error: state.yelpError || "Yelp 暂不可用",
  }[isFileRuntime() ? "error" : state.yelpStatus];

  elements.yelpStatus.innerHTML = `<span class="status-dot"></span>${label}`;
}

function renderMichelinStatus() {
  const isUnavailable = state.michelinStatus === "error" || isFileRuntime();
  elements.michelinStatus.classList.toggle("is-warn", isUnavailable);

  const label = {
    ready: "Michelin 数据集已准备",
    searching: "正在查询 Michelin 数据集",
    error: state.michelinError || "Michelin 数据集暂不可用",
  }[isFileRuntime() ? "error" : state.michelinStatus];

  elements.michelinStatus.innerHTML = `<span class="status-dot"></span>${label}`;
}

function renderGeminiStatus() {
  const isUnavailable = state.geminiStatus === "error" || isFileRuntime();
  elements.geminiStatus.classList.toggle("is-warn", isUnavailable);

  const label = {
    ready: "Gemini Search 已准备",
    searching: "正在搜索 Gemini",
    error: state.geminiError || "Gemini Search 暂不可用",
  }[isFileRuntime() ? "error" : state.geminiStatus];

  elements.geminiStatus.innerHTML = `<span class="status-dot"></span>${label}`;
}

function renderBraveStatus() {
  const isUnavailable = state.braveStatus === "error" || isFileRuntime();
  elements.braveStatus.classList.toggle("is-warn", isUnavailable);

  const label = {
    ready: "Brave Search 已准备",
    searching: "正在搜索 Brave",
    error: state.braveError || "Brave Search 暂不可用",
  }[isFileRuntime() ? "error" : state.braveStatus];

  elements.braveStatus.innerHTML = `<span class="status-dot"></span>${label}`;
}

function renderTavilyStatus() {
  const isUnavailable = state.tavilyStatus === "error" || isFileRuntime();
  elements.tavilyStatus.classList.toggle("is-warn", isUnavailable);

  const label = {
    ready: "Tavily Search 已准备",
    searching: "正在搜索 Tavily",
    error: state.tavilyError || "Tavily Search 暂不可用",
  }[isFileRuntime() ? "error" : state.tavilyStatus];

  elements.tavilyStatus.innerHTML = `<span class="status-dot"></span>${label}`;
}

function render() {
  elements.runtimeNotice.hidden = !isFileRuntime();
  if (isFileRuntime()) {
    state.tripAdvisorError = "TripAdvisor 需要通过本地代理访问";
    state.bookingError = "Booking 需要通过本地代理访问";
    state.yelpError = "Yelp 需要通过本地代理访问";
    state.michelinError = "Michelin 数据集需要通过本地代理访问";
    state.geminiError = "Gemini Search 需要通过本地代理访问";
    state.braveError = "Brave Search 需要通过本地代理访问";
    state.tavilyError = "Tavily Search 需要通过本地代理访问";
  }

  const pois = getFilteredPois();
  const isSearchMode = state.query.trim().length >= 2;
  if (!state.userSelectedPoi && !isSearchMode) {
    state.selectedId = pois[0]?.id ?? null;
  } else if (!pois.some((poi) => poi.id === state.selectedId)) {
    state.selectedId = isSearchMode ? null : pois[0]?.id ?? null;
    state.userSelectedPoi = false;
  }

  renderPoiList(pois);
  const selectedBasePoi = pois.find((poi) => poi.id === state.selectedId);
  if (isSearchMode && pois.length && !selectedBasePoi) {
    renderSelectionPrompt();
  } else {
    renderDetail(mergeProviderRatingsIntoPoi(selectedBasePoi));
  }
  renderGoogleStatus();
  renderTripAdvisorStatus();
  renderBookingStatus();
  renderYelpStatus();
  renderMichelinStatus();
  renderGeminiStatus();
  renderBraveStatus();
  renderTavilyStatus();
}

function inferPoiType(types = []) {
  if (types.includes("lodging")) return "hotel";
  if (types.includes("restaurant") || types.includes("food") || types.includes("cafe")) return "restaurant";
  return state.type === "hotel" ? "hotel" : "restaurant";
}

function mapGooglePlaceToPoi(place) {
  const type = inferPoiType(place.types);
  const addressParts = (place.formatted_address || "").split(",").map((part) => part.trim());
  const city =
    addressParts.length >= 4 && /[A-Z]{2}\s+\d{4,}/.test(addressParts.at(-2) || "")
      ? addressParts.at(-3)
      : addressParts.at(-2) || addressParts.at(-1) || "Google Places";
  const photoUrl = place.photos?.[0]?.getUrl({ maxWidth: 640, maxHeight: 420 });

  return {
    id: `google-${place.place_id}`,
    placeId: place.place_id,
    type,
    name: place.name,
    city,
    area: addressParts[0] || "Google Places",
    category: type === "hotel" ? "Google Places 酒店结果" : "Google Places 餐饮结果",
    description: "来自 Google Places 的实时搜索结果。其他平台评分需要分别接入对应来源后展示。",
    price: place.price_level ? `${"$".repeat(place.price_level)} · Google 价格等级` : "暂无价格等级",
    tags: ["Google", "实时结果"],
    photoUrl,
    ratings: {
      Google: {
        score: place.rating || 0,
        max: 5,
        reviews: place.user_ratings_total || 0,
        updated: "实时",
      },
    },
  };
}

function loadGooglePlaces() {
  const apiKey = window.POI_RATINGS_CONFIG?.googleMapsApiKey;
  if (!apiKey) {
    state.googleStatus = "error";
    state.googleError = "缺少 Google Maps API key";
    render();
    return;
  }

  if (window.google?.maps?.places) {
    initializePlacesService();
    return;
  }

  window.__initGooglePlacesForPoiRatings = initializePlacesService;
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=__initGooglePlacesForPoiRatings`;
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    state.googleStatus = "error";
    state.googleError = "Google Places 加载失败";
    render();
  };
  document.head.append(script);
}

function initializePlacesService() {
  const mapNode = document.createElement("div");
  mapNode.style.display = "none";
  document.body.append(mapNode);
  const map = new google.maps.Map(mapNode, {
    center: { lat: 31.2304, lng: 121.4737 },
    zoom: 12,
  });
  googlePlacesService = new google.maps.places.PlacesService(map);
  googleAutocompleteService = new google.maps.places.AutocompleteService();
  state.googleStatus = "ready";
  render();
  searchGooglePlaces();
}

function getGoogleRequestType() {
  if (state.type === "restaurant") return "restaurant";
  if (state.type === "hotel") return "lodging";
  return undefined;
}

function getGoogleLocationHints() {
  const genericCities = new Set([
    "booking",
    "brave search",
    "gemini search",
    "google places",
    "michelin guide",
    "tavily search",
    "tripadvisor",
    "yelp",
  ]);
  const hintPois = [
    ...state.tripAdvisorPois,
    ...state.tavilyPois,
    ...state.bravePois,
    ...state.geminiPois,
    ...state.yelpPois,
    ...state.bookingPois,
    ...state.michelinPois,
  ];
  const seen = new Set();

  return hintPois
    .filter((poi) => state.type === "all" || poi.type === state.type)
    .map((poi) => poi.city)
    .filter(Boolean)
    .map((city) => city.trim())
    .filter((city) => city.length > 2 && !genericCities.has(city.toLowerCase()))
    .filter((city) => {
      const key = normalizeText(city);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function runGoogleTextSearch(request) {
  return new Promise((resolve) => {
    googlePlacesService.textSearch(request, (results, status) => {
      resolve({ results, status });
    });
  });
}

function getGooglePredictions(input) {
  return new Promise((resolve) => {
    if (!googleAutocompleteService) {
      resolve({ predictions: [], status: "UNAVAILABLE" });
      return;
    }

    googleAutocompleteService.getPlacePredictions(
      {
        input,
        types: ["establishment"],
      },
      (predictions, status) => {
        resolve({ predictions: predictions || [], status });
      },
    );
  });
}

function getGooglePlaceDetails(placeId) {
  return new Promise((resolve) => {
    googlePlacesService.getDetails(
      {
        placeId,
        fields: ["name", "formatted_address", "place_id", "rating", "user_ratings_total", "types", "price_level", "photos"],
      },
      (place, status) => {
        resolve({ place, status });
      },
    );
  });
}

function maybeRetryGoogleWithLocationHints() {
  clearTimeout(googleFallbackTimer);

  googleFallbackTimer = setTimeout(async () => {
    const query = state.query.trim();
    const hints = getGoogleLocationHints();

    if (!googlePlacesService || state.googlePois.length || state.isSearchingGoogle || query.length < 2 || !hints.length) {
      return;
    }

    const signature = `${state.type}:${query}:${hints.join("|")}`;
    if (state.googleFallbackSignature === signature) return;

    state.googleFallbackSignature = signature;
    const token = ++googleSearchToken;
    state.isSearchingGoogle = true;
    state.googleStatus = "searching";
    render();

    const type = getGoogleRequestType();

    for (const hint of hints) {
      if (token !== googleSearchToken) return;

      const request = {
        query: `${query} ${hint}`,
        fields: ["name", "formatted_address", "place_id", "rating", "user_ratings_total", "types", "price_level", "photos"],
      };
      if (type) request.type = type;

      const { results, status } = await runGoogleTextSearch(request);
      if (token !== googleSearchToken) return;

      if (status === google.maps.places.PlacesServiceStatus.OK && results?.length) {
        state.googlePois = results.slice(0, 6).map(mapGooglePlaceToPoi);
        state.googleStatus = "ready";
        state.googleError = "";
        state.isSearchingGoogle = false;
        render();
        return;
      }
    }

    state.isSearchingGoogle = false;
    if (state.googleStatus !== "error") state.googleStatus = "ready";
    render();
  }, 300);
}

function searchGooglePlaces() {
  clearTimeout(googleSearchTimer);

  googleSearchTimer = setTimeout(async () => {
    const query = state.query.trim();
    if (!googlePlacesService || query.length < 2) {
      state.googlePois = [];
      state.isSearchingGoogle = false;
      state.googleFallbackSignature = "";
      if (state.googleStatus !== "error") state.googleStatus = googlePlacesService ? "ready" : "loading";
      render();
      return;
    }

    const token = ++googleSearchToken;
    state.isSearchingGoogle = true;
    state.googleStatus = "searching";
    render();

    const { predictions, status: predictionStatus } = await getGooglePredictions(query);
    if (token !== googleSearchToken) return;

    if (predictionStatus === google.maps.places.PlacesServiceStatus.OK && predictions.length) {
      const detailResults = await Promise.all(
        predictions.slice(0, 8).map((prediction) => getGooglePlaceDetails(prediction.place_id)),
      );
      if (token !== googleSearchToken) return;

      state.googlePois = detailResults
        .filter(({ place, status }) => status === google.maps.places.PlacesServiceStatus.OK && place)
        .map(({ place }) => mapGooglePlaceToPoi(place))
        .filter((poi) => state.type === "all" || poi.type === state.type)
        .slice(0, 8);
      state.isSearchingGoogle = false;
      state.googleStatus = "ready";
      state.googleError = "";
      render();
      return;
    }

    const request = {
      query,
      fields: ["name", "formatted_address", "place_id", "rating", "user_ratings_total", "types", "price_level", "photos"],
    };
    const type = getGoogleRequestType();
    if (type) request.type = type;

    const { results, status } = await runGoogleTextSearch(request);
    if (token !== googleSearchToken) return;
    state.isSearchingGoogle = false;

    if (status === google.maps.places.PlacesServiceStatus.OK && results) {
      state.googlePois = results.slice(0, 8).map(mapGooglePlaceToPoi);
      state.googleStatus = "ready";
      state.googleError = "";
    } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
      state.googlePois = [];
      state.googleStatus = "ready";
      state.googleError = "";
    } else {
      state.googlePois = [];
      state.googleStatus = "error";
      state.googleError = `Google Places 返回 ${status}`;
    }

    render();
  }, 350);
}

function searchTripAdvisor(batchId) {
  clearTimeout(tripAdvisorSearchTimer);

  tripAdvisorSearchTimer = setTimeout(async () => {
    const lookup = getProviderLookup();
    const query = lookup?.query?.trim() || "";
    const type = lookup?.type || state.type;
    if (isFileRuntime()) {
      state.tripAdvisorPois = [];
      state.isSearchingTripAdvisor = false;
      state.tripAdvisorStatus = "error";
      state.tripAdvisorError = "TripAdvisor 需要通过本地代理访问";
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    if (query.length < 2) {
      state.tripAdvisorPois = [];
      state.isSearchingTripAdvisor = false;
      state.tripAdvisorStatus = "ready";
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    const token = ++tripAdvisorSearchToken;
    state.isSearchingTripAdvisor = true;
    state.tripAdvisorStatus = "searching";
    render();

    try {
      const params = getProviderSearchParams(lookup, type);
      const response = await fetch(`/api/tripadvisor/search?${params}`);
      const payload = await response.json();

      if (token !== tripAdvisorSearchToken) return;

      if (!response.ok) {
        throw new Error(payload.error || `TripAdvisor 返回 ${response.status}`);
      }

      state.tripAdvisorPois = payload.data || [];
      state.tripAdvisorStatus = "ready";
      state.tripAdvisorError = "";
    } catch (error) {
      if (token !== tripAdvisorSearchToken) return;
      state.tripAdvisorPois = [];
      state.tripAdvisorStatus = "error";
      state.tripAdvisorError = error.message;
    } finally {
      if (token === tripAdvisorSearchToken) {
        state.isSearchingTripAdvisor = false;
        finishProviderBatchSource(batchId);
        render();
      }
    }
  }, 450);
}

function searchBooking(batchId) {
  clearTimeout(bookingSearchTimer);

  bookingSearchTimer = setTimeout(async () => {
    const lookup = getProviderLookup();
    const query = lookup?.query?.trim() || "";
    const type = lookup?.type || state.type;
    if (isFileRuntime()) {
      state.bookingPois = [];
      state.isSearchingBooking = false;
      state.bookingStatus = "error";
      state.bookingError = "Booking 需要通过本地代理访问";
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    if (type === "restaurant" || query.length < 2) {
      state.bookingPois = [];
      state.isSearchingBooking = false;
      state.bookingStatus = "ready";
      state.bookingError = "";
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    const token = ++bookingSearchToken;
    state.isSearchingBooking = true;
    state.bookingStatus = "searching";
    render();

    try {
      const params = getProviderSearchParams(lookup, type);
      const response = await fetch(`/api/booking/search?${params}`);
      const payload = await response.json();

      if (token !== bookingSearchToken) return;

      if (!response.ok) {
        throw new Error(payload.error || `Booking 返回 ${response.status}`);
      }

      if (payload.warning) {
        throw new Error(payload.warning);
      }

      state.bookingPois = payload.data || [];
      state.bookingStatus = "ready";
      state.bookingError = "";
    } catch (error) {
      if (token !== bookingSearchToken) return;
      state.bookingPois = [];
      state.bookingStatus = "error";
      state.bookingError = error.message;
    } finally {
      if (token === bookingSearchToken) {
        state.isSearchingBooking = false;
        finishProviderBatchSource(batchId);
        render();
      }
    }
  }, 450);
}

function searchYelp(batchId) {
  clearTimeout(yelpSearchTimer);

  yelpSearchTimer = setTimeout(async () => {
    const lookup = getProviderLookup();
    const query = lookup?.query?.trim() || "";
    const type = lookup?.type || state.type;
    if (isFileRuntime()) {
      state.yelpPois = [];
      state.isSearchingYelp = false;
      state.yelpStatus = "error";
      state.yelpError = "Yelp 需要通过本地代理访问";
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    if (type === "hotel" || query.length < 2) {
      state.yelpPois = [];
      state.isSearchingYelp = false;
      state.yelpStatus = "ready";
      state.yelpError = "";
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    const token = ++yelpSearchToken;
    state.isSearchingYelp = true;
    state.yelpStatus = "searching";
    render();

    try {
      const params = getProviderSearchParams(lookup, type);
      const response = await fetch(`/api/yelp/search?${params}`);
      const payload = await response.json();

      if (token !== yelpSearchToken) return;

      if (!response.ok) {
        throw new Error(payload.error || `Yelp 返回 ${response.status}`);
      }

      if (payload.warning) {
        throw new Error(payload.warning);
      }

      state.yelpPois = payload.data || [];
      state.yelpStatus = "ready";
      state.yelpError = "";
    } catch (error) {
      if (token !== yelpSearchToken) return;
      state.yelpPois = [];
      state.yelpStatus = "error";
      state.yelpError = error.message;
    } finally {
      if (token === yelpSearchToken) {
        state.isSearchingYelp = false;
        finishProviderBatchSource(batchId);
        render();
      }
    }
  }, 450);
}

function searchMichelin(batchId) {
  clearTimeout(michelinSearchTimer);

  michelinSearchTimer = setTimeout(async () => {
    const lookup = getProviderLookup();
    const query = lookup?.query?.trim() || "";
    const type = lookup?.type || state.type;
    if (isFileRuntime()) {
      state.michelinPois = [];
      state.isSearchingMichelin = false;
      state.michelinStatus = "error";
      state.michelinError = "Michelin 数据集需要通过本地代理访问";
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    if (type === "hotel" || query.length < 2) {
      state.michelinPois = [];
      state.isSearchingMichelin = false;
      state.michelinStatus = "ready";
      state.michelinError = "";
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    const token = ++michelinSearchToken;
    state.isSearchingMichelin = true;
    state.michelinStatus = "searching";
    render();

    try {
      const params = getProviderSearchParams(lookup, type);
      const response = await fetch(`/api/michelin/search?${params}`);
      const payload = await response.json();

      if (token !== michelinSearchToken) return;

      if (!response.ok) {
        throw new Error(payload.error || `Michelin 返回 ${response.status}`);
      }

      if (payload.warning) {
        throw new Error(payload.warning);
      }

      state.michelinPois = payload.data || [];
      state.michelinStatus = "ready";
      state.michelinError = "";
    } catch (error) {
      if (token !== michelinSearchToken) return;
      state.michelinPois = [];
      state.michelinStatus = "error";
      state.michelinError = error.message;
    } finally {
      if (token === michelinSearchToken) {
        state.isSearchingMichelin = false;
        finishProviderBatchSource(batchId);
        render();
      }
    }
  }, 420);
}

function searchGeminiRatings(batchId) {
  clearTimeout(geminiSearchTimer);

  geminiSearchTimer = setTimeout(async () => {
    const lookup = getProviderLookup();
    const query = lookup?.query?.trim() || "";
    const type = lookup?.type || state.type;
    if (isFileRuntime()) {
      state.geminiPois = [];
      state.isSearchingGemini = false;
      state.geminiStatus = "error";
      state.geminiError = "Gemini Search 需要通过本地代理访问";
      resetGeminiPlatformStatus(type, "failed", state.geminiError);
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    if (query.length < 2) {
      state.geminiPois = [];
      state.isSearchingGemini = false;
      state.geminiStatus = "ready";
      state.geminiError = "";
      state.geminiPlatformStatus = {};
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    const token = ++geminiSearchToken;
    state.isSearchingGemini = true;
    state.geminiStatus = "searching";
    resetGeminiPlatformStatus(type, "searching");
    render();

    try {
      const params = getProviderSearchParams(lookup, type);
      const response = await fetch(`/api/gemini/ratings?${params}`);
      const payload = await response.json();

      if (token !== geminiSearchToken) return;

      if (!response.ok) {
        throw new Error(payload.error || `Gemini Search 返回 ${response.status}`);
      }

      if (payload.warning) {
        throw new Error(payload.warning);
      }

      state.geminiPois = payload.data || [];
      state.geminiStatus = "ready";
      state.geminiError = "";
      maybeRetryGoogleWithLocationHints();
      const foundPlatforms = new Set(
        state.geminiPois.flatMap((poi) =>
          Object.entries(poi.ratings || {})
            .filter(([, rating]) => rating?.source === "gemini")
            .map(([platform]) => platform),
        ),
      );
      const nextStatus = {};
      getGeminiPlatformsForType(type).forEach((platform) => {
        nextStatus[platform] = foundPlatforms.has(platform)
          ? { status: "success", message: "Gemini Search 返回该平台评分" }
          : { status: "missing", message: "Gemini Search 未找到该平台评分" };
      });
      state.geminiPlatformStatus = nextStatus;
    } catch (error) {
      if (token !== geminiSearchToken) return;
      state.geminiPois = [];
      state.geminiStatus = "error";
      state.geminiError = error.message;
      resetGeminiPlatformStatus(type, "failed", error.message);
    } finally {
      if (token === geminiSearchToken) {
        state.isSearchingGemini = false;
        finishProviderBatchSource(batchId);
        render();
      }
    }
  }, 550);
}

function searchBraveRatings(batchId) {
  clearTimeout(braveSearchTimer);

  braveSearchTimer = setTimeout(async () => {
    const lookup = getProviderLookup();
    const query = lookup?.query?.trim() || "";
    const type = lookup?.type || state.type;
    if (isFileRuntime()) {
      state.bravePois = [];
      state.isSearchingBrave = false;
      state.braveStatus = "error";
      state.braveError = "Brave Search 需要通过本地代理访问";
      const failedStatus = {};
      getGeminiPlatformsForType(type).forEach((platform) => {
        failedStatus[platform] = { status: "failed", message: state.braveError };
      });
      state.bravePlatformStatus = failedStatus;
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    if (query.length < 2) {
      state.bravePois = [];
      state.isSearchingBrave = false;
      state.braveStatus = "ready";
      state.braveError = "";
      state.bravePlatformStatus = {};
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    const token = ++braveSearchToken;
    state.isSearchingBrave = true;
    state.braveStatus = "searching";
    const nextStatus = {};
    getGeminiPlatformsForType(type).forEach((platform) => {
      nextStatus[platform] = { status: "searching", message: "" };
    });
    state.bravePlatformStatus = nextStatus;
    render();

    try {
      const params = getProviderSearchParams(lookup, type);
      const response = await fetch(`/api/brave/ratings?${params}`);
      const payload = await response.json();

      if (token !== braveSearchToken) return;

      if (!response.ok) {
        throw new Error(payload.error || `Brave Search 返回 ${response.status}`);
      }

      if (payload.warning) {
        throw new Error(payload.warning);
      }

      state.bravePois = payload.data || [];
      state.braveStatus = "ready";
      state.braveError = "";
      maybeRetryGoogleWithLocationHints();
      const foundPlatforms = new Set(
        state.bravePois.flatMap((poi) =>
          Object.entries(poi.ratings || {})
            .filter(([, rating]) => rating?.source === "brave")
            .map(([platform]) => platform),
        ),
      );
      const doneStatus = {};
      getGeminiPlatformsForType(type).forEach((platform) => {
        doneStatus[platform] = foundPlatforms.has(platform)
          ? { status: "success", message: "Brave Search 返回该平台评分" }
          : { status: "missing", message: "Brave Search 未找到该平台评分" };
      });
      state.bravePlatformStatus = doneStatus;
    } catch (error) {
      if (token !== braveSearchToken) return;
      state.bravePois = [];
      state.braveStatus = "error";
      state.braveError = error.message;
      const failedStatus = {};
      getGeminiPlatformsForType(type).forEach((platform) => {
        failedStatus[platform] = { status: "failed", message: error.message };
      });
      state.bravePlatformStatus = failedStatus;
    } finally {
      if (token === braveSearchToken) {
        state.isSearchingBrave = false;
        finishProviderBatchSource(batchId);
        render();
      }
    }
  }, 450);
}

function setPlatformStatusForSource(sourceKey, type, status, message = "") {
  const nextStatus = {};
  getGeminiPlatformsForType(type).forEach((platform) => {
    nextStatus[platform] = { status, message };
  });
  state[sourceKey] = nextStatus;
}

function searchTavilyRatings(batchId) {
  clearTimeout(tavilySearchTimer);

  tavilySearchTimer = setTimeout(async () => {
    const lookup = getProviderLookup();
    const query = lookup?.query?.trim() || "";
    const type = lookup?.type || state.type;
    if (isFileRuntime()) {
      state.tavilyPois = [];
      state.isSearchingTavily = false;
      state.tavilyStatus = "error";
      state.tavilyError = "Tavily Search 需要通过本地代理访问";
      setPlatformStatusForSource("tavilyPlatformStatus", type, "failed", state.tavilyError);
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    if (query.length < 2) {
      state.tavilyPois = [];
      state.isSearchingTavily = false;
      state.tavilyStatus = "ready";
      state.tavilyError = "";
      state.tavilyPlatformStatus = {};
      finishProviderBatchSource(batchId);
      render();
      return;
    }

    const token = ++tavilySearchToken;
    state.isSearchingTavily = true;
    state.tavilyStatus = "searching";
    setPlatformStatusForSource("tavilyPlatformStatus", type, "searching");
    render();

    try {
      const params = getProviderSearchParams(lookup, type);
      const response = await fetch(`/api/tavily/ratings?${params}`);
      const payload = await response.json();

      if (token !== tavilySearchToken) return;

      if (!response.ok) {
        throw new Error(payload.error || `Tavily Search 返回 ${response.status}`);
      }

      if (payload.warning) {
        throw new Error(payload.warning);
      }

      state.tavilyPois = payload.data || [];
      state.tavilyStatus = "ready";
      state.tavilyError = "";
      maybeRetryGoogleWithLocationHints();
      const foundPlatforms = new Set(
        state.tavilyPois.flatMap((poi) =>
          Object.entries(poi.ratings || {})
            .filter(([, rating]) => rating?.source === "tavily")
            .map(([platform]) => platform),
        ),
      );
      const doneStatus = {};
      getGeminiPlatformsForType(type).forEach((platform) => {
        doneStatus[platform] = foundPlatforms.has(platform)
          ? { status: "success", message: "Tavily Search 返回该平台评分" }
          : { status: "missing", message: "Tavily Search 未找到该平台评分" };
      });
      state.tavilyPlatformStatus = doneStatus;
    } catch (error) {
      if (token !== tavilySearchToken) return;
      state.tavilyPois = [];
      state.tavilyStatus = "error";
      state.tavilyError = error.message;
      setPlatformStatusForSource("tavilyPlatformStatus", type, "failed", error.message);
    } finally {
      if (token === tavilySearchToken) {
        state.isSearchingTavily = false;
        finishProviderBatchSource(batchId);
        render();
      }
    }
  }, 500);
}

function searchLiveSources() {
  searchGooglePlaces();
}

function searchProviderSourcesForSelected(poi) {
  if (!poi) return;

  const batchId = beginProviderBatch();
  render();

  searchTripAdvisor(batchId);
  searchBooking(batchId);
  searchYelp(batchId);
  searchMichelin(batchId);
  searchBraveRatings(batchId);
  searchTavilyRatings(batchId);
  searchGeminiRatings(batchId);
}

elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  state.userSelectedPoi = false;
  state.selectedId = null;
  state.providerLookup = null;
  state.googlePois = [];
  state.googleFallbackSignature = "";
  clearProviderResults();
  render();
  searchLiveSources();
});

elements.typeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.type = tab.dataset.type;
    state.userSelectedPoi = false;
    state.selectedId = null;
    state.providerLookup = null;
    state.googlePois = [];
    state.googleFallbackSignature = "";
    clearProviderResults();
    elements.typeTabs.forEach((button) => {
      const isActive = button === tab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
    render();
    searchLiveSources();
  });
});

elements.quickFilters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-query]");
  if (!button) return;
  state.query = button.dataset.query;
  elements.searchInput.value = state.query;
  state.userSelectedPoi = false;
  state.selectedId = null;
  state.providerLookup = null;
  state.googlePois = [];
  state.googleFallbackSignature = "";
  clearProviderResults();
  render();
  searchLiveSources();
});

elements.detailView.addEventListener("click", (event) => {
  const refreshButton = event.target.closest("button[data-know-before-action='refresh']");
  if (refreshButton) {
    maybeGenerateKnowBeforeYouGo({ force: true });
    return;
  }

  const button = event.target.closest("button[data-rating-action]");
  if (!button) return;

  const poi = findPoiById(button.dataset.poiId);
  const source = button.dataset.source;
  if (!poi || !source) return;

  if (button.dataset.ratingAction === "assist") {
    assistRatingLookup(poi, source, button);
  }

  if (button.dataset.ratingAction === "manual") {
    promptForManualRating(poi, source);
  }

  if (button.dataset.ratingAction === "clear") {
    clearManualRating(poi, source);
  }
});

render();
loadGooglePlaces();
