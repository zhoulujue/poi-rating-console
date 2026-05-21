const REQUIRED_SOURCES = {
  restaurant: ["Google", "Yelp", "Michelin", "TripAdvisor"],
  hotel: ["Google", "Booking", "Agoda", "TripAdvisor"],
};

const BUDDY_EMBED_URL = "https://dazigo-v2.vercel.app/";
const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const PROVIDER_BATCH_SOURCES = ["tripadvisor", "booking", "yelp", "michelin", "brave", "tavily", "gemini"];

const USER_RATINGS_STORAGE_KEY = "poi-ratings:user-ratings";
const HOME_LOCATION_STORAGE_KEY = "poi-ratings:home-location";

const PLATFORM_SEARCH_URLS = {
  Agoda: (poi) => `https://www.agoda.com/search?text=${encodeURIComponent(`${poi.name} ${poi.city}`)}`,
  Booking: (poi) => `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${poi.name} ${poi.city}`)}`,
  Google: (poi) => `https://www.google.com/maps/search/${encodeURIComponent(`${poi.name} ${poi.city}`)}`,
  Michelin: (poi) => `https://guide.michelin.com/us/en/search?q=${encodeURIComponent(`${poi.name} ${poi.city}`)}`,
  TripAdvisor: (poi) => `https://www.tripadvisor.com/Search?q=${encodeURIComponent(`${poi.name} ${poi.city}`)}`,
  Yelp: (poi) => `https://www.yelp.com/search?find_desc=${encodeURIComponent(poi.name)}&find_loc=${encodeURIComponent(poi.city)}`,
};

const SCENE_QUERY_MAP = {
  "Date Night": "romantic dinner under $80",
  "Family Fun": "family friendly places",
  Business: "商务出差方便安全的酒店或餐厅",
  Solo: "quiet cafe to read",
  "Night Out": "open late near me",
};

const HOME_NEAR_RECOMMENDATIONS = [
  {
    title: "Date Night",
    query: "romantic dinner under $80",
    description: "132 spots",
    tags: ["Date Night"],
    icon: "☽",
  },
  {
    title: "Slow Brunch",
    query: "slow brunch quiet restaurant",
    description: "89 spots",
    tags: ["Family Fun"],
    icon: "☕",
  },
  {
    title: "After Work",
    query: "after work wine bar dinner",
    description: "67 spots",
    tags: ["Night Out"],
    icon: "♢",
  },
  {
    title: "Solo Read",
    query: "quiet cafe to read solo",
    description: "41 spots",
    tags: ["Solo"],
    icon: "▰",
  },
];

const TRENDING_TEMPLATES = [
  {
    title: "Top 3% in Manhattan",
    query: "Manhattan date night restaurants",
    description: "SoHo · rating-led picks with strong atmosphere signals.",
    tags: ["TOP 3%", "SoHo"],
    imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=84",
  },
  {
    title: "Safe business stays",
    query: "safe convenient business hotels",
    description: "Hotels near transit, offices, and late check-in routes.",
    tags: ["Business", "Hotel"],
    imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=84",
  },
  {
    title: "Family-friendly tables",
    query: "family friendly restaurants",
    description: "Easy seating, calmer rooms, and crowd-pleasing menus.",
    tags: ["Family Fun", "Easy"],
    imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=84",
  },
  {
    title: "Open-late plans",
    query: "night out restaurants bars",
    description: "Useful after dinner, shows, flights, or long workdays.",
    tags: ["Night Out", "Trending"],
    imageUrl: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=84",
  },
];

const imageCache = new Map();
let imageCacheRenderFrame = 0;

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

const savedHomeLocation = loadHomeLocation();
const DEFAULT_HOME_LOCATION = {
  city: "New York",
  district: "Manhattan",
  label: "Manhattan, NY",
  lat: 40.7685167,
  lng: -73.9821938,
};

const state = {
  query: "",
  type: "all",
  selectedId: null,
  userSelectedPoi: false,
  detailPageOpen: false,
  listScrollY: 0,
  pendingDetailScroll: false,
  activeTab: "discover",
  selectedScene: "",
  homeSearchStatus: "idle",
  homeSearchError: "",
  homeCity: savedHomeLocation.city || DEFAULT_HOME_LOCATION.city,
  homeDistrict: savedHomeLocation.district || DEFAULT_HOME_LOCATION.district,
  homeLocationLabel: savedHomeLocation.label || "",
  homeLocationPlaceId: savedHomeLocation.placeId || "",
  homeLocationLat: savedHomeLocation.lat ?? DEFAULT_HOME_LOCATION.lat,
  homeLocationLng: savedHomeLocation.lng ?? DEFAULT_HOME_LOCATION.lng,
  homeTransit: "",
  homeDistance: "",
  cityPickerOpen: false,
  citySearchQuery: "",
  citySearchStatus: "idle",
  citySearchError: "",
  cityPredictions: [],
  exploreStatus: "idle",
  exploreError: "",
  exploreSearchQuery: "",
  explorePredictions: [],
  explorePois: [],
  exploreSearchSignature: "",
  isSearchingExploreNearby: false,
  buddyFrameStatus: "idle",
  routeStops: [],
  routeSearchOpen: false,
  routeSearchQuery: "",
  routeSearchStatus: "idle",
  routeSearchError: "",
  routePredictions: [],
  routePrompt: "",
  routePlanningStatus: "idle",
  routePlanningError: "",
  routePlan: null,
  routePlanWarning: "",
  authStatus: "idle",
  authError: "",
  currentUser: null,
  favorites: [],
  googleClientConfigured: false,
  aiIntent: null,
  aiCandidates: [],
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
  contentGrid: document.querySelector(".content-grid"),
  homeView: document.querySelector("#homeView"),
  homeLocationButton: document.querySelector("#homeLocationButton"),
  homeLocationLabel: document.querySelector("#homeLocationLabel"),
  cityPickerBackdrop: document.querySelector("#cityPickerBackdrop"),
  cityPickerDialog: document.querySelector("#cityPickerDialog"),
  cityPickerClose: document.querySelector("#cityPickerClose"),
  citySearchInput: document.querySelector("#citySearchInput"),
  citySearchStatus: document.querySelector("#citySearchStatus"),
  citySearchResults: document.querySelector("#citySearchResults"),
  mobileTabbar: document.querySelector(".mobile-tabbar"),
  searchInput: document.querySelector("#searchInput"),
  homeSearchForm: document.querySelector("#homeSearchForm"),
  homeSearchButton: document.querySelector("#homeSearchButton"),
  typeTabs: document.querySelectorAll(".type-tab"),
  quickFilters: document.querySelector(".quick-filters"),
  cityFilter: document.querySelector("#cityFilter"),
  districtFilter: document.querySelector("#districtFilter"),
  transitFilter: document.querySelector("#transitFilter"),
  distanceFilter: document.querySelector("#distanceFilter"),
  aiStatus: document.querySelector("#aiStatus"),
  intentBar: document.querySelector("#intentBar"),
  aiResultsSection: document.querySelector("#aiResultsSection"),
  exploreView: document.querySelector("#exploreView"),
  exploreMap: document.querySelector("#exploreMap"),
  exploreSearchForm: document.querySelector("#exploreSearchForm"),
  exploreSearchInput: document.querySelector("#exploreSearchInput"),
  exploreStatus: document.querySelector("#exploreStatus"),
  exploreSuggestions: document.querySelector("#exploreSuggestions"),
  buddyView: document.querySelector("#buddyView"),
  buddyFrame: document.querySelector("#buddyFrame"),
  buddyLoader: document.querySelector("#buddyLoader"),
  buddyStatus: document.querySelector("#buddyStatus"),
  routeView: document.querySelector("#routeView"),
  routeBuilder: document.querySelector("#routeBuilder"),
  routeResult: document.querySelector("#routeResult"),
  routeStops: document.querySelector("#routeStops"),
  routeAddStopButton: document.querySelector("#routeAddStopButton"),
  routeSearchPanel: document.querySelector("#routeSearchPanel"),
  routeSearchInput: document.querySelector("#routeSearchInput"),
  routeSearchStatus: document.querySelector("#routeSearchStatus"),
  routeSuggestions: document.querySelector("#routeSuggestions"),
  routePromptInput: document.querySelector("#routePromptInput"),
  routeGenerateButton: document.querySelector("#routeGenerateButton"),
  routePlanStatus: document.querySelector("#routePlanStatus"),
  routeResultTitle: document.querySelector("#routeResultTitle"),
  routeResultMeta: document.querySelector("#routeResultMeta"),
  routeFlowTitle: document.querySelector("#routeFlowTitle"),
  routeMap: document.querySelector("#routeMap"),
  routeItinerary: document.querySelector("#routeItinerary"),
  routeResultStatus: document.querySelector("#routeResultStatus"),
  routeStartButton: document.querySelector("#routeStartButton"),
  routeReplanButton: document.querySelector("#routeReplanButton"),
  meView: document.querySelector("#meView"),
  meSignedOut: document.querySelector("#meSignedOut"),
  googleSignInButton: document.querySelector("#googleSignInButton"),
  meAuthStatus: document.querySelector("#meAuthStatus"),
  meProfile: document.querySelector("#meProfile"),
  meAvatar: document.querySelector("#meAvatar"),
  meName: document.querySelector("#meName"),
  meEmail: document.querySelector("#meEmail"),
  meLogoutButton: document.querySelector("#meLogoutButton"),
  meFavoriteCount: document.querySelector("#meFavoriteCount"),
  meFavoritesList: document.querySelector("#meFavoritesList"),
  nearYouCity: document.querySelector("#nearYouCity"),
  nearYouRail: document.querySelector("#nearYouRail"),
  trendingCity: document.querySelector("#trendingCity"),
  trendingGrid: document.querySelector("#trendingGrid"),
  poiList: document.querySelector("#poiList"),
  detailPanel: document.querySelector(".detail-panel"),
  detailView: document.querySelector("#detailView"),
  resultCount: document.querySelector("#resultCount"),
  resultsTitle: document.querySelector("#resultsTitle"),
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
let exploreMap = null;
let exploreMarkers = [];
let routeMap = null;
let routeDirectionsService = null;
let routeDirectionsRenderer = null;
let routeMapMarkers = [];
let routeMapPolyline = null;
let routeMapRenderedSignature = "";
let googleSearchTimer = null;
let googleSearchToken = 0;
let citySearchTimer = null;
let citySearchToken = 0;
let exploreSearchTimer = null;
let exploreSearchToken = 0;
let exploreMapSearchToken = 0;
let routeSearchTimer = null;
let routeSearchToken = 0;
let routePlanToken = 0;
let googleIdentityLoadPromise = null;
let googleSignInInitialized = false;
let googleFallbackTimer = null;
let homeSearchToken = 0;
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

function loadHomeLocation() {
  try {
    const stored = JSON.parse(localStorage.getItem(HOME_LOCATION_STORAGE_KEY) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function saveHomeLocation() {
  localStorage.setItem(
    HOME_LOCATION_STORAGE_KEY,
    JSON.stringify({
      city: state.homeCity,
      district: state.homeDistrict,
      label: state.homeLocationLabel,
      placeId: state.homeLocationPlaceId,
      lat: state.homeLocationLat,
      lng: state.homeLocationLng,
    }),
  );
}

function scheduleImageCacheRender() {
  if (imageCacheRenderFrame) return;
  imageCacheRenderFrame = requestAnimationFrame(() => {
    imageCacheRenderFrame = 0;
    render();
  });
}

function warmImageCache(url) {
  if (!url) return null;
  const cached = imageCache.get(url);
  if (cached) return cached;

  const entry = {
    url,
    status: "loading",
    image: null,
  };
  const image = new Image();
  entry.image = image;
  image.decoding = "async";
  image.loading = "eager";
  image.onload = async () => {
    try {
      await image.decode?.();
    } catch {
      // A loaded image can still fail decode() in some browsers; keep it usable.
    }
    entry.status = "loaded";
    scheduleImageCacheRender();
  };
  image.onerror = () => {
    entry.status = "error";
    scheduleImageCacheRender();
  };
  imageCache.set(url, entry);
  image.src = url;
  return entry;
}

function isCachedImageLoaded(url) {
  return imageCache.get(url)?.status === "loaded";
}

function escapeCssUrl(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "");
}

function renderCachedImage(url, alt = "", fallback = "") {
  if (!url) return fallback;
  const entry = warmImageCache(url);
  if (entry?.status !== "loaded") return fallback;

  return `<img class="cached-image is-loaded" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="eager" decoding="sync" />`;
}

function renderCachedBackgroundStyle(url, variableName = "--trend-image") {
  if (!url) return "";
  const entry = warmImageCache(url);
  if (entry?.status !== "loaded") return "";
  return ` style="${variableName}: url('${escapeHtml(escapeCssUrl(url))}')"`;
}

function warmPoiImageCache(pois = []) {
  pois.forEach((poi) => warmImageCache(poi.photoUrl));
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

function getPoiBadge(poi, index) {
  const googleRating = poi.ratings.Google?.score || 0;
  const average = averageScore(poi);
  if (index === 0 && average >= 88) return { label: "TOP 3%", tone: "top" };
  if (poi.tags?.includes("AI Pick") && index <= 1) return { label: "EDITOR'S PICK", tone: "editor" };
  if (googleRating >= 4.5 || average >= 86) return { label: "VERIFIED", tone: "verified" };
  return null;
}

function getPoiDistanceLabel(poi) {
  if (poi.distanceText) return poi.distanceText;
  if (poi.area && poi.city && poi.area !== poi.city) return poi.area;
  return poi.city || "Nearby";
}

function getPoiMetaParts(poi) {
  const category = (poi.category || "").split("·")[0]?.trim() || (poi.type === "hotel" ? "Hotel" : "Restaurant");
  const price = poi.price && !poi.price.includes("暂无") ? poi.price : "";
  const distance = getPoiDistanceLabel(poi);
  return [category, price, distance].filter(Boolean);
}

function getFriendlySearchError(error) {
  const message = error?.message || String(error || "");
  if (/load failed|failed to fetch|networkerror|fetch failed|abort|cancel/i.test(message)) {
    return "搜索请求暂时失败，请检查网络后重试。";
  }
  return message || "搜索暂时不可用，请稍后重试。";
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

function isCompactNavigation() {
  return Boolean(window.matchMedia?.("(max-width: 980px)").matches);
}

function getCurrentPathForHistory() {
  return `${window.location.pathname}${window.location.search}`;
}

function replaceListHistoryState() {
  if (!window.history?.replaceState) return;
  window.history.replaceState(
    {
      poiApp: true,
      view: "list",
      listScrollY: state.listScrollY,
    },
    "",
    getCurrentPathForHistory(),
  );
}

function initializeNavigationHistory() {
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
  if (!window.history?.replaceState || window.history.state?.poiApp) return;
  state.listScrollY = window.scrollY || 0;
  replaceListHistoryState();
}

function applyNavigationMode() {
  const compact = isCompactNavigation();
  const showDetailPage = compact && state.detailPageOpen && Boolean(state.selectedId);

  elements.contentGrid?.classList.toggle("is-detail-page", showDetailPage);
  elements.contentGrid?.classList.toggle("is-list-page", compact && !showDetailPage);
  elements.homeView?.setAttribute("aria-hidden", showDetailPage ? "true" : "false");
  elements.detailPanel?.setAttribute("aria-hidden", compact && !showDetailPage ? "true" : "false");
}

function openDetailPageForCompact(id) {
  if (!isCompactNavigation()) {
    state.detailPageOpen = false;
    return;
  }

  state.listScrollY = window.scrollY || 0;
  state.detailPageOpen = true;
  if (window.history?.pushState) {
    replaceListHistoryState();
    window.history.pushState(
      {
        poiApp: true,
        view: "detail",
        selectedId: id,
        listScrollY: state.listScrollY,
      },
      "",
      getCurrentPathForHistory(),
    );
  }
}

function restoreListPageScroll(scrollY = state.listScrollY) {
  const targetScrollY = Math.max(0, scrollY || 0);
  const restore = () => window.scrollTo(0, targetScrollY);

  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 80);
    setTimeout(restore, 260);
  });
}

function closeDetailPage() {
  if (!state.detailPageOpen) return;

  if (window.history?.state?.poiApp && window.history.state.view === "detail") {
    window.history.back();
    return;
  }

  state.detailPageOpen = false;
  render();
  restoreListPageScroll();
}

function scrollDetailIntoViewIfCompact() {
  if (!elements.detailPanel || !isCompactNavigation() || !state.detailPageOpen) return;

  const scrollToDetail = () => {
    window.scrollTo(0, 0);
  };

  requestAnimationFrame(() => {
    scrollToDetail();
    setTimeout(scrollToDetail, 250);
    setTimeout(scrollToDetail, 800);
  });
}

function handleNavigationPop(event) {
  const nextState = event.state;

  if (nextState?.poiApp && nextState.view === "detail" && nextState.selectedId) {
    state.selectedId = nextState.selectedId;
    state.userSelectedPoi = true;
    state.detailPageOpen = true;
    state.listScrollY = nextState.listScrollY || state.listScrollY || 0;
    render();
    requestAnimationFrame(() => window.scrollTo(0, 0));
    return;
  }

  state.detailPageOpen = false;
  if (nextState?.poiApp && Number.isFinite(nextState.listScrollY)) {
    state.listScrollY = nextState.listScrollY;
  }
  render();
  restoreListPageScroll();
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

  [
    ...state.googlePois,
    ...state.explorePois,
    ...state.tripAdvisorPois,
    ...state.bookingPois,
    ...state.yelpPois,
    ...state.michelinPois,
    ...state.geminiPois,
    ...state.bravePois,
    ...state.tavilyPois,
  ].forEach((poi) => {
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
    return dedupeExplorePois([...state.googlePois, ...state.explorePois])
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
  state.pendingDetailScroll = true;
  openDetailPageForCompact(id);
  const selectedPoi = findPoiById(id);
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
  warmPoiImageCache(pois);
  elements.resultCount.textContent = `${pois.length} RESULTS · SORTED BY RATING`;
  elements.poiList.innerHTML = "";

  pois.forEach((poi, index) => {
    const card = document.createElement("button");
    card.className = `poi-card ${poi.id === state.selectedId ? "is-selected" : ""}`;
    card.type = "button";
    card.addEventListener("click", () => selectPoi(poi.id));

    const badge = getPoiBadge(poi, index);
    const badgeMarkup = badge
      ? `<span class="result-badge is-${badge.tone}">${escapeHtml(badge.label)}</span>`
      : "";
    const mediaClass = `poi-card-media tone-${(index % 4) + 1}`;
    const mediaFallback = `<span>${escapeHtml((poi.name || "?").slice(0, 1))}</span>`;
    const mediaMarkup = renderCachedImage(poi.photoUrl, "", mediaFallback);
    const meta = getPoiMetaParts(poi).map(escapeHtml).join(" · ");
    const reason = poi.aiReason || poi.description || "";
    const miniScores = sourceSummary(poi)
      .map(
        ({ source, value }) => `
          <div class="mini-score">
            <strong>${escapeHtml(value)}</strong>
            <span>${escapeHtml(source)}</span>
          </div>
        `,
      )
      .join("");

    card.innerHTML = `
      <div class="${mediaClass}" aria-hidden="true">${mediaMarkup}</div>
      <div class="poi-card-main">
        <div class="poi-title-row">
          <h3>${escapeHtml(poi.name)}</h3>
          ${badgeMarkup}
        </div>
        <p class="poi-meta">${meta}</p>
        ${reason ? `<p class="poi-reason">${escapeHtml(reason)}</p>` : ""}
        <div class="mini-scores">${miniScores}</div>
      </div>
    `;
    elements.poiList.append(card);
  });
}

function renderVisual(poi) {
  if (poi.photoUrl) {
    const imageMarkup = renderCachedImage(poi.photoUrl, poi.name);
    if (!imageMarkup) {
      return renderVisualFallback(poi);
    }

    return `
      <div class="visual-card">
        ${imageMarkup}
      </div>
    `;
  }

  return renderVisualFallback(poi);
}

function renderVisualFallback(poi) {
  const isHotel = poi.type === "hotel";
  const title = isHotel ? "Hotel rating visual" : "Restaurant rating visual";

  return `
    <div class="visual-card visual-fallback ${isHotel ? "is-hotel" : "is-restaurant"}" aria-label="${title}">
      <span>${escapeHtml((poi.name || "?").slice(0, 1))}</span>
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
  const selected = findPoiById(state.selectedId);
  const merged = mergeProviderRatingsIntoPoi(selected);
  if (!merged) return null;

  const sourcePois = [
    ...state.googlePois.filter((poi) => isSamePoiReference(poi, selected)),
    ...state.explorePois.filter((poi) => isSamePoiReference(poi, selected)),
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
  const typeLabel = poi.type === "restaurant" ? "餐厅" : "酒店";
  const platformNote =
    poi.type === "restaurant" ? "Google / Yelp / Michelin / TripAdvisor" : "Google / Booking / Agoda / TripAdvisor";
  const badgeLabel = sourceCount ? `${sourceCount}/${requiredCount} sources` : "collecting";
  const locationText = [poi.area, poi.city].filter(Boolean).join(", ");
  const googleMapsUrl = PLATFORM_SEARCH_URLS.Google?.(poi);
  const primarySearchUrl = googleMapsUrl || PLATFORM_SEARCH_URLS[REQUIRED_SOURCES[poi.type][0]]?.(poi);
  const secondarySearchUrl = REQUIRED_SOURCES[poi.type]
    .map((source) => PLATFORM_SEARCH_URLS[source]?.(poi))
    .find((url) => url && url !== primarySearchUrl);
  const isSaved = isFavoritePoi(poi);
  const favoriteLabel = isSaved ? "取消收藏" : "收藏";

  elements.detailView.innerHTML = `
    <div class="detail-screen">
      <div class="hero-detail">
        <div class="detail-photo-hero">
          ${renderVisual(poi)}
          <div class="detail-mobile-nav">
            <button type="button" data-detail-nav="back" aria-label="返回列表">←</button>
            <span>Details</span>
            <button type="button" aria-label="${favoriteLabel}" aria-pressed="${isSaved}" data-favorite-action="toggle" data-poi-id="${escapeHtml(poi.id)}" class="detail-favorite ${isSaved ? "is-saved" : ""}">${isSaved ? "♥" : "♡"}</button>
          </div>
          <div class="detail-photo-dots" aria-hidden="true">
            <span class="is-active"></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>

        <div class="detail-content-sheet">
          <div class="detail-kicker">${escapeHtml(poi.category || typeLabel)} · ${escapeHtml(typeLabel)}</div>
          <div class="detail-title-row">
            <h2>${escapeHtml(poi.name)}</h2>
            <div class="detail-title-actions">
              <span class="detail-rank-badge">${escapeHtml(badgeLabel)}</span>
              <button type="button" aria-label="${favoriteLabel}" aria-pressed="${isSaved}" data-favorite-action="toggle" data-poi-id="${escapeHtml(poi.id)}" class="detail-inline-favorite ${isSaved ? "is-saved" : ""}">${isSaved ? "♥" : "♡"}</button>
            </div>
          </div>
          <p class="detail-meta">${escapeHtml(locationText || poi.city)} · ${escapeHtml(poi.price)} · ${escapeHtml(poi.description)}</p>

          <section class="ratings-section cross-platform-card">
            <div class="cross-platform-heading">
              <div>
                <span>Cross-platform</span>
                <strong>${avg || "N/A"}<small>${avg ? " / 100" : ""}</small></strong>
              </div>
              <span class="platform-note">${escapeHtml(platformNote)}</span>
            </div>
            <div class="rating-grid">${renderRatingCards(poi)}</div>
          </section>

          ${renderKnowBeforeYouGoCard()}

          <div class="summary-grid">
            <div class="summary-tile">
              <span>覆盖来源</span>
              <strong>${sourceCount}/${requiredCount}</strong>
            </div>
            <div class="summary-tile">
              <span>最高信号</span>
              <strong>${bestSource ? escapeHtml(bestSource[0]) : "暂无"}</strong>
            </div>
            <div class="summary-tile">
              <span>参考价格</span>
              <strong>${escapeHtml(poi.price)}</strong>
            </div>
          </div>

          <div class="detail-action-row">
            ${primarySearchUrl ? `<a class="detail-action-primary" href="${escapeHtml(primarySearchUrl)}" target="_blank" rel="noreferrer">Open listing</a>` : ""}
            ${secondarySearchUrl ? `<a class="detail-action-secondary" href="${escapeHtml(secondarySearchUrl)}" target="_blank" rel="noreferrer">Compare more</a>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSelectionPrompt() {
  elements.detailView.innerHTML = `
    <div class="empty-state">
      <div class="empty-visual" aria-hidden="true">
        <span></span>
      </div>
      <h2>选择一个 POI</h2>
      <p>从 AI Picks、Near You 或 Trending 中选择一个地点后，我会继续查询各平台评分和 Know Before You Go。</p>
    </div>
  `;
}

function getAllSelectablePois() {
  const seen = new Set();
  return [
    ...state.googlePois,
    ...state.explorePois,
    ...state.tripAdvisorPois,
    ...state.bookingPois,
    ...state.yelpPois,
    ...state.michelinPois,
    ...state.geminiPois,
    ...state.bravePois,
    ...state.tavilyPois,
    ...poiData,
  ].filter((poi) => {
    const key = poi.id || poi.placeId || `${poi.type}:${normalizeText(poi.name)}:${normalizeText(poi.city)}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSamePoiReference(poi, target) {
  if (!poi || !target) return false;
  const poiIds = [poi.id, poi.placeId, poi.placeId ? `google-${poi.placeId}` : ""].filter(Boolean);
  const targetIds = [target.id, target.placeId, target.placeId ? `google-${target.placeId}` : ""].filter(Boolean);
  if (poiIds.some((id) => targetIds.includes(id))) return true;
  return (
    poi.type === target.type &&
    normalizeText(poi.name) === normalizeText(target.name) &&
    normalizeText(poi.city) === normalizeText(target.city)
  );
}

function findPoiById(id) {
  if (!id) return undefined;
  return getAllSelectablePois().find((poi) => {
    return poi.id === id || poi.placeId === id || (poi.placeId && `google-${poi.placeId}` === id);
  });
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
  if (type === "restaurant") return ["Yelp"];
  return [];
}

function stripSearchFallbackMichelinRatings(pois = []) {
  return pois
    .map((poi) => {
      const rating = poi?.ratings?.Michelin;
      if (!rating || !["gemini", "brave", "tavily"].includes(rating.source)) {
        return poi;
      }

      const ratings = { ...poi.ratings };
      delete ratings.Michelin;

      return {
        ...poi,
        ratings,
        tags: (poi.tags || []).filter((tag) => tag !== "Michelin"),
      };
    })
    .filter((poi) => Object.keys(poi?.ratings || {}).length);
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

function getHomeFilters() {
  return {
    city: elements.cityFilter?.value.trim() || state.homeCity || "",
    district: elements.districtFilter?.value.trim() || state.homeDistrict || "",
    transit: elements.transitFilter?.value.trim() || state.homeTransit || "",
    distance: elements.distanceFilter?.value || state.homeDistance || "",
    type: state.type,
  };
}

function getHomeSearchQuery(baseQuery = state.query) {
  const filters = getHomeFilters();
  return [
    baseQuery,
    state.selectedScene ? SCENE_QUERY_MAP[state.selectedScene] || state.selectedScene : "",
    filters.district,
    filters.city,
    filters.transit,
    filters.distance,
  ]
    .filter(Boolean)
    .join(" ");
}

function getHomeLocationDisplay(filters = getHomeFilters()) {
  if (state.homeLocationLabel) return state.homeLocationLabel;
  if (filters.district) {
    return `${filters.district}, ${state.homeCity === "New York" ? "NY" : state.homeCity || filters.city}`;
  }
  return state.homeCity || filters.city || "New York";
}

function getAddressComponent(components = [], type, field = "long_name") {
  const component = components.find((item) => item.types?.includes(type));
  return component?.[field] || "";
}

function normalizeLatLng(location) {
  if (!location) return { lat: null, lng: null };
  const lat = typeof location.lat === "function" ? location.lat() : location.lat;
  const lng = typeof location.lng === "function" ? location.lng() : location.lng;
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function mapGooglePlaceToHomeLocation(place) {
  const components = place.address_components || [];
  const locality =
    getAddressComponent(components, "locality") ||
    getAddressComponent(components, "postal_town") ||
    getAddressComponent(components, "administrative_area_level_3");
  const admin2 = getAddressComponent(components, "administrative_area_level_2");
  const admin1 = getAddressComponent(components, "administrative_area_level_1");
  const admin1Short = getAddressComponent(components, "administrative_area_level_1", "short_name");
  const country = getAddressComponent(components, "country", "short_name");
  const sublocality =
    getAddressComponent(components, "sublocality_level_1") ||
    getAddressComponent(components, "sublocality") ||
    getAddressComponent(components, "neighborhood");
  const placeName = place.name || place.formatted_address?.split(",")[0]?.trim() || "";
  const city = locality || (country === "US" ? admin2 : admin1) || placeName || "Selected city";
  let district = "";

  if (placeName && city && normalizeText(placeName) !== normalizeText(city)) {
    district = placeName;
  } else if (sublocality && normalizeText(sublocality) !== normalizeText(city)) {
    district = sublocality;
  }

  const region = country === "US" ? admin1Short : "";
  const label = district
    ? `${district}, ${region || city}`
    : [city, region].filter(Boolean).join(", ") || place.formatted_address || city;
  const { lat, lng } = normalizeLatLng(place.geometry?.location);

  return {
    city,
    district,
    label,
    placeId: place.place_id || "",
    lat,
    lng,
  };
}

function getCityPredictionParts(prediction) {
  const formatting = prediction.structured_formatting || {};
  const terms = prediction.terms || [];
  const main = formatting.main_text || terms[0]?.value || prediction.description || "";
  const secondary =
    formatting.secondary_text ||
    terms
      .slice(1)
      .map((term) => term.value)
      .join(", ");
  return { main, secondary };
}

function scoreCityPrediction(prediction, query) {
  const { main, secondary } = getCityPredictionParts(prediction);
  const queryKey = normalizeText(query);
  const mainKey = normalizeText(main);
  const secondaryKey = normalizeText(secondary);
  let score = 0;

  if (mainKey === queryKey) score += 1200;
  else if (mainKey.startsWith(queryKey)) score += 260;
  if (secondaryKey.includes(normalizeText(state.homeCity))) score += 360;
  if (state.homeDistrict && secondaryKey.includes(normalizeText(state.homeDistrict))) score += 180;
  if (prediction.types?.includes("locality")) score += 80;
  if (prediction.types?.includes("sublocality") || prediction.types?.includes("neighborhood")) score += 60;
  return score;
}

function renderCityPicker() {
  if (!elements.cityPickerBackdrop) return;

  elements.cityPickerBackdrop.hidden = !state.cityPickerOpen;
  elements.cityPickerBackdrop.classList.toggle("is-open", state.cityPickerOpen);
  elements.homeLocationButton?.setAttribute("aria-expanded", String(state.cityPickerOpen));
  if (!state.cityPickerOpen) return;

  if (elements.citySearchInput && document.activeElement !== elements.citySearchInput) {
    elements.citySearchInput.value = state.citySearchQuery;
  }

  const statusLabels = {
    idle: state.citySearchQuery.trim().length < 2 ? "输入城市名后搜索。" : "",
    loading: "正在准备 Google Maps 城市搜索...",
    searching: "正在搜索城市...",
    ready: state.cityPredictions.length ? "" : "没有找到匹配城市。",
    error: state.citySearchError || "Google Maps 城市搜索暂不可用。",
  };

  if (elements.citySearchStatus) {
    elements.citySearchStatus.textContent = statusLabels[state.citySearchStatus] || "";
    elements.citySearchStatus.classList.toggle("is-error", state.citySearchStatus === "error");
  }

  if (elements.citySearchResults) {
    elements.citySearchResults.innerHTML = state.cityPredictions
      .map((prediction) => {
        const { main, secondary } = getCityPredictionParts(prediction);
        return `
          <button type="button" class="city-result-button" data-city-place-id="${escapeHtml(prediction.place_id)}">
            <span>
              <span class="city-result-main">${escapeHtml(main)}</span>
              ${secondary ? `<span class="city-result-secondary">${escapeHtml(secondary)}</span>` : ""}
            </span>
            <span class="city-result-arrow" aria-hidden="true">→</span>
          </button>
        `;
      })
      .join("");
  }
}

function openCityPicker() {
  state.cityPickerOpen = true;
  state.citySearchQuery = "";
  state.cityPredictions = [];
  state.citySearchError = "";
  state.citySearchStatus = googleAutocompleteService
    ? "idle"
    : state.googleStatus === "loading"
      ? "loading"
      : "error";
  if (!googleAutocompleteService && state.googleStatus !== "loading") {
    state.citySearchError = state.googleError || "Google Maps 城市搜索尚未连接。";
  }
  render();
  requestAnimationFrame(() => elements.citySearchInput?.focus());
}

function closeCityPicker() {
  state.cityPickerOpen = false;
  state.citySearchQuery = "";
  state.cityPredictions = [];
  state.citySearchError = "";
  state.citySearchStatus = "idle";
  citySearchToken += 1;
  clearTimeout(citySearchTimer);
  render();
}

function scheduleCitySearch() {
  clearTimeout(citySearchTimer);
  const query = elements.citySearchInput?.value.trim() || "";
  state.citySearchQuery = query;

  if (query.length < 2) {
    state.cityPredictions = [];
    state.citySearchStatus = googleAutocompleteService ? "idle" : "loading";
    render();
    return;
  }

  state.citySearchStatus = "searching";
  state.citySearchError = "";
  render();
  citySearchTimer = setTimeout(() => searchCitiesWithGoogle(query), 220);
}

async function searchCitiesWithGoogle(query) {
  const token = ++citySearchToken;

  if (!googleAutocompleteService) {
    state.citySearchStatus = state.googleStatus === "loading" ? "loading" : "error";
    state.citySearchError = state.googleError || "Google Maps 城市搜索尚未连接。";
    render();
    return;
  }

  const normalizePredictionKey = (prediction) => normalizeText(prediction.description || prediction.place_id);

  try {
    const primary = await getGooglePredictions(query, { types: ["(cities)"] });
    if (token !== citySearchToken) return;
    let predictions = primary.predictions || [];

    const regional = await getGooglePredictions(query, { types: ["(regions)"] });
    if (token !== citySearchToken) return;
    predictions = [...predictions, ...(regional.predictions || [])];

    const seen = new Set();
    state.cityPredictions = predictions
      .filter((prediction) => {
        const key = normalizePredictionKey(prediction);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => scoreCityPrediction(b, query) - scoreCityPrediction(a, query))
      .slice(0, 6);
    state.citySearchStatus = "ready";
    state.citySearchError = "";
  } catch (error) {
    if (token !== citySearchToken) return;
    state.cityPredictions = [];
    state.citySearchStatus = "error";
    state.citySearchError = getFriendlySearchError(error);
  } finally {
    if (token === citySearchToken) render();
  }
}

async function selectCityPrediction(placeId) {
  if (!placeId || !googlePlacesService) return;
  const token = ++citySearchToken;
  state.citySearchStatus = "searching";
  state.citySearchError = "";
  render();

  try {
    const { place, status } = await getGooglePlaceDetails(placeId, [
      "name",
      "formatted_address",
      "place_id",
      "address_components",
      "geometry",
      "types",
    ]);
    if (token !== citySearchToken) return;

    if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
      throw new Error(`Google Maps 返回 ${status}`);
    }

    const nextLocation = mapGooglePlaceToHomeLocation(place);
    const shouldRefreshSearch = state.query.trim().length >= 2;
    state.homeCity = nextLocation.city || state.homeCity;
    state.homeDistrict = nextLocation.district || "";
    state.homeLocationLabel = nextLocation.label || "";
    state.homeLocationPlaceId = nextLocation.placeId || "";
    state.homeLocationLat = nextLocation.lat;
    state.homeLocationLng = nextLocation.lng;
    saveHomeLocation();
    resetExploreForLocationChange();
    closeCityPicker();
    if (shouldRefreshSearch) {
      runHomeSearch(state.query);
    }
  } catch (error) {
    if (token !== citySearchToken) return;
    state.citySearchStatus = "error";
    state.citySearchError = getFriendlySearchError(error);
    render();
  }
}

function setActiveHomeTab(tab) {
  state.activeTab = tab;
  elements.mobileTabbar?.querySelectorAll("button[data-home-nav]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.homeNav === tab);
  });
}

function getExploreCenter() {
  return {
    lat: Number.isFinite(state.homeLocationLat) ? state.homeLocationLat : DEFAULT_HOME_LOCATION.lat,
    lng: Number.isFinite(state.homeLocationLng) ? state.homeLocationLng : DEFAULT_HOME_LOCATION.lng,
  };
}

function getExploreLocationText() {
  return getHomeLocationDisplay(getHomeFilters()).replace(/^📍\s*/, "");
}

function getExploreSignature() {
  const center = getExploreCenter();
  return [
    normalizeText(state.homeCity),
    normalizeText(state.homeDistrict),
    center.lat.toFixed(4),
    center.lng.toFixed(4),
  ].join(":");
}

function clearExploreMarkers() {
  exploreMarkers.forEach((marker) => marker.setMap(null));
  exploreMarkers = [];
}

function resetExploreForLocationChange() {
  state.exploreSearchSignature = "";
  state.explorePois = [];
  state.isSearchingExploreNearby = false;
  clearExploreMarkers();
}

function getExplorePlaceFields() {
  return ["name", "formatted_address", "place_id", "rating", "user_ratings_total", "types", "price_level", "photos", "geometry"];
}

function getExplorePredictionParts(prediction) {
  return getCityPredictionParts(prediction);
}

function addExplorePoi(poi) {
  if (!poi) return null;
  const key = poi.placeId || poi.id || `${poi.type}:${normalizeText(poi.name)}:${normalizeText(poi.city)}`;
  const nextPois = state.explorePois.filter((item) => {
    const itemKey = item.placeId || item.id || `${item.type}:${normalizeText(item.name)}:${normalizeText(item.city)}`;
    return itemKey !== key;
  });
  state.explorePois = [poi, ...nextPois].slice(0, 48);
  return poi;
}

function dedupeExplorePois(pois) {
  const seen = new Set();
  return pois.filter((poi) => {
    const key = poi.placeId || `${poi.type}:${normalizeText(poi.name)}:${normalizeText(poi.city)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensureExploreMap() {
  if (state.activeTab !== "explore" || !elements.exploreMap || !window.google?.maps) return null;
  const center = getExploreCenter();

  if (!exploreMap) {
    exploreMap = new google.maps.Map(elements.exploreMap, {
      center,
      zoom: state.homeDistrict ? 14 : 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: true,
      gestureHandling: "greedy",
    });
  } else {
    google.maps.event.trigger(exploreMap, "resize");
    exploreMap.setCenter(center);
  }

  return exploreMap;
}

function renderExploreMarkers() {
  if (!exploreMap || !window.google?.maps) return;
  clearExploreMarkers();

  state.explorePois.forEach((poi) => {
    if (!Number.isFinite(poi.lat) || !Number.isFinite(poi.lng)) return;
    const isHotel = poi.type === "hotel";
    const marker = new google.maps.Marker({
      map: exploreMap,
      position: { lat: poi.lat, lng: poi.lng },
      title: poi.name,
      label: {
        text: isHotel ? "H" : "R",
        color: "#fff",
        fontWeight: "900",
        fontSize: "12px",
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 13,
        fillColor: isHotel ? "#315b9d" : "#1d6f5f",
        fillOpacity: 1,
        strokeColor: "#fffdfa",
        strokeWeight: 3,
      },
      zIndex: isHotel ? 20 : 30,
    });
    marker.addListener("click", () => {
      addExplorePoi(poi);
      selectPoi(poi.id);
    });
    exploreMarkers.push(marker);
  });
}

function prepareExploreMap() {
  if (state.activeTab !== "explore") return;
  if (!googlePlacesService || !window.google?.maps) {
    if (state.exploreStatus !== "loading") {
      state.exploreStatus = "loading";
      state.exploreError = "";
      render();
    }
    return;
  }

  ensureExploreMap();
  if (!exploreMap) return;
  const signature = getExploreSignature();
  if (state.exploreSearchSignature === signature && state.explorePois.length) {
    renderExploreMarkers();
    return;
  }
  if (state.isSearchingExploreNearby && state.exploreSearchSignature === signature) return;

  searchExploreNearby();
}

async function searchExploreNearby({ force = false } = {}) {
  if (!googlePlacesService || !window.google?.maps) return;
  const signature = getExploreSignature();
  if (!force && state.exploreSearchSignature === signature && state.explorePois.length) {
    renderExploreMarkers();
    return;
  }

  const token = ++exploreMapSearchToken;
  const center = getExploreCenter();
  const location = new google.maps.LatLng(center.lat, center.lng);
  const locationText = getExploreLocationText();
  state.exploreSearchSignature = signature;
  state.exploreStatus = "loading";
  state.exploreError = "";
  state.isSearchingExploreNearby = true;
  render();

  try {
    const baseRequest = {
      location,
      radius: 50000,
      fields: getExplorePlaceFields(),
    };
    const [restaurants, hotels] = await Promise.all([
      runGoogleTextSearch({
        ...baseRequest,
        query: `restaurants in ${locationText}`,
        type: "restaurant",
      }),
      runGoogleTextSearch({
        ...baseRequest,
        query: `hotels in ${locationText}`,
        type: "lodging",
      }),
    ]);

    if (token !== exploreMapSearchToken) return;

    const nextPois = [
      ...((restaurants.status === google.maps.places.PlacesServiceStatus.OK && restaurants.results) || []),
      ...((hotels.status === google.maps.places.PlacesServiceStatus.OK && hotels.results) || []),
    ]
      .slice(0, 36)
      .map(mapGooglePlaceToPoi)
      .filter((poi) => poi.type === "restaurant" || poi.type === "hotel");

    state.explorePois = dedupeExplorePois(nextPois);
    state.exploreStatus = "ready";
    state.exploreError = "";
    state.isSearchingExploreNearby = false;
    render();
    requestAnimationFrame(() => {
      ensureExploreMap();
      renderExploreMarkers();
    });
  } catch (error) {
    if (token !== exploreMapSearchToken) return;
    state.explorePois = [];
    state.exploreStatus = "error";
    state.exploreError = getFriendlySearchError(error);
    state.isSearchingExploreNearby = false;
    render();
  }
}

function renderExploreState() {
  const active = state.activeTab === "explore";
  elements.homeView?.classList.toggle("is-explore", active);
  elements.exploreView.hidden = !active;
  elements.contentGrid?.classList.toggle("is-explore", active && !(state.userSelectedPoi && state.selectedId));
  elements.mobileTabbar?.querySelectorAll("button[data-home-nav]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.homeNav === state.activeTab);
  });

  if (!active) return;

  if (elements.exploreSearchInput && document.activeElement !== elements.exploreSearchInput) {
    elements.exploreSearchInput.value = state.exploreSearchQuery;
  }

  const statusLabels = {
    idle: "正在准备地图...",
    loading: "正在加载附近餐厅和酒店...",
    searching: "正在搜索 Google Maps...",
    ready: state.explorePredictions.length
      ? ""
      : `${state.explorePois.length || 0} 个地点 · ${getExploreLocationText()}`,
    error: state.exploreError || "Explore 暂时不可用。",
  };

  if (elements.exploreStatus) {
    elements.exploreStatus.textContent = statusLabels[state.exploreStatus] || "";
    elements.exploreStatus.classList.toggle("is-error", state.exploreStatus === "error");
  }

  if (elements.exploreSuggestions) {
    elements.exploreSuggestions.hidden = !state.explorePredictions.length;
    elements.exploreSuggestions.innerHTML = state.explorePredictions
      .map((prediction) => {
        const { main, secondary } = getExplorePredictionParts(prediction);
        return `
          <button type="button" class="explore-suggestion-button" data-explore-place-id="${escapeHtml(prediction.place_id)}">
            <span>
              <span class="explore-suggestion-main">${escapeHtml(main)}</span>
              ${secondary ? `<span class="explore-suggestion-secondary">${escapeHtml(secondary)}</span>` : ""}
            </span>
            <span class="explore-suggestion-arrow" aria-hidden="true">→</span>
          </button>
        `;
      })
      .join("");
  }

  requestAnimationFrame(prepareExploreMap);
}

function ensureBuddyFrameLoaded() {
  if (!elements.buddyFrame || state.buddyFrameStatus !== "idle") return;
  state.buddyFrameStatus = "loading";
  elements.buddyFrame.src = BUDDY_EMBED_URL;
}

function renderBuddyState() {
  const active = state.activeTab === "buddy";
  elements.homeView?.classList.toggle("is-buddy", active);
  elements.buddyView.hidden = !active;
  elements.contentGrid?.classList.toggle("is-buddy", active);
  elements.mobileTabbar?.querySelectorAll("button[data-home-nav]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.homeNav === state.activeTab);
  });

  if (!active) return;

  ensureBuddyFrameLoaded();
  if (elements.buddyLoader) {
    elements.buddyLoader.hidden = state.buddyFrameStatus === "ready";
  }
  if (elements.buddyStatus) {
    elements.buddyStatus.textContent = state.buddyFrameStatus === "error" ? "Buddy 暂时无法加载" : "Buddy 加载中...";
  }
}

function getRoutePlaceFields() {
  return ["name", "formatted_address", "place_id", "types", "geometry", "rating", "user_ratings_total", "price_level", "photos"];
}

function getRouteStopMeta(stop) {
  const typeLabel = stop.type === "hotel" ? "Hotel" : stop.type === "restaurant" ? "Dining" : "Stop";
  const area = stop.area && stop.area !== "Google Places" ? stop.area : stop.city;
  return [typeLabel, area].filter(Boolean).join(" · ");
}

function clearRouteMapOverlays() {
  routeMapMarkers.forEach((marker) => marker.setMap(null));
  routeMapMarkers = [];
  if (routeMapPolyline) {
    routeMapPolyline.setMap(null);
    routeMapPolyline = null;
  }
}

function invalidateRoutePlan() {
  state.routePlan = null;
  state.routePlanWarning = "";
  state.routePlanningStatus = "idle";
  state.routePlanningError = "";
  routeMapRenderedSignature = "";
  if (routeDirectionsRenderer) routeDirectionsRenderer.set("directions", null);
  clearRouteMapOverlays();
}

function addRouteStop(poi) {
  if (!poi || state.routeStops.length >= 10) return;
  const key = poi.placeId || poi.id || `${poi.type}:${normalizeText(poi.name)}:${normalizeText(poi.city)}`;
  const exists = state.routeStops.some((stop) => {
    const stopKey = stop.placeId || stop.id || `${stop.type}:${normalizeText(stop.name)}:${normalizeText(stop.city)}`;
    return stopKey === key;
  });
  if (exists) return;

  state.routeStops = [...state.routeStops, poi].slice(0, 10);
  state.routeSearchOpen = false;
  state.routeSearchQuery = "";
  state.routePredictions = [];
  state.routeSearchStatus = "idle";
  state.routeSearchError = "";
  invalidateRoutePlan();
}

function removeRouteStop(index) {
  state.routeStops = state.routeStops.filter((_, itemIndex) => itemIndex !== index);
  invalidateRoutePlan();
  render();
}

function getRoutePredictionParts(prediction) {
  return getCityPredictionParts(prediction);
}

function renderRouteStops() {
  if (!elements.routeStops) return;

  if (!state.routeStops.length) {
    elements.routeStops.innerHTML = `
      <div class="route-empty-stops">
        Add two or more places to generate a route.
      </div>
    `;
    return;
  }

  elements.routeStops.innerHTML = state.routeStops
    .map(
      (stop, index) => `
        <article class="route-stop-card ${index === 1 ? "is-accent" : ""}">
          <span class="route-stop-index">${index + 1}</span>
          <span class="route-stop-copy">
            <strong>${escapeHtml(stop.name)}</strong>
            <small>${escapeHtml(getRouteStopMeta(stop))}</small>
          </span>
          <button type="button" data-route-stop-remove="${index}" aria-label="Remove ${escapeHtml(stop.name)}">×</button>
        </article>
      `,
    )
    .join("");
}

function renderRouteSuggestions() {
  if (!elements.routeSuggestions) return;
  elements.routeSuggestions.hidden = !state.routePredictions.length;
  elements.routeSuggestions.innerHTML = state.routePredictions
    .map((prediction) => {
      const { main, secondary } = getRoutePredictionParts(prediction);
      return `
        <button type="button" class="route-suggestion-button" data-route-place-id="${escapeHtml(prediction.place_id)}">
          <span>
            <span class="route-suggestion-main">${escapeHtml(main)}</span>
            ${secondary ? `<span class="route-suggestion-secondary">${escapeHtml(secondary)}</span>` : ""}
          </span>
          <span class="route-suggestion-arrow" aria-hidden="true">→</span>
        </button>
      `;
    })
    .join("");
}

function getOrderedRouteStops() {
  if (!state.routePlan?.stopOrder?.length) return state.routeStops;
  const used = new Set();
  const ordered = [];
  state.routePlan.stopOrder.forEach((value) => {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= state.routeStops.length || used.has(index)) return;
    used.add(index);
    ordered.push(state.routeStops[index]);
  });
  return ordered.length >= 2 ? ordered : state.routeStops;
}

function getRouteMapSignature() {
  return JSON.stringify(
    getOrderedRouteStops().map((stop) => ({
      id: stop.placeId || stop.id || stop.name,
      lat: stop.lat,
      lng: stop.lng,
    })),
  );
}

function ensureRouteMap() {
  if (state.activeTab !== "route" || !state.routePlan || !elements.routeMap || !window.google?.maps) return null;
  const stops = getOrderedRouteStops().filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
  const center = stops[0] ? { lat: stops[0].lat, lng: stops[0].lng } : getExploreCenter();

  if (!routeMap) {
    routeMap = new google.maps.Map(elements.routeMap, {
      center,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: "cooperative",
    });
    routeDirectionsService = new google.maps.DirectionsService();
    routeDirectionsRenderer = new google.maps.DirectionsRenderer({
      map: routeMap,
      suppressMarkers: true,
      preserveViewport: false,
      polylineOptions: {
        strokeColor: "#1f1c18",
        strokeOpacity: 0.84,
        strokeWeight: 4,
      },
    });
  } else {
    google.maps.event.trigger(routeMap, "resize");
    routeMap.setCenter(center);
  }

  return routeMap;
}

function renderRouteMapMarkers(stops) {
  clearRouteMapOverlays();
  stops.forEach((stop, index) => {
    if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return;
    const isAccent = index === 1;
    const marker = new google.maps.Marker({
      map: routeMap,
      position: { lat: stop.lat, lng: stop.lng },
      title: stop.name,
      label: {
        text: String(index + 1),
        color: "#fff",
        fontWeight: "900",
        fontSize: "13px",
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 16,
        fillColor: isAccent ? "#d65300" : "#1f1c18",
        fillOpacity: 1,
        strokeColor: "#fffdfa",
        strokeWeight: 3,
      },
      zIndex: 40 + index,
    });
    routeMapMarkers.push(marker);
  });
}

function renderRouteFallbackPolyline(stops) {
  const path = stops
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
    .map((stop) => ({ lat: stop.lat, lng: stop.lng }));
  if (path.length < 2) return;
  routeMapPolyline = new google.maps.Polyline({
    map: routeMap,
    path,
    strokeColor: "#1f1c18",
    strokeOpacity: 0.72,
    strokeWeight: 4,
    icons: [
      {
        icon: {
          path: "M 0,-1 0,1",
          strokeOpacity: 1,
          scale: 4,
        },
        offset: "0",
        repeat: "18px",
      },
    ],
  });
  const bounds = new google.maps.LatLngBounds();
  path.forEach((point) => bounds.extend(point));
  routeMap.fitBounds(bounds, 42);
}

function prepareRouteMap() {
  if (state.activeTab !== "route" || !state.routePlan) return;
  const map = ensureRouteMap();
  if (!map || !routeDirectionsService || !routeDirectionsRenderer) return;

  const stops = getOrderedRouteStops().filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
  if (stops.length < 2) return;

  const signature = getRouteMapSignature();
  if (routeMapRenderedSignature === signature) return;
  routeMapRenderedSignature = signature;

  const origin = { lat: stops[0].lat, lng: stops[0].lng };
  const destinationStop = stops.at(-1);
  const destination = { lat: destinationStop.lat, lng: destinationStop.lng };
  const waypoints = stops.slice(1, -1).map((stop) => ({
    location: { lat: stop.lat, lng: stop.lng },
    stopover: true,
  }));

  routeDirectionsService.route(
    {
      origin,
      destination,
      waypoints,
      travelMode: google.maps.TravelMode.WALKING,
      optimizeWaypoints: false,
    },
    (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result) {
        routeDirectionsRenderer.setDirections(result);
        renderRouteMapMarkers(stops);
      } else {
        routeDirectionsRenderer.set("directions", null);
        renderRouteMapMarkers(stops);
        renderRouteFallbackPolyline(stops);
      }
    },
  );
}

function getRouteStartUrl() {
  const stops = getOrderedRouteStops();
  if (stops.length < 2) return "#";
  const destination = stops.at(-1);
  const waypoints = stops.slice(1, -1);
  const params = new URLSearchParams({
    api: "1",
    origin: stops[0].placeId ? `place_id:${stops[0].placeId}` : `${stops[0].lat},${stops[0].lng}`,
    destination: destination.placeId ? `place_id:${destination.placeId}` : `${destination.lat},${destination.lng}`,
    travelmode: "walking",
  });
  if (waypoints.length) {
    params.set(
      "waypoints",
      waypoints.map((stop) => (stop.placeId ? `place_id:${stop.placeId}` : `${stop.lat},${stop.lng}`)).join("|"),
    );
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function renderRoutePlan() {
  const plan = state.routePlan;
  if (!plan) return;
  if (elements.routeResultTitle) {
    const title = plan.title || "Your route, planned.";
    const parts = title.split(/,\s*/);
    elements.routeResultTitle.innerHTML =
      parts.length >= 2
        ? `${escapeHtml(parts[0])},<br /><em>${escapeHtml(parts.slice(1).join(", "))}</em>`
        : escapeHtml(title);
  }
  if (elements.routeResultMeta) {
    const metaParts = [
      `${state.routeStops.length} stops`,
      plan.durationText,
      plan.distanceText,
    ].filter(Boolean);
    elements.routeResultMeta.textContent = metaParts.join(" · ");
  }
  if (elements.routeFlowTitle) {
    elements.routeFlowTitle.textContent = plan.flowTitle || "Tonight's flow";
  }
  if (elements.routeItinerary) {
    const itinerary = Array.isArray(plan.itinerary) ? plan.itinerary : [];
    elements.routeItinerary.innerHTML = itinerary
      .map((item, index) => {
        const stop = state.routeStops[item.stopIndex] || state.routeStops[index] || {};
        return `
          <article class="route-itinerary-item">
            <span class="route-stop-index ${index === 1 ? "is-accent" : ""}">${index + 1}</span>
            <span class="route-itinerary-copy">
              <strong>${escapeHtml(item.name || stop.name || `Stop ${index + 1}`)}</strong>
              <small>${escapeHtml(item.subtitle || item.description || getRouteStopMeta(stop))}</small>
              ${item.note ? `<em>${escapeHtml(item.note)}</em>` : ""}
            </span>
            <time>${escapeHtml(item.time || "")}</time>
          </article>
        `;
      })
      .join("");
  }
  if (elements.routeResultStatus) {
    elements.routeResultStatus.textContent = state.routePlanWarning || "";
    elements.routeResultStatus.classList.toggle("is-error", Boolean(state.routePlanWarning));
  }
  if (elements.routeStartButton) {
    elements.routeStartButton.href = getRouteStartUrl();
  }
}

function renderRouteState() {
  const active = state.activeTab === "route";
  elements.homeView?.classList.toggle("is-route", active);
  elements.routeView.hidden = !active;
  elements.contentGrid?.classList.toggle("is-route", active);
  elements.mobileTabbar?.querySelectorAll("button[data-home-nav]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.homeNav === state.activeTab);
  });

  if (!active) return;

  const showingResult = Boolean(state.routePlan);
  if (elements.routeBuilder) elements.routeBuilder.hidden = showingResult;
  if (elements.routeResult) elements.routeResult.hidden = !showingResult;
  if (elements.routeSearchPanel) elements.routeSearchPanel.hidden = !state.routeSearchOpen;
  if (elements.routeAddStopButton) {
    elements.routeAddStopButton.hidden = state.routeSearchOpen || state.routeStops.length >= 10;
  }
  if (elements.routeSearchInput && document.activeElement !== elements.routeSearchInput) {
    elements.routeSearchInput.value = state.routeSearchQuery;
  }
  if (elements.routePromptInput && document.activeElement !== elements.routePromptInput) {
    elements.routePromptInput.value = state.routePrompt;
  }
  if (elements.routeSearchStatus) {
    const statusLabels = {
      idle: state.routeStops.length >= 10 ? "最多支持 10 个 stops。" : "",
      searching: "正在搜索 Google Maps...",
      ready: state.routePredictions.length ? "" : "输入地点名后搜索。",
      error: state.routeSearchError || "Google Maps 搜索暂不可用。",
    };
    elements.routeSearchStatus.textContent = statusLabels[state.routeSearchStatus] || "";
    elements.routeSearchStatus.classList.toggle("is-error", state.routeSearchStatus === "error");
  }
  if (elements.routePlanStatus) {
    const statusLabels = {
      idle: state.routeStops.length < 2 ? "选择至少 2 个 stops 后可以生成路线。" : "",
      loading: "正在让 Gemini 规划行程...",
      error: state.routePlanningError || "路线规划暂时失败。",
    };
    elements.routePlanStatus.textContent = statusLabels[state.routePlanningStatus] || "";
    elements.routePlanStatus.classList.toggle("is-error", state.routePlanningStatus === "error");
  }
  if (elements.routeGenerateButton) {
    elements.routeGenerateButton.disabled = state.routeStops.length < 2 || state.routePlanningStatus === "loading";
    elements.routeGenerateButton.textContent = state.routePlanningStatus === "loading" ? "Generating..." : "Generate route ✦";
  }

  renderRouteStops();
  renderRouteSuggestions();
  renderRoutePlan();
  requestAnimationFrame(prepareRouteMap);
}

function getGoogleClientId() {
  return window.POI_RATINGS_CONFIG?.googleClientId || "";
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleIdentityLoadPromise) return googleIdentityLoadPromise;

  googleIdentityLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Google 登录脚本加载失败。"));
    document.head.append(script);
  });
  return googleIdentityLoadPromise;
}

async function initializeGoogleSignIn() {
  if (state.currentUser || googleSignInInitialized || !elements.googleSignInButton) return;
  if (state.authStatus === "loading") return;
  const clientId = getGoogleClientId();
  if (!clientId || !state.googleClientConfigured) {
    googleSignInInitialized = true;
    state.googleClientConfigured = false;
    state.authError = "需要在 config.js 和 server-config.js 配置 Google OAuth Client ID。";
    render();
    return;
  }

  try {
    await loadGoogleIdentityScript();
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
    });
    elements.googleSignInButton.innerHTML = "";
    window.google.accounts.id.renderButton(elements.googleSignInButton, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "signin_with",
      width: Math.min(320, elements.googleSignInButton.getBoundingClientRect().width || 320),
    });
    googleSignInInitialized = true;
    state.authError = "";
  } catch (error) {
    state.authError = error.message;
    render();
  }
}

async function loadMe() {
  if (isFileRuntime()) {
    state.authStatus = "error";
    state.authError = "Google 登录和收藏需要通过本地服务访问。";
    render();
    return;
  }

  state.authStatus = "loading";
  try {
    const response = await fetch("/api/me");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Me 返回 ${response.status}`);
    state.currentUser = payload.user || null;
    state.favorites = payload.favorites || [];
    state.googleClientConfigured = Boolean(payload.googleClientConfigured);
    state.authStatus = "ready";
    state.authError = "";
  } catch (error) {
    state.currentUser = null;
    state.favorites = [];
    state.authStatus = "error";
    state.authError = getFriendlySearchError(error);
  } finally {
    render();
  }
}

async function handleGoogleCredential(response) {
  if (!response?.credential) return;
  state.authStatus = "loading";
  state.authError = "";
  render();

  try {
    const authResponse = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: response.credential }),
    });
    const payload = await authResponse.json();
    if (!authResponse.ok) throw new Error(payload.error || `Google 登录返回 ${authResponse.status}`);
    state.currentUser = payload.user || null;
    state.favorites = payload.favorites || [];
    state.googleClientConfigured = Boolean(payload.googleClientConfigured);
    state.authStatus = "ready";
    state.authError = "";
    googleSignInInitialized = false;
  } catch (error) {
    state.authStatus = "error";
    state.authError = error.message;
  } finally {
    render();
  }
}

async function logoutMe() {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch {
    // The UI should still clear local user state if the network request fails.
  }
  state.currentUser = null;
  state.favorites = [];
  state.authStatus = "ready";
  state.authError = "";
  googleSignInInitialized = false;
  render();
}

function getFavoriteKeyForPoi(poi) {
  return normalizeText(poi?.placeId || poi?.id || `${poi?.type || "poi"} ${poi?.name || ""} ${poi?.city || ""}`);
}

function isFavoritePoi(poi) {
  const key = getFavoriteKeyForPoi(poi);
  return Boolean(key && state.favorites.some((favorite) => favorite.favoriteKey === key || getFavoriteKeyForPoi(favorite) === key));
}

function serializeFavoritePoi(poi) {
  return {
    id: poi.id,
    placeId: poi.placeId || "",
    type: poi.type,
    name: poi.name,
    city: poi.city,
    area: poi.area,
    category: poi.category,
    description: poi.description,
    price: poi.price,
    photoUrl: poi.photoUrl,
    ratings: poi.ratings || {},
    tags: poi.tags || [],
    lat: poi.lat,
    lng: poi.lng,
  };
}

async function toggleFavorite(poi) {
  if (!poi) return;
  if (!state.currentUser) {
    state.activeTab = "me";
    state.authError = "请先用 Google 登录后再收藏 POI。";
    state.userSelectedPoi = false;
    state.selectedId = null;
    state.detailPageOpen = false;
    replaceListHistoryState();
    render();
    requestAnimationFrame(initializeGoogleSignIn);
    return;
  }

  const key = getFavoriteKeyForPoi(poi);
  const saved = isFavoritePoi(poi);
  try {
    const response = await fetch(saved ? `/api/favorites?id=${encodeURIComponent(key)}` : "/api/favorites", {
      method: saved ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body: saved ? undefined : JSON.stringify({ poi: serializeFavoritePoi(poi) }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `收藏返回 ${response.status}`);
    state.favorites = payload.favorites || [];
    state.authError = "";
  } catch (error) {
    state.authError = error.message;
  } finally {
    render();
  }
}

function renderFavoriteCard(favorite) {
  const fallback = `<span>${escapeHtml((favorite.name || "?").slice(0, 1))}</span>`;
  const media = renderCachedImage(favorite.photoUrl, favorite.name, fallback);
  const meta = getPoiMetaParts({
    ...favorite,
    ratings: favorite.ratings || {},
    tags: favorite.tags || [],
  }).map(escapeHtml).join(" · ");
  const score = averageScore({
    ...favorite,
    ratings: favorite.ratings || {},
  });

  return `
    <button type="button" class="me-favorite-card" data-favorite-id="${escapeHtml(favorite.favoriteKey || getFavoriteKeyForPoi(favorite))}">
      <div class="me-favorite-media">${media}</div>
      <span>
        <strong>${escapeHtml(favorite.name)}</strong>
        <small>${meta || escapeHtml(favorite.city || "Saved POI")}</small>
      </span>
      <em>${score || "N/A"}</em>
    </button>
  `;
}

function renderMeState() {
  const active = state.activeTab === "me";
  elements.homeView?.classList.toggle("is-me", active);
  elements.meView.hidden = !active;
  elements.contentGrid?.classList.toggle("is-me", active);
  elements.mobileTabbar?.querySelectorAll("button[data-home-nav]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.homeNav === state.activeTab);
  });

  if (!active) return;

  const signedIn = Boolean(state.currentUser);
  if (elements.meSignedOut) elements.meSignedOut.hidden = signedIn;
  if (elements.meProfile) elements.meProfile.hidden = !signedIn;
  if (elements.meAuthStatus) {
    const missingGoogleClientConfig = !getGoogleClientId() || !state.googleClientConfigured;
    const statusMessage = state.authError || (missingGoogleClientConfig ? "请先配置 Google OAuth Client ID。" : "");
    elements.meAuthStatus.textContent =
      state.authStatus === "loading" ? "正在检查登录状态..." : signedIn ? "" : statusMessage || "使用 Google 账号登录后即可收藏 POI。";
    elements.meAuthStatus.classList.toggle("is-error", Boolean(state.authError || missingGoogleClientConfig));
  }
  if (signedIn) {
    if (elements.meAvatar) {
      elements.meAvatar.src = state.currentUser.picture || "";
      elements.meAvatar.hidden = !state.currentUser.picture;
    }
    if (elements.meName) elements.meName.textContent = state.currentUser.name || "Me";
    if (elements.meEmail) elements.meEmail.textContent = state.currentUser.email || "";
  }
  if (elements.meFavoriteCount) {
    elements.meFavoriteCount.textContent = String(state.favorites.length);
  }
  if (elements.meFavoritesList) {
    elements.meFavoritesList.innerHTML = state.favorites.length
      ? state.favorites.map(renderFavoriteCard).join("")
      : `
        <div class="me-empty-favorites">
          <strong>还没有收藏</strong>
          <span>在 POI 详情页点右上角的心形按钮，收藏会出现在这里。</span>
        </div>
      `;
  }
  requestAnimationFrame(initializeGoogleSignIn);
}

function scheduleExploreSearch() {
  clearTimeout(exploreSearchTimer);
  const query = elements.exploreSearchInput?.value.trim() || "";
  state.exploreSearchQuery = query;

  if (query.length < 2) {
    state.explorePredictions = [];
    state.exploreError = "";
    state.exploreStatus = state.explorePois.length ? "ready" : "idle";
    render();
    return;
  }

  state.exploreStatus = "searching";
  state.exploreError = "";
  render();
  exploreSearchTimer = setTimeout(() => searchExplorePredictions(query), 180);
}

async function searchExplorePredictions(query) {
  const token = ++exploreSearchToken;

  if (!googleAutocompleteService) {
    state.explorePredictions = [];
    state.exploreStatus = "error";
    state.exploreError = state.googleError || "Google Maps 搜索尚未连接。";
    render();
    return;
  }

  try {
    const center = getExploreCenter();
    const { predictions, status } = await getGooglePredictions(query, {
      types: null,
      location: new google.maps.LatLng(center.lat, center.lng),
      radius: 50000,
    });
    if (token !== exploreSearchToken) return;

    if (status !== google.maps.places.PlacesServiceStatus.OK && status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
      throw new Error(`Google Maps 返回 ${status}`);
    }

    state.explorePredictions = (predictions || []).slice(0, 7);
    state.exploreStatus = "ready";
    state.exploreError = "";
  } catch (error) {
    if (token !== exploreSearchToken) return;
    state.explorePredictions = [];
    state.exploreStatus = "error";
    state.exploreError = getFriendlySearchError(error);
  } finally {
    if (token === exploreSearchToken) render();
  }
}

async function selectExplorePrediction(placeId) {
  if (!placeId || !googlePlacesService) return;
  const token = ++exploreSearchToken;
  state.exploreStatus = "searching";
  state.exploreError = "";
  render();

  try {
    const { place, status } = await getGooglePlaceDetails(placeId, getExplorePlaceFields());
    if (token !== exploreSearchToken) return;

    if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
      throw new Error(`Google Maps 返回 ${status}`);
    }

    const poi = addExplorePoi(mapGooglePlaceToPoi(place));
    state.exploreSearchQuery = poi.name;
    state.explorePredictions = [];
    state.exploreStatus = "ready";
    if (Number.isFinite(poi.lat) && Number.isFinite(poi.lng) && exploreMap) {
      exploreMap.setCenter({ lat: poi.lat, lng: poi.lng });
      exploreMap.setZoom(16);
    }
    render();
    selectPoi(poi.id);
  } catch (error) {
    if (token !== exploreSearchToken) return;
    state.exploreStatus = "error";
    state.exploreError = getFriendlySearchError(error);
    render();
  }
}

function scheduleRouteSearch() {
  clearTimeout(routeSearchTimer);
  const query = elements.routeSearchInput?.value.trim() || "";
  state.routeSearchQuery = query;

  if (query.length < 2) {
    state.routePredictions = [];
    state.routeSearchError = "";
    state.routeSearchStatus = "idle";
    render();
    return;
  }

  state.routeSearchStatus = "searching";
  state.routeSearchError = "";
  render();
  routeSearchTimer = setTimeout(() => searchRoutePredictions(query), 180);
}

async function searchRoutePredictions(query) {
  const token = ++routeSearchToken;

  if (!googleAutocompleteService) {
    state.routePredictions = [];
    state.routeSearchStatus = "error";
    state.routeSearchError = state.googleError || "Google Maps 搜索尚未连接。";
    render();
    return;
  }

  try {
    const center = getExploreCenter();
    const { predictions, status } = await getGooglePredictions(query, {
      types: ["establishment"],
      location: new google.maps.LatLng(center.lat, center.lng),
      radius: 50000,
    });
    if (token !== routeSearchToken) return;

    if (status !== google.maps.places.PlacesServiceStatus.OK && status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
      throw new Error(`Google Maps 返回 ${status}`);
    }

    state.routePredictions = (predictions || []).slice(0, 7);
    state.routeSearchStatus = "ready";
    state.routeSearchError = "";
  } catch (error) {
    if (token !== routeSearchToken) return;
    state.routePredictions = [];
    state.routeSearchStatus = "error";
    state.routeSearchError = getFriendlySearchError(error);
  } finally {
    if (token === routeSearchToken) render();
  }
}

async function selectRoutePrediction(placeId) {
  if (!placeId || !googlePlacesService || state.routeStops.length >= 10) return;
  const token = ++routeSearchToken;
  state.routeSearchStatus = "searching";
  state.routeSearchError = "";
  render();

  try {
    const { place, status } = await getGooglePlaceDetails(placeId, getRoutePlaceFields());
    if (token !== routeSearchToken) return;

    if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
      throw new Error(`Google Maps 返回 ${status}`);
    }

    addRouteStop(mapGooglePlaceToPoi(place));
    render();
  } catch (error) {
    if (token !== routeSearchToken) return;
    state.routeSearchStatus = "error";
    state.routeSearchError = getFriendlySearchError(error);
    render();
  }
}

function getRoutePlanPayload() {
  return {
    prompt: state.routePrompt.trim(),
    city: getExploreLocationText(),
    stops: state.routeStops.map((stop, index) => ({
      index,
      id: stop.placeId || stop.id,
      name: stop.name,
      type: stop.type,
      city: stop.city,
      area: stop.area,
      category: stop.category,
      address: stop.formattedAddress || [stop.area, stop.city].filter(Boolean).join(", "),
      lat: stop.lat,
      lng: stop.lng,
    })),
  };
}

async function generateRoutePlan() {
  if (state.routeStops.length < 2 || state.routePlanningStatus === "loading") return;

  if (isFileRuntime()) {
    state.routePlanningStatus = "error";
    state.routePlanningError = "Route 需要通过本地代理访问，请运行 node server.js。";
    render();
    return;
  }

  const token = ++routePlanToken;
  state.routePlanningStatus = "loading";
  state.routePlanningError = "";
  state.routePlanWarning = "";
  state.routePlan = null;
  routeMapRenderedSignature = "";
  render();

  try {
    const response = await fetch("/api/route-plan", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(getRoutePlanPayload()),
    });
    const payload = await response.json();
    if (token !== routePlanToken) return;
    if (!response.ok) throw new Error(payload.error || `Route 返回 ${response.status}`);

    state.routePlan = payload.data || null;
    state.routePlanWarning = payload.warning || "";
    state.routePlanningStatus = state.routePlan ? "ready" : "error";
    state.routePlanningError = state.routePlan ? "" : "Gemini 没有返回可用行程。";
  } catch (error) {
    if (token !== routePlanToken) return;
    state.routePlan = null;
    state.routePlanningStatus = "error";
    state.routePlanningError = getFriendlySearchError(error);
  } finally {
    if (token === routePlanToken) render();
  }
}

function renderIntentBar() {
  const intent = state.aiIntent;
  if (!intent) {
    elements.intentBar.hidden = true;
    elements.intentBar.innerHTML = "";
    return;
  }

  const items = [
    ["位置", intent.location],
    ["场景", intent.scene || state.selectedScene],
    ["身份", intent.persona],
    ["出发地", intent.origin],
    ["类型", intent.type === "hotel" ? "酒店" : "餐厅"],
    ["预算", intent.budget],
    ["关键词", (intent.keywords || []).join(" / ")],
  ].filter(([, value]) => value);

  elements.intentBar.hidden = !items.length;
  elements.intentBar.innerHTML = items
    .map(([label, value]) => `<span class="intent-chip">${escapeHtml(label)}：${escapeHtml(value)}</span>`)
    .join("");
}

function renderRecommendationCard(item, index, className) {
  const tags = (item.tags || [])
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");
  const isTrend = className === "trend-card";
  const isTrendImageLoaded = isTrend && isCachedImageLoaded(item.imageUrl);
  const mediaClass = isTrend
    ? `trend-media ${isTrendImageLoaded ? "is-image-loaded" : "is-image-loading"}`
    : "recommendation-media";
  const bodyClass = isTrend ? "trend-body" : "recommendation-body";
  const mediaStyle = isTrend ? renderCachedBackgroundStyle(item.imageUrl) : "";
  const bodyMarkup = `
    <div class="${bodyClass}">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <div class="home-card-tags">${tags}</div>
    </div>
  `;

  if (isTrend) {
    return `
      <button type="button" class="${className}" data-home-query="${escapeHtml(item.query)}" data-home-scene="${escapeHtml(item.scene || item.tags?.[0] || "")}">
        <div class="${mediaClass} tone-${(index % 4) + 1}" aria-hidden="true"${mediaStyle}></div>
        ${bodyMarkup}
      </button>
    `;
  }

  return `
    <button type="button" class="${className}" data-home-query="${escapeHtml(item.query)}" data-home-scene="${escapeHtml(item.scene || item.tags?.[0] || "")}">
      <div class="${mediaClass} tone-${(index % 4) + 1}" aria-hidden="true"${mediaStyle}>
        ${item.icon ? `<span>${escapeHtml(item.icon)}</span>` : ""}
      </div>
      ${bodyMarkup}
    </button>
  `;
}

function renderHomeFeeds() {
  const filters = getHomeFilters();
  state.homeCity = filters.city || state.homeCity || "New York";
  const locationLabel = getHomeLocationDisplay(filters);
  if (elements.homeLocationLabel) {
    elements.homeLocationLabel.textContent = `📍 ${locationLabel}`;
  }
  if (elements.nearYouCity) {
    elements.nearYouCity.textContent = "All →";
  }
  if (elements.trendingCity) {
    elements.trendingCity.textContent = state.homeCity || "your city";
  }

  elements.nearYouRail.innerHTML = HOME_NEAR_RECOMMENDATIONS.map((item, index) =>
    renderRecommendationCard(
      {
        ...item,
        query: `${item.query} ${filters.district || filters.city || ""}`.trim(),
        scene: item.tags?.[0],
      },
      index,
      "recommendation-card",
    ),
  ).join("");

  elements.trendingGrid.innerHTML = TRENDING_TEMPLATES.map((item, index) =>
    renderRecommendationCard(
      {
        ...item,
        title: item.title.replace("Manhattan", filters.district || filters.city || "Manhattan"),
        query: `${item.query} ${filters.district || filters.city || ""}`.trim(),
        scene: item.tags?.[0],
      },
      index,
      "trend-card",
    ),
  ).join("");
}

function renderHomeSearchState(pois) {
  const hasSearch = state.query.trim().length >= 2 || state.homeSearchStatus === "searching";
  const resultPois = hasSearch ? pois : [];
  elements.homeView?.classList.toggle("has-results", hasSearch);
  elements.aiResultsSection.hidden = !hasSearch;
  elements.aiStatus.classList.toggle("is-warn", state.homeSearchStatus === "error" || Boolean(state.homeSearchError));
  if (elements.resultsTitle) {
    const title = state.query.trim() || state.selectedScene || "Search";
    elements.resultsTitle.textContent = `"${title}"`;
  }

  const labels = {
    idle: "",
    searching: "正在理解你的需求并匹配 POI...",
    ready:
      state.homeSearchError ||
      (state.aiCandidates.length
        ? "AI 已解析需求，点击候选 POI 查看平台评分。"
        : resultPois.length
          ? "AI 已解析需求，并用 Google Places 匹配候选 POI。"
          : "AI 已完成解析，但没有返回明确候选。"),
    error: state.homeSearchError || "AI 搜索暂不可用",
  };
  elements.aiStatus.textContent = labels[state.homeSearchStatus] || "";

  renderIntentBar();
  renderPoiList(resultPois);
}

function renderHome(pois) {
  renderHomeFeeds();
  renderHomeSearchState(pois);
  renderExploreState();
  renderBuddyState();
  renderRouteState();
  renderMeState();
}

function render() {
  applyNavigationMode();
  renderCityPicker();
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
  let selectedBasePoi = findPoiById(state.selectedId);
  if (!state.userSelectedPoi && !isSearchMode) {
    state.selectedId = null;
    selectedBasePoi = null;
  } else if (state.selectedId && !selectedBasePoi) {
    state.selectedId = isSearchMode ? null : pois[0]?.id ?? null;
    state.userSelectedPoi = false;
    if (!state.selectedId) state.detailPageOpen = false;
    selectedBasePoi = findPoiById(state.selectedId);
  }

  renderHome(pois);
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
  applyNavigationMode();

  if (state.pendingDetailScroll && state.selectedId) {
    state.pendingDetailScroll = false;
    scrollDetailIntoViewIfCompact();
  }
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
  const { lat, lng } = normalizeLatLng(place.geometry?.location);

  return {
    id: `google-${place.place_id}`,
    placeId: place.place_id,
    type,
    name: place.name,
    city,
    area: addressParts[0] || "Google Places",
    formattedAddress: place.formatted_address || "",
    category: type === "hotel" ? "Google Places 酒店结果" : "Google Places 餐饮结果",
    description: "来自 Google Places 的实时搜索结果。其他平台评分需要分别接入对应来源后展示。",
    price: place.price_level ? `${"$".repeat(place.price_level)} · Google 价格等级` : "暂无价格等级",
    tags: ["Google", "实时结果"],
    lat,
    lng,
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

function mapAiCandidateToPoi(candidate, index) {
  const type = candidate.type === "hotel" ? "hotel" : "restaurant";
  const city = candidate.city || getHomeFilters().city || "AI Search";
  return {
    id: candidate.id || `ai-${index}-${normalizeText(candidate.name)}`,
    type,
    name: candidate.name,
    city,
    area: candidate.area || city,
    category: candidate.category || (type === "hotel" ? "AI 推荐酒店" : "AI 推荐餐厅"),
    description: candidate.why || "来自 Gemini 2.5 Flash 的自然语言搜索候选。",
    price: candidate.price || "暂无价格信息",
    tags: ["AI Pick", ...(candidate.tags || [])],
    ratings: {},
    aiSearchQuery: candidate.searchQuery,
    aiReason: candidate.why,
  };
}

function enrichGooglePoiWithCandidate(poi, candidate) {
  return {
    ...poi,
    category: candidate.category || poi.category,
    description: candidate.why || poi.description,
    price: candidate.price || poi.price,
    tags: Array.from(new Set(["AI Pick", ...(candidate.tags || []), ...poi.tags])),
    aiSearchQuery: candidate.searchQuery,
    aiReason: candidate.why,
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
  const pendingCityQuery =
    state.cityPickerOpen && state.citySearchStatus === "loading" && state.citySearchQuery.trim().length >= 2
      ? state.citySearchQuery.trim()
      : "";
  if (state.cityPickerOpen && state.citySearchStatus === "loading") {
    state.citySearchStatus = pendingCityQuery ? "searching" : "idle";
  }
  render();
  if (pendingCityQuery) {
    searchCitiesWithGoogle(pendingCityQuery);
  }
  if (state.activeTab === "explore") {
    requestAnimationFrame(prepareExploreMap);
  }
  if (state.activeTab === "route") {
    requestAnimationFrame(prepareRouteMap);
  }
  if (state.homeSearchStatus === "idle") {
    searchGooglePlaces();
  }
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

function getGooglePredictions(input, options = {}) {
  return new Promise((resolve) => {
    if (!googleAutocompleteService) {
      resolve({ predictions: [], status: "UNAVAILABLE" });
      return;
    }

    const request = {
      input,
    };
    const types = Object.hasOwn(options, "types") ? options.types : ["establishment"];
    if (types?.length) request.types = types;
    if (options.componentRestrictions) {
      request.componentRestrictions = options.componentRestrictions;
    }
    if (options.location) request.location = options.location;
    if (options.radius) request.radius = options.radius;

    googleAutocompleteService.getPlacePredictions(request, (predictions, status) => {
      resolve({ predictions: predictions || [], status });
    });
  });
}

function getGooglePlaceDetails(
  placeId,
  fields = ["name", "formatted_address", "place_id", "rating", "user_ratings_total", "types", "price_level", "photos", "geometry"],
) {
  return new Promise((resolve) => {
    googlePlacesService.getDetails(
      {
        placeId,
        fields,
      },
      (place, status) => {
        resolve({ place, status });
      },
    );
  });
}

async function resolveAiCandidateWithGoogle(candidate, index) {
  if (!googlePlacesService) return mapAiCandidateToPoi(candidate, index);

  const request = {
    query: candidate.searchQuery || `${candidate.name} ${candidate.area || ""} ${candidate.city || ""}`,
    fields: ["name", "formatted_address", "place_id", "rating", "user_ratings_total", "types", "price_level", "photos"],
  };
  const desiredType = candidate.type === "hotel" ? "lodging" : candidate.type === "restaurant" ? "restaurant" : undefined;
  if (desiredType) request.type = desiredType;

  const { results, status } = await runGoogleTextSearch(request);
  if (status === google.maps.places.PlacesServiceStatus.OK && results?.[0]) {
    return enrichGooglePoiWithCandidate(mapGooglePlaceToPoi(results[0]), candidate);
  }

  return mapAiCandidateToPoi(candidate, index);
}

async function hydrateAiCandidates(candidates) {
  const limitedCandidates = candidates.slice(0, 8);
  const hydrated = [];

  for (let index = 0; index < limitedCandidates.length; index += 1) {
    hydrated.push(await resolveAiCandidateWithGoogle(limitedCandidates[index], index));
  }

  const seen = new Set();
  return hydrated.filter((poi) => {
    const key = `${poi.type}:${normalizeText(poi.name)}:${normalizeText(poi.city)}:${poi.placeId || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchGoogleForHomeQuery(query, intent) {
  if (!googlePlacesService) return [];

  const filters = getHomeFilters();
  const request = {
    query: [
      query,
      intent?.location,
      filters.district,
      filters.city,
      filters.transit,
      filters.distance,
      intent?.type === "hotel" ? "hotel" : "restaurant",
    ].filter(Boolean).join(" "),
    fields: ["name", "formatted_address", "place_id", "rating", "user_ratings_total", "types", "price_level", "photos"],
  };
  const requestType = intent?.type === "hotel" ? "lodging" : intent?.type === "restaurant" ? "restaurant" : getGoogleRequestType();
  if (requestType) request.type = requestType;
  if (Number.isFinite(state.homeLocationLat) && Number.isFinite(state.homeLocationLng)) {
    request.location = new google.maps.LatLng(state.homeLocationLat, state.homeLocationLng);
    request.radius = 50000;
  }

  const { results, status } = await runGoogleTextSearch(request);
  if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) return [];
  return results.slice(0, 8).map(mapGooglePlaceToPoi);
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
    if (state.homeSearchStatus !== "idle") {
      state.isSearchingGoogle = false;
      if (state.googleStatus !== "error") state.googleStatus = googlePlacesService ? "ready" : "loading";
      render();
      return;
    }

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

      state.geminiPois = stripSearchFallbackMichelinRatings(payload.data || []);
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

      state.bravePois = stripSearchFallbackMichelinRatings(payload.data || []);
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

      state.tavilyPois = stripSearchFallbackMichelinRatings(payload.data || []);
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

function setType(nextType) {
  state.type = nextType;
  elements.typeTabs.forEach((button) => {
    const isActive = button.dataset.type === nextType;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

async function runHomeSearch(queryOverride = "") {
  const filters = getHomeFilters();
  const rawQuery = (queryOverride || elements.searchInput.value || state.query || "").trim();
  const query = rawQuery || SCENE_QUERY_MAP[state.selectedScene] || state.selectedScene || "";
  if (!query.trim()) return;

  const token = ++homeSearchToken;
  state.query = query;
  state.userSelectedPoi = false;
  state.selectedId = null;
  state.detailPageOpen = false;
  state.providerLookup = null;
  state.googlePois = [];
  state.googleFallbackSignature = "";
  state.aiIntent = null;
  state.aiCandidates = [];
  state.homeSearchStatus = "searching";
  state.homeSearchError = "";
  clearProviderResults();
  render();

  try {
    if (isFileRuntime()) {
      throw new Error("AI 搜索需要通过本地代理访问");
    }

    const response = await fetch("/api/ai-search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query,
        scene: state.selectedScene,
        type: state.type,
        filters,
      }),
    });
    const payload = await response.json();
    if (token !== homeSearchToken) return;
    if (!response.ok) throw new Error(payload.error || `AI 搜索返回 ${response.status}`);

    state.aiIntent = payload.intent || null;
    state.aiCandidates = payload.data || [];
    const parsedType = payload.intent?.type;
    if (parsedType === "restaurant" || parsedType === "hotel") {
      setType(parsedType);
    }

    const fallbackPois = state.aiCandidates.map(mapAiCandidateToPoi);
    state.googlePois = fallbackPois;
    state.homeSearchStatus = "ready";
    state.homeSearchError = payload.warning || "";
    render();

    let hydratedPois = fallbackPois;
    try {
      hydratedPois = state.aiCandidates.length
        ? await hydrateAiCandidates(state.aiCandidates)
        : await searchGoogleForHomeQuery(query, state.aiIntent);
    } catch (hydrationError) {
      hydratedPois = fallbackPois;
      state.homeSearchError = "Google Places 补全暂时失败，先显示 AI 搜索结果。";
    }
    if (token !== homeSearchToken) return;
    state.googlePois = hydratedPois.length ? hydratedPois : fallbackPois;
    state.homeSearchStatus = "ready";
    if (!state.homeSearchError) state.homeSearchError = payload.warning || "";
    state.googleStatus = googlePlacesService ? "ready" : state.googleStatus;
    render();
  } catch (error) {
    if (token !== homeSearchToken) return;
    let fallbackPois = [];
    try {
      fallbackPois = await searchGoogleForHomeQuery(query, null);
    } catch {
      fallbackPois = [];
    }
    if (token !== homeSearchToken) return;
    state.googlePois = fallbackPois;
    state.homeSearchStatus = fallbackPois.length ? "ready" : "error";
    state.homeSearchError = fallbackPois.length
      ? "AI 搜索暂时失败，已改用 Google Places 结果。"
      : getFriendlySearchError(error);
    render();
  }
}

elements.homeLocationButton?.addEventListener("click", openCityPicker);

elements.cityPickerClose?.addEventListener("click", closeCityPicker);

elements.cityPickerBackdrop?.addEventListener("click", (event) => {
  if (event.target === elements.cityPickerBackdrop) {
    closeCityPicker();
  }
});

elements.citySearchInput?.addEventListener("input", scheduleCitySearch);

elements.citySearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCityPicker();
    return;
  }

  if (event.key === "Enter" && state.cityPredictions[0]?.place_id) {
    event.preventDefault();
    selectCityPrediction(state.cityPredictions[0].place_id);
  }
});

elements.citySearchResults?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-city-place-id]");
  if (!button) return;
  selectCityPrediction(button.dataset.cityPlaceId);
});

elements.exploreSearchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const firstPrediction = state.explorePredictions[0];
  if (firstPrediction?.place_id) {
    selectExplorePrediction(firstPrediction.place_id);
    return;
  }
  scheduleExploreSearch();
});

elements.exploreSearchInput?.addEventListener("input", scheduleExploreSearch);

elements.exploreSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    state.exploreSearchQuery = "";
    state.explorePredictions = [];
    state.exploreStatus = state.explorePois.length ? "ready" : "idle";
    elements.exploreSearchInput.value = "";
    render();
  }

  if (event.key === "Enter" && state.explorePredictions[0]?.place_id) {
    event.preventDefault();
    selectExplorePrediction(state.explorePredictions[0].place_id);
  }
});

elements.exploreSuggestions?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-explore-place-id]");
  if (!button) return;
  selectExplorePrediction(button.dataset.explorePlaceId);
});

elements.buddyFrame?.addEventListener("load", () => {
  state.buddyFrameStatus = "ready";
  if (elements.buddyLoader) elements.buddyLoader.hidden = true;
});

elements.buddyFrame?.addEventListener("error", () => {
  state.buddyFrameStatus = "error";
  if (elements.buddyLoader) elements.buddyLoader.hidden = false;
  if (elements.buddyStatus) elements.buddyStatus.textContent = "Buddy 暂时无法加载";
});

elements.routeAddStopButton?.addEventListener("click", () => {
  state.routeSearchOpen = true;
  state.routeSearchStatus = state.routeSearchQuery.trim().length >= 2 ? state.routeSearchStatus : "ready";
  render();
  requestAnimationFrame(() => elements.routeSearchInput?.focus());
});

elements.routeSearchInput?.addEventListener("input", scheduleRouteSearch);

elements.routeSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    state.routeSearchOpen = false;
    state.routeSearchQuery = "";
    state.routePredictions = [];
    state.routeSearchStatus = "idle";
    elements.routeSearchInput.value = "";
    render();
  }

  if (event.key === "Enter" && state.routePredictions[0]?.place_id) {
    event.preventDefault();
    selectRoutePrediction(state.routePredictions[0].place_id);
  }
});

elements.routeSuggestions?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-route-place-id]");
  if (!button) return;
  selectRoutePrediction(button.dataset.routePlaceId);
});

elements.routeStops?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-route-stop-remove]");
  if (!button) return;
  removeRouteStop(Number(button.dataset.routeStopRemove));
});

elements.routePromptInput?.addEventListener("input", () => {
  state.routePrompt = elements.routePromptInput.value;
  if (state.routePlan) invalidateRoutePlan();
  render();
});

elements.routeGenerateButton?.addEventListener("click", generateRoutePlan);

elements.routeReplanButton?.addEventListener("click", () => {
  invalidateRoutePlan();
  render();
});

elements.meLogoutButton?.addEventListener("click", logoutMe);

elements.meFavoritesList?.addEventListener("click", (event) => {
  const card = event.target.closest("button[data-favorite-id]");
  if (!card) return;
  const favorite = state.favorites.find((item) => {
    const key = card.dataset.favoriteId;
    return item.favoriteKey === key || getFavoriteKeyForPoi(item) === key;
  });
  if (!favorite) return;
  state.googlePois = [favorite, ...state.googlePois.filter((poi) => !isSamePoiReference(poi, favorite))];
  state.activeTab = "discover";
  state.query = favorite.name;
  state.homeSearchStatus = "ready";
  state.userSelectedPoi = true;
  state.selectedId = favorite.id;
  state.detailPageOpen = false;
  selectPoi(favorite.id);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.cityPickerOpen) {
    closeCityPicker();
  }
});

elements.homeSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runHomeSearch();
});

elements.typeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setType(tab.dataset.type);
    state.userSelectedPoi = false;
    state.selectedId = null;
    state.providerLookup = null;
    state.googlePois = [];
    state.googleFallbackSignature = "";
    clearProviderResults();
    render();
  });
});

elements.quickFilters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-query], button[data-scene]");
  if (!button) return;
  state.selectedScene = button.dataset.scene || "";
  elements.quickFilters.querySelectorAll("button").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });
  const query = button.dataset.query || SCENE_QUERY_MAP[state.selectedScene] || state.selectedScene;
  elements.searchInput.value = query;
  runHomeSearch(query);
});

[elements.cityFilter, elements.districtFilter, elements.transitFilter, elements.distanceFilter].forEach((element) => {
  element?.addEventListener("change", () => {
    state.homeCity = elements.cityFilter?.value.trim() || state.homeCity;
    state.homeDistrict = elements.districtFilter?.value.trim() || state.homeDistrict;
    state.homeTransit = elements.transitFilter?.value.trim() || state.homeTransit;
    state.homeDistance = elements.distanceFilter?.value || state.homeDistance;
    render();
  });
});

[elements.nearYouRail, elements.trendingGrid].forEach((container) => {
  container?.addEventListener("click", (event) => {
    const card = event.target.closest("button[data-home-query]");
    if (!card) return;
    state.selectedScene = card.dataset.homeScene || "";
    elements.quickFilters.querySelectorAll("button").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.scene === state.selectedScene);
    });
    elements.searchInput.value = card.dataset.homeQuery;
    runHomeSearch(card.dataset.homeQuery);
  });
});

elements.mobileTabbar?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-home-nav]");
  if (!button) return;

  if (button.dataset.homeNav === "discover") {
    setActiveHomeTab("discover");
    state.query = "";
    state.homeSearchStatus = "idle";
    state.homeSearchError = "";
    state.aiIntent = null;
    state.aiCandidates = [];
    state.googlePois = [];
    state.userSelectedPoi = false;
    state.selectedId = null;
    state.detailPageOpen = false;
    elements.searchInput.value = "";
    replaceListHistoryState();
    render();
    return;
  }

  if (button.dataset.homeNav === "explore") {
    setActiveHomeTab("explore");
    state.userSelectedPoi = false;
    state.selectedId = null;
    state.detailPageOpen = false;
    replaceListHistoryState();
    render();
    requestAnimationFrame(prepareExploreMap);
    return;
  }

  if (button.dataset.homeNav === "buddy") {
    setActiveHomeTab("buddy");
    state.userSelectedPoi = false;
    state.selectedId = null;
    state.detailPageOpen = false;
    replaceListHistoryState();
    render();
    return;
  }

  if (button.dataset.homeNav === "route") {
    setActiveHomeTab("route");
    state.userSelectedPoi = false;
    state.selectedId = null;
    state.detailPageOpen = false;
    replaceListHistoryState();
    render();
    requestAnimationFrame(prepareRouteMap);
    return;
  }

  if (button.dataset.homeNav === "me") {
    setActiveHomeTab("me");
    state.userSelectedPoi = false;
    state.selectedId = null;
    state.detailPageOpen = false;
    replaceListHistoryState();
    render();
    return;
  }

  setActiveHomeTab(button.dataset.homeNav || "discover");
  elements.searchInput.focus();
});

elements.detailView.addEventListener("click", (event) => {
  const backButton = event.target.closest("button[data-detail-nav='back']");
  if (backButton) {
    closeDetailPage();
    return;
  }

  const favoriteButton = event.target.closest("button[data-favorite-action='toggle']");
  if (favoriteButton) {
    const poi = findPoiById(favoriteButton.dataset.poiId);
    toggleFavorite(poi);
    return;
  }

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

window.addEventListener("popstate", handleNavigationPop);
window.addEventListener("resize", applyNavigationMode);

initializeNavigationHistory();
render();
loadMe();
loadGooglePlaces();
