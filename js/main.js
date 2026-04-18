// ============================================
// Mag 7: Mouse-Driven Time Explorer
// Mouse X position = time cursor across all charts
// ============================================

// Shared position for scrub-info and compare-info panels
let sharedPanelPos = null;

const COLORS = {
  AAPL: "#f0f0f0", // bright silver — Apple grey kept visible on dark bg
  AMZN: "#ff9900", // Amazon orange — unchanged, distinct
  GOOGL: "#34a853", // Google green — avoids blue clash with MSFT/META
  META: "#e040fb", // purple — moves Meta off blue entirely
  MSFT: "#00a4ef", // Microsoft blue — now the sole blue
  NVDA: "#76b900", // Nvidia green — unchanged
  TSLA: "#ff3d3d", // bright red — Tesla, more visible than dark #cc0000
  SPX:  "#ffd700", // gold — S&P 500 benchmark
  QQQ:  "#00e5ff", // cyan — Nasdaq-100 benchmark
};
const COMPANY_NAMES = {
  AMZN: "Amazon", GOOGL: "Google", META: "Meta",
  MSFT: "Microsoft", TSLA: "Tesla", AAPL: "Apple", NVDA: "Nvidia",
  SPX: "S&P 500", QQQ: "Nasdaq-100",
};
const BENCHMARKS = new Set(["SPX", "QQQ"]);

const tooltip = d3.select("#tooltip");
const fmtDate = d3.timeFormat("%b %d, %Y");
const fmtMonthYear = d3.timeFormat("%b %d, %Y");
const fmtNum = d3.format(",.0f");
const fmtBillions = d => `$${(d / 1e9).toFixed(1)}B`;
const fmtPct = d => d != null ? `${d}%` : "N/A";

function showTooltip(event, html) {
  tooltip.html(html).style("opacity", 1)
    .style("left", Math.min(event.clientX + 15, window.innerWidth - 300) + "px")
    .style("top", (event.clientY - 10) + "px");
}
function hideTooltip() { tooltip.style("opacity", 0); }

// ============================================
// Global time state
// ============================================
let TIME_START = new Date("2020-01-01");
let TIME_END = new Date("2024-12-31");
const globalTimeScale = d3.scaleTime().domain([TIME_START, TIME_END]).range([0, 1]).clamp(true);

let currentTime = TIME_END; // start showing full timeline
const timeListeners = []; // functions called when time changes

let rangeStartTime = TIME_START;
const rangeListeners = [];
let compareMode = false;

// Year filter state
let activeYear = null; // null = all years
let FULL_TIME_START = TIME_START; // the full data range (never changes)
let FULL_TIME_END = TIME_END;
const yearRangeListeners = []; // notified when year zoom changes

function setTimeRange(startDate, endDate) {
  TIME_START = startDate;
  TIME_END = endDate;
  globalTimeScale.domain([TIME_START, TIME_END]);
  renderTimelineLabels();
}

function setYearRange(startDate, endDate) {
  setTimeRange(startDate, endDate);
  rangeStartTime = startDate;
  currentTime = endDate;
  compareMode = false;
  const bar = document.getElementById("timeline-bar");
  if (bar) bar.classList.remove("compare-active");
  const info = document.getElementById("compare-info");
  if (info) info.style.display = "none";
  yearRangeListeners.forEach(fn => fn(startDate, endDate));
  setGlobalTime(endDate);
  // Snap timeline cursor to the end of the selected range
  const track = document.getElementById("timeline-track");
  const cursor = document.getElementById("timeline-cursor");
  if (track && cursor) cursor.style.left = (track.getBoundingClientRect().width - 1.5) + "px";
}

function setupYearFilter(startYear, endYear) {
  const container = d3.select("#year-filter");
  container.append("span").attr("class", "year-filter-label").text("Year:");

  const makeBtn = (label, year) => {
    container.append("button")
      .attr("class", "year-btn" + (year === null ? " active" : ""))
      .attr("id", year === null ? "year-btn-all" : `year-btn-${year}`)
      .text(label)
      .on("click", function () {
        container.selectAll(".year-btn").classed("active", false);
        d3.select(this).classed("active", true);
        activeYear = year;
        if (year === null) {
          setYearRange(new Date(startYear, 0, 1), new Date(endYear, 11, 31));
        } else {
          setYearRange(new Date(year, 0, 1), new Date(year, 11, 31));
        }
      });
  };

  makeBtn("All", null);
  d3.range(startYear, endYear + 1).forEach(y => makeBtn(String(y), y));
}

const fmtMonthShort = d3.timeFormat("%b");

function renderTimelineLabels() {
  const labels = d3.select(".timeline-labels");
  if (labels.empty()) return;

  labels.selectAll("span").remove();

  if (activeYear !== null) {
    // Single year selected — show month labels
    d3.range(0, 12).forEach(m => {
      const date = new Date(activeYear, m, 1);
      const pct = globalTimeScale(date) * 100;
      labels.append("span").text(fmtMonthShort(date)).style("left", pct + "%");
    });
  } else {
    // All years — show year labels
    const startYear = TIME_START.getFullYear();
    const endYear = TIME_END.getFullYear();
    d3.range(startYear, endYear + 1).forEach(y => {
      const pct = globalTimeScale(new Date(y, 0, 1)) * 100;
      labels.append("span").text(y).style("left", pct + "%");
    });
  }
}

// ============================================
// Global filter state
// ============================================
let selectedCompanies = new Set(); // Set of selected tickers, empty = all
let showingAll = true; // state flag
const filterListeners = []; // functions called when filter changes

function toggleCompanyFilter(ticker) {
  if (ticker === null) {
    // "All" button clicked
    selectedCompanies.clear();
    showingAll = true;
  } else {
    // Individual ticker clicked
    showingAll = false;
    if (selectedCompanies.has(ticker)) {
      selectedCompanies.delete(ticker);
    } else {
      selectedCompanies.add(ticker);
    }
  }
  filterListeners.forEach(fn => fn());
}

function setGlobalTime(t) {
  currentTime = t;
  d3.select("#current-date").text(fmtMonthYear(t));
  timeListeners.forEach(fn => fn(t));
}

// ============================================
// Company filter checkboxes
// ============================================
function setupCompanyFilter(tickers) {
  const container = d3.select("#company-filter");
  container.append("span").text("Filter:");

  // "All" checkbox
  const allLabel = container.append("label")
    .attr("class", "filter-checkbox-label")
    .attr("id", "all-label");

  allLabel.append("input")
    .attr("type", "checkbox")
    .attr("id", "all-checkbox")
    .attr("checked", true)
    .on("change", () => {
      const isChecked = d3.select("#all-checkbox").property("checked");
      if (isChecked) {
        toggleCompanyFilter(null);
      } else {
        selectedCompanies.clear();
        showingAll = false;
        filterListeners.forEach(fn => fn());
      }
    });

  allLabel.append("span")
    .attr("class", "checkbox-text")
    .text("All Companies");

  // Individual company checkboxes — companies first, then benchmarks with a divider
  const mag7Tickers = tickers.filter(t => !BENCHMARKS.has(t));
  const benchmarkTickers = tickers.filter(t => BENCHMARKS.has(t));

  const addCheckbox = (t) => {
    const label = container.append("label")
      .attr("class", "filter-checkbox-label")
      .attr("id", `label-${t}`);

    label.append("input")
      .attr("type", "checkbox")
      .attr("class", "company-checkbox")
      .attr("id", `checkbox-${t}`)
      .style("accent-color", COLORS[t])
      .on("change", () => {
        toggleCompanyFilter(t);
      });

    label.append("span")
      .attr("class", "checkbox-text")
      .style("color", COLORS[t])
      .text(COMPANY_NAMES[t]);
  };

  mag7Tickers.forEach(addCheckbox);

  // Benchmarks go in the dedicated #benchmark-filter div (right column of header)
  if (benchmarkTickers.length > 0) {
    const benchContainer = d3.select("#benchmark-filter");
    benchContainer.append("span").attr("class", "filter-benchmark-label").text("Benchmarks:");
    benchmarkTickers.forEach(t => {
      const label = benchContainer.append("label")
        .attr("class", "filter-checkbox-label")
        .attr("id", `label-${t}`);
      label.append("input")
        .attr("type", "checkbox")
        .attr("class", "company-checkbox")
        .attr("id", `checkbox-${t}`)
        .style("accent-color", COLORS[t])
        .on("change", () => toggleCompanyFilter(t));
      label.append("span")
        .attr("class", "checkbox-text")
        .style("color", COLORS[t])
        .text(COMPANY_NAMES[t]);
    });
  }

  // Update checkbox states whenever filter changes
  filterListeners.push(() => {
    if (showingAll) {
      d3.select("#all-checkbox").property("checked", true);
      tickers.forEach(t => {
        d3.select(`#checkbox-${t}`).property("checked", false);
      });
    } else {
      d3.select("#all-checkbox").property("checked", false);
      tickers.forEach(t => {
        d3.select(`#checkbox-${t}`).property("checked", selectedCompanies.has(t));
      });
    }
  });
}

// ============================================
// Timeline bar at bottom — also a scrubber
// ============================================
function setupTimelineBar(layoffs) {
  const track = document.getElementById("timeline-track");
  const cursorEnd = document.getElementById("timeline-cursor");
  const cursorStart = document.getElementById("timeline-cursor-start");
  const rangeEl = document.getElementById("timeline-range");
  const eventsContainer = d3.select("#timeline-events");

  // Add layoff event ticks
  layoffs.forEach(d => {
    const pct = globalTimeScale(d.date) * 100;
    eventsContainer.append("div")
      .attr("class", "timeline-tick")
      .attr("data-ticker", d.ticker)
      .attr("data-date", d.date.toISOString())
      .style("left", pct + "%")
      .style("background", COLORS[d.ticker]);
  });

  // Reposition + show/hide ticks when year range changes
  yearRangeListeners.push(() => {
    eventsContainer.selectAll(".timeline-tick").each(function() {
      const tick = d3.select(this);
      const tickDate = new Date(tick.attr("data-date"));
      const ticker = tick.attr("data-ticker");
      const inRange = tickDate >= TIME_START && tickDate <= TIME_END;
      const companyOk = showingAll || selectedCompanies.has(ticker);
      tick.style("display", inRange && companyOk ? null : "none")
          .style("left", (globalTimeScale(tickDate) * 100) + "%");
    });
  });

  // Hide/show ticks when company filter changes
  filterListeners.push(() => {
    eventsContainer.selectAll(".timeline-tick").each(function() {
      const tick = d3.select(this);
      const ticker = tick.attr("data-ticker");
      const tickDate = new Date(tick.attr("data-date"));
      const inYearRange = tickDate >= TIME_START && tickDate <= TIME_END;
      tick.style("display", (showingAll || selectedCompanies.has(ticker)) && inYearRange ? null : "none");
    });
  });

  function updateRangeHighlight() {
    const startPct = globalTimeScale(rangeStartTime) * 100;
    const endPct = globalTimeScale(currentTime) * 100;
    rangeEl.style.left = Math.min(startPct, endPct) + "%";
    rangeEl.style.width = Math.abs(endPct - startPct) + "%";
  }

  function updateEndCursor(clientX) {
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    cursorEnd.style.left = (pct * rect.width - 1.5) + "px";
    setGlobalTime(globalTimeScale.invert(pct));
    updateRangeHighlight();
  }

  function updateStartCursor(clientX) {
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    cursorStart.style.left = (pct * rect.width - 1.5) + "px";
    // Update position + label during drag, but don't rebase the chart yet
    rangeStartTime = globalTimeScale.invert(pct);
    d3.select("#range-start-date").text(fmtMonthYear(rangeStartTime));
    updateRangeHighlight();
  }

  // Single mode only: clicking/dragging track sets end cursor
  let draggingTrack = false;
  track.addEventListener("mousedown", (e) => {
    if (compareMode) return;
    draggingTrack = true;
    updateEndCursor(e.clientX);
  });
  window.addEventListener("mousemove", (e) => {
    if (draggingTrack) updateEndCursor(e.clientX);
  });
  window.addEventListener("mouseup", () => { draggingTrack = false; });

  // Keep range highlight in sync when end cursor moves via global mouse
  timeListeners.push(updateRangeHighlight);

  // Initialize cursor positions
  const trackWidth = track.getBoundingClientRect().width;
  cursorStart.style.left = (-1.5) + "px";
  cursorEnd.style.left = (trackWidth - 1.5) + "px";
}

// ============================================
// Load data and render
// ============================================
Promise.all([
  d3.csv("data/stock_prices.csv"),
  d3.json("data/layoffs.json"),
  d3.json("data/capex.json")
]).then(([stockRaw, layoffs, capex]) => {
  const stockData = stockRaw.map(d => ({
    date: new Date(d.date), ticker: d.ticker, close: +d.close
  }));

  // Use loaded stock data to drive the dashboard time span.
  const dateExtent = d3.extent(stockData, d => d.date);
  let dataStartYear = 2020, dataEndYear = 2024;
  if (dateExtent[0] && dateExtent[1]) {
    dataStartYear = dateExtent[0].getFullYear();
    dataEndYear   = dateExtent[1].getFullYear();
    const minDate = new Date(dataStartYear, 0, 1);
    const maxDate = new Date(dataEndYear, 11, 31);
    FULL_TIME_START = minDate;
    FULL_TIME_END   = maxDate;
    setTimeRange(minDate, maxDate);
    rangeStartTime = minDate;
  }

  layoffs.forEach(d => {
    d.date = new Date(d.Date_layoffs);
    d.laid_off = +d.Laid_Off;
    d.percentage = d.Percentage;
  });

  const tickers = [...new Set(stockData.map(d => d.ticker))];
  setupYearFilter(dataStartYear, dataEndYear);
  setupCompanyFilter(tickers);
  setupTimelineBar(layoffs);
  renderStockChart(stockData, layoffs);
  renderCapexChart(capex, tickers);
  renderLayoffPanel(layoffs);

  // Initialize to show full timeline
  setGlobalTime(TIME_END);
  const track = document.getElementById("timeline-track");
  const trackCursor = document.getElementById("timeline-cursor");

  // Align timeline bar padding so track + labels both match the stock chart's x-axis
  const stockSvg = document.querySelector("#stock-chart svg");
  if (stockSvg) {
    const chartMarginLeft = 68, chartMarginRight = 20;
    const svgRect = stockSvg.getBoundingClientRect();
    const bar = document.getElementById("timeline-bar");
    bar.style.paddingLeft = (svgRect.left + chartMarginLeft) + "px";
    bar.style.paddingRight = (window.innerWidth - svgRect.right + chartMarginRight) + "px";
  }
  trackCursor.style.left = (track.getBoundingClientRect().width - 1.5) + "px";

  // Global mouse: drive time in single mode only
  document.addEventListener("mousemove", (e) => {
    if (compareMode) return;
    const trackRect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - trackRect.left) / trackRect.width));
    const t = globalTimeScale.invert(pct);
    setGlobalTime(t);
    trackCursor.style.left = (pct * trackRect.width - 1.5) + "px";
  });

});

// Shift+N: cycle normalize modes  Off → vs S&P 500 → vs Nasdaq-100 → Off
// Registered outside the data promise so it is always attached on page load
const normCycle = ["none", "SPX", "QQQ"];
document.addEventListener("keydown", (e) => {
  if (e.shiftKey && e.key === "N") {
    const current = document.querySelector(".norm-btn.active")?.dataset.norm ?? "none";
    const next = normCycle[(normCycle.indexOf(current) + 1) % normCycle.length];
    document.querySelector(`.norm-btn[data-norm="${next}"]`)?.click();
  }
});

// ============================================
// Chart 1: Stock Price — mouse X = time cursor
// ============================================
function renderStockChart(stockData, layoffs) {
  const container = d3.select("#stock-chart");
  const rect = container.node().getBoundingClientRect();
  const margin = { top: 15, right: 20, bottom: 35, left: 68 };
  const width = rect.width - margin.left - margin.right;
  const height = rect.height - margin.top - margin.bottom - 10;

  const tickers = [...new Set(stockData.map(d => d.ticker))];
  const grouped = d3.group(stockData, d => d.ticker);

  // Normalize prices
  const normalized = new Map();
  grouped.forEach((values, ticker) => {
    const sorted = values.sort((a, b) => a.date - b.date);
    const base = sorted[0].close;
    normalized.set(ticker, sorted.map(d => ({
      date: d.date, value: (d.close / base) * 100, close: d.close
    })));
  });

  // Legend with toggle — delegates to toggleCompanyFilter so header checkboxes stay in sync
  const legendEl = d3.select("#stock-legend");
  const active = new Set(tickers);
  tickers.forEach(t => {
    const item = legendEl.append("div").attr("class", "legend-item")
      .on("click", () => {
        toggleCompanyFilter(t);
      });
    item.append("div").attr("class", "legend-swatch").style("background", COLORS[t]);
    item.append("span").text(COMPANY_NAMES[t]);
  });

  // Listen to filter changes
  filterListeners.push(() => {
    if (showingAll) {
      // Show all
      tickers.forEach(t => {
        active.add(t);
        legendEl.select(`[data-ticker="${t}"]`).classed("disabled", false);
      });
    } else {
      // Show only selected
      tickers.forEach(t => {
        if (selectedCompanies.has(t)) active.add(t);
        else active.delete(t);
        legendEl.select(`[data-ticker="${t}"]`).classed("disabled", !selectedCompanies.has(t));
      });
    }
    updateLines();
    updateComparePanel();
    // Hide scrub panel immediately if no companies are active
    const sp = document.getElementById("scrub-info");
    if (sp && active.size === 0) sp.style.display = "none";
  });

  // Add data-ticker attribute to legend items
  legendEl.selectAll(".legend-item").each(function (_, i) {
    d3.select(this).attr("data-ticker", tickers[i]);
  });

  const svg = container.append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleTime().domain([TIME_START, TIME_END]).range([0, width]);
  const allVals = [];
  normalized.forEach(v => v.forEach(d => allVals.push(d.value)));
  const yMin = Math.min(d3.min(allVals), 100);
  const yMax = Math.max(d3.max(allVals), 100);
  const yPad = (yMax - yMin) * 0.05;
  let y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([height, 0]);

  // ── Benchmark normalization state ──
  let normBenchmark = "none"; // "none" | "SPX" | "QQQ"

  // Build benchmark-relative data: each value = (company rebased) / (benchmark rebased) * 100
  function buildNormalized(baseData, benchmark) {
    if (benchmark === "none") return baseData;
    const benchData = baseData.get(benchmark);
    if (!benchData) return baseData;
    // Build a lookup: date string → benchmark rebased value
    const benchMap = new Map(benchData.map(d => [d.date.getTime(), d.value]));
    const result = new Map();
    baseData.forEach((vals, t) => {
      result.set(t, vals.map(d => {
        const bVal = benchMap.get(d.date.getTime());
        const relValue = bVal ? (d.value / bVal) * 100 : d.value;
        return { date: d.date, value: relValue, close: d.close };
      }));
    });
    return result;
  }

  // Helper — push currentData values into the bound SVG datums so lineGen uses fresh data
  function flushDataToDatums() {
    tickers.forEach(t => {
      svg.selectAll(`.line-${t}`).datum(currentData.get(t));
      svg.selectAll(`.future-${t}`).datum(currentData.get(t));
    });
  }

  // Normalize buttons
  document.querySelectorAll(".norm-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      normBenchmark = btn.dataset.norm;
      document.querySelectorAll(".norm-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      // Rebuild currentData respecting the active year rebase, then flush to datums
      rebaseCurrentData(activeYear !== null ? new Date(activeYear, 0, 1) : null);
      yAxisLabel.text(normBenchmark === "none"
        ? "% Change from Start"
        : `Excess Return vs ${normBenchmark === "SPX" ? "S&P 500" : "Nasdaq-100"}`);
      // Show/hide benchmark line depending on normalize mode
      tickers.forEach(t => {
        if (BENCHMARKS.has(t)) {
          const hide = normBenchmark !== "none" && t === normBenchmark;
          svg.selectAll(`.line-${t}`).style("opacity", hide ? 0 : null);
          svg.selectAll(`.future-${t}`).style("opacity", hide ? 0 : null);
        }
      });
      zeroLineLabel.text(normBenchmark === "none"
        ? ""
        : `← ${normBenchmark === "SPX" ? "S&P 500" : "Nasdaq-100"} baseline (0%)`);
      updateLines();
      updateComparePanel();
    });
  });

  const fmtYAxis = d => `${d >= 100 ? "+" : ""}${(d - 100).toFixed(0)}%`;

  // Always include 100 (0%) in y-axis ticks
  function yTickValues(scale) {
    const ticks = scale.ticks(5);
    if (!ticks.includes(100)) {
      ticks.push(100);
      ticks.sort((a, b) => a - b);
    }
    return ticks;
  }

  // Grid + axes (updated dynamically when active set changes)
  const gridG = svg.append("g").attr("class", "grid").call(d3.axisLeft(y).tickValues(yTickValues(y)).tickSize(-width).tickFormat(""));
  const xAxisG = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));
  const yAxisG = svg.append("g").attr("class", "axis").call(d3.axisLeft(y).tickValues(yTickValues(y)).tickFormat(fmtYAxis));

  // Persistent 0% baseline + label (relabelled when normalization is active)
  const zeroLine = svg.append("line").attr("class", "zero-line")
    .attr("x1", 0).attr("x2", width)
    .attr("y1", y(100)).attr("y2", y(100));

  const zeroLineLabel = svg.append("text")
    .attr("x", 4).attr("y", y(100) - 4)
    .style("fill", "#8b949e").style("font-size", "9px").style("font-style", "italic")
    .text("");

  const yAxisLabel = svg.append("text").attr("transform", "rotate(-90)")
    .attr("y", -52).attr("x", -height / 2).attr("text-anchor", "middle")
    .style("fill", "#8b949e").style("font-size", "11px").text("% Change from Start");

  // Clip path — reveals data up to current time
  const defs = svg.append("defs");
  defs.append("clipPath").attr("id", "stock-clip")
    .append("rect").attr("id", "stock-clip-rect")
    .attr("x", 0).attr("y", -5).attr("height", height + 10).attr("width", width);

  // Bounds clip — keeps future lines within the chart area (prevents rendering before x=0)
  defs.append("clipPath").attr("id", "stock-bounds-clip")
    .append("rect")
    .attr("x", 0).attr("y", -5).attr("width", width).attr("height", height + 10);

  const clipArea = svg.append("g").attr("clip-path", "url(#stock-clip)");

  // currentData is rebased to TIME_START when a year filter is active, or benchmark-normalized
  let currentData = normalized;

  // Full lines (faded) as background reference — clipped to chart bounds so they don't bleed left
  const lineGen = d3.line().x(d => x(d.date)).y(d => y(d.value)).curve(d3.curveMonotoneX);
  tickers.forEach(t => {
    svg.insert("path", ":first-child").datum(normalized.get(t))
      .attr("class", `stock-line-future future-${t}`)
      .attr("clip-path", "url(#stock-bounds-clip)")
      .attr("d", lineGen).attr("stroke", COLORS[t])
      .attr("stroke-dasharray", BENCHMARKS.has(t) ? "6 3" : null);
  });

  // Solid lines up to time cursor
  tickers.forEach(t => {
    clipArea.append("path").datum(normalized.get(t))
      .attr("class", `stock-line line-${t}`)
      .attr("d", lineGen).attr("stroke", COLORS[t])
      .attr("stroke-dasharray", BENCHMARKS.has(t) ? "6 3" : null);
  });

  // Layoff markers — bisect defined below, so we defer yVal computation to updateLines
  const markerData = layoffs.map(d => {
    if (!normalized.get(d.ticker)) return null;
    return { ...d };
  }).filter(Boolean);

  clipArea.selectAll(".layoff-marker").data(markerData).enter()
    .append("circle").attr("class", d => `layoff-marker marker-${d.ticker}`)
    .attr("cx", d => x(d.date)).attr("cy", height / 2)
    .attr("r", 7).attr("fill", d => COLORS[d.ticker])
    .attr("stroke", "#f0f6fc").attr("stroke-width", 2).attr("opacity", 0.9)
    .on("mouseover", (event, d) => {
      d3.select(event.target).attr("r", 10);
      showTooltip(event, `
        <div class="tt-title">${COMPANY_NAMES[d.ticker]} Layoff</div>
        <div class="tt-row"><span class="tt-label">Date:</span><span>${fmtDate(d.date)}</span></div>
        <div class="tt-row"><span class="tt-label">Laid off:</span><span>${fmtNum(d.laid_off)}</span></div>
        <div class="tt-row"><span class="tt-label">Percentage:</span><span>${fmtPct(d.percentage)}</span></div>
      `);
    })
    .on("mousemove", (event) => {
      tooltip.style("left", Math.min(event.clientX + 15, window.innerWidth - 300) + "px")
        .style("top", (event.clientY - 10) + "px");
    })
    .on("mouseout", (event) => { d3.select(event.target).attr("r", 7); hideTooltip(); });

  // Range start indicator line (dashed, white)
  const rangeStartLine = svg.append("line").attr("class", "range-start-line")
    .attr("y1", 0).attr("y2", height)
    .attr("x1", x(rangeStartTime)).attr("x2", x(rangeStartTime));

  // Vertical time cursor line
  const cursorLine = svg.append("line").attr("class", "time-cursor")
    .attr("y1", 0).attr("y2", height).attr("x1", width).attr("x2", width);

  // Price dots on cursor (end / right cursor)
  const cursorDots = {};
  const cursorLabels = {};
  tickers.forEach(t => {
    cursorDots[t] = svg.append("circle").attr("class", "cursor-dot")
      .attr("r", 4).attr("fill", COLORS[t]).attr("stroke", "#0d1117").attr("stroke-width", 1.5);
    cursorLabels[t] = svg.append("text")
      .style("fill", COLORS[t]).style("font-size", "10px").style("font-weight", "600")
      .attr("pointer-events", "none");
  });

  // Price dots on start cursor (left cursor — compare mode only)
  const startDots = {};
  const startLabels = {};
  tickers.forEach(t => {
    startDots[t] = svg.append("circle").attr("class", "cursor-dot")
      .attr("r", 4).attr("fill", COLORS[t]).attr("stroke", "#0d1117").attr("stroke-width", 1.5)
      .style("display", "none");
    startLabels[t] = svg.append("text")
      .style("fill", COLORS[t]).style("font-size", "10px").style("font-weight", "600")
      .attr("text-anchor", "end").attr("pointer-events", "none")
      .style("display", "none");
  });

  const bisect = d3.bisector(d => d.date).left;

  // Return the value of the data point in vals closest in time to targetDate
  function nearestValue(vals, targetDate) {
    const i = bisect(vals, targetDate, 1);
    const prev = vals[Math.max(0, i - 1)];
    const next = vals[Math.min(i, vals.length - 1)];
    const usePrev = !next || Math.abs(prev.date - targetDate) <= Math.abs(next.date - targetDate);
    return (usePrev ? prev : next).value;
  }

  // Rebase all normalized values so that the given baseDate = 0% (value 100)
  function rebaseCurrentData(baseDate) {
    if (baseDate === null) {
      currentData = buildNormalized(normalized, normBenchmark);
    } else {
      const rebased = new Map();
      normalized.forEach((values, ticker) => {
        const bi = Math.max(0, bisect(values, baseDate, 1) - 1);
        const baseVal = values[Math.min(bi, values.length - 1)].value;
        rebased.set(ticker, values.map(d => ({
          date: d.date, close: d.close,
          value: (d.value / baseVal) * 100
        })));
      });
      currentData = buildNormalized(rebased, normBenchmark);
    }
    // Update path datums so lineGen picks up the new values
    flushDataToDatums();
  }

  // Get close price for a ticker at a given date
  function getCloseAtTime(ticker, t) {
    const data = normalized.get(ticker);
    const i = Math.max(0, bisect(data, t, 1) - 1);
    return data[Math.min(i, data.length - 1)].close;
  }

  // Show price dots + labels at the start (left) cursor in compare mode
  function updateStartCursorLabels(t0) {
    if (!compareMode) {
      tickers.forEach(t => {
        startDots[t].style("display", "none");
        startLabels[t].style("display", "none");
      });
      return;
    }
    const cx0 = x(t0);
    const labelPositions = [];
    tickers.forEach(ticker => {
      if (!active.has(ticker)) {
        startDots[ticker].style("display", "none");
        startLabels[ticker].style("display", "none");
        return;
      }
      const data = currentData.get(ticker);
      // Use same floor lookup as getCloseAtTime so price matches the compare panel
      const i = Math.max(0, bisect(data, t0, 1) - 1);
      const d = data[Math.min(i, data.length - 1)];
      if (!d) {
        startDots[ticker].style("display", "none");
        startLabels[ticker].style("display", "none");
        return;
      }
      startDots[ticker].style("display", null)
        .attr("cx", cx0).attr("cy", y(d.value));
      labelPositions.push({ ticker, yPos: y(d.value), value: d.value, close: d.close });
    });

    // Avoid overlap — same stacking as end labels
    labelPositions.sort((a, b) => a.yPos - b.yPos);
    for (let i = 1; i < labelPositions.length; i++) {
      if (labelPositions[i].yPos - labelPositions[i - 1].yPos < 12)
        labelPositions[i].yPos = labelPositions[i - 1].yPos + 12;
    }
    labelPositions.forEach(lp => {
      // Left cursor is the reference — show price only, no % (avoids confusion with range %)
      startLabels[lp.ticker].style("display", null)
        .attr("x", cx0 - 8).attr("y", lp.yPos + 4)
        .text(`$${lp.close.toFixed(1)}`);
    });
  }

  // Sync timeline bar cursors to reflect brush selection
  function syncTimelineCursors(t0, t1) {
    const track = document.getElementById("timeline-track");
    if (!track) return;
    const tw = track.getBoundingClientRect().width;
    const p0 = globalTimeScale(t0), p1 = globalTimeScale(t1);
    document.getElementById("timeline-cursor-start").style.left = (p0 * tw - 1.5) + "px";
    document.getElementById("timeline-cursor").style.left = (p1 * tw - 1.5) + "px";
    document.getElementById("timeline-range").style.left  = (p0 * 100) + "%";
    document.getElementById("timeline-range").style.width = ((p1 - p0) * 100) + "%";
    d3.select("#range-start-date").text(fmtMonthYear(t0));
    d3.select("#current-date").text(fmtMonthYear(t1));

    // Avoid label overlap: when cursors are close, flip labels outward
    const OVERLAP_THRESHOLD = 130; // px — approx width of two date labels
    const startLabel = document.getElementById("range-start-date");
    const endLabel   = document.getElementById("current-date");
    if ((p1 - p0) * tw < OVERLAP_THRESHOLD) {
      // Start label: anchor to right edge (appears to the left of cursor)
      startLabel.style.left      = "auto";
      startLabel.style.right     = "calc(100% + 4px)";
      startLabel.style.transform = "none";
      // End label: anchor to left edge (appears to the right of cursor)
      endLabel.style.left      = "calc(100% + 4px)";
      endLabel.style.transform = "none";
    } else {
      // Restore default centered positioning
      startLabel.style.left      = "50%";
      startLabel.style.right     = "";
      startLabel.style.transform = "translateX(-50%)";
      endLabel.style.left      = "50%";
      endLabel.style.transform = "translateX(-50%)";
    }
  }

  // D3 brush — always active; drawing a rectangle auto-enters compare mode
  const brushG = svg.append("g").attr("class", "stock-brush");
  const brush = d3.brushX()
    .extent([[0, 0], [width, height]])
    .on("brush", ({ selection }) => {
      if (!selection) return;
      const [x0, x1] = selection;
      const t0 = x.invert(x0), t1 = x.invert(x1);
      // Auto-enter compare mode on first drag
      if (!compareMode) {
        compareMode = true;
        document.getElementById("timeline-bar").classList.add("compare-active");
      }
      rangeStartLine.attr("x1", x0).attr("x2", x0);
      cursorLine.attr("x1", x1).attr("x2", x1);
      d3.select("#stock-clip-rect").attr("x", x0).attr("width", Math.max(0, x1 - x0));
      syncTimelineCursors(t0, t1);
      // Update all panels live while dragging
      rangeStartTime = t0;
      currentTime    = t1;
      timeListeners.forEach(fn => fn(t1));
      updateStartCursorLabels(t0);
      updateComparePanel();
    })
    .on("end", ({ selection }) => {
      if (!selection) {
        // Brush cleared — exit compare mode
        compareMode = false;
        rangeStartTime = TIME_START;
        document.getElementById("timeline-bar").classList.remove("compare-active");
        document.getElementById("compare-info").style.display = "none";
        d3.select("#stock-clip-rect").attr("x", 0).attr("width", x(currentTime));
        rangeStartLine.attr("x1", x(TIME_START)).attr("x2", x(TIME_START));
        cursorLine.attr("x1", x(currentTime)).attr("x2", x(currentTime));
        // Hide start-cursor labels
        tickers.forEach(t => {
          startDots[t].style("display", "none");
          startLabels[t].style("display", "none");
        });
        // Restore CapEx and Layoff to full-timeline view
        timeListeners.forEach(fn => fn(currentTime));
        return;
      }
      rangeStartTime = x.invert(selection[0]);
      currentTime    = x.invert(selection[1]);
      updateComparePanel();
    });
  brushG.call(brush);


  // When range start moves: just reposition the start line and refresh the clip
  function onRangeStartChange() {
    rangeStartLine.attr("x1", x(rangeStartTime)).attr("x2", x(rangeStartTime));
    setGlobalTime(currentTime); // re-fires timeListeners to update clip bounds
    updateStartCursorLabels(rangeStartTime);
    updateComparePanel();
  }
  rangeListeners.push(onRangeStartChange);

  function updateComparePanel() {
    const panel = document.getElementById("compare-info");
    if (!panel) return;
    if (!compareMode) { panel.style.display = "none"; return; }

    // Benchmark return over the selected window — round once so formula components are consistent
    let benchPctR = 0;
    if (normBenchmark !== "none") {
      const bStart = getCloseAtTime(normBenchmark, rangeStartTime);
      const bEnd   = getCloseAtTime(normBenchmark, currentTime);
      benchPctR = Math.round((bEnd - bStart) / bStart * 1000) / 10; // 1 d.p.
    }

    const rows = tickers
      .filter(t => active.has(t))
      .map(t => {
        const startPrice = getCloseAtTime(t, rangeStartTime);
        const endPrice   = getCloseAtTime(t, currentTime);
        // Round individual components first so formula always adds up to the displayed value
        const rawPctR = Math.round((endPrice - startPrice) / startPrice * 1000) / 10;
        const isBench = normBenchmark !== "none" && t === normBenchmark;
        const pct = normBenchmark !== "none" ? (isBench ? 0 : rawPctR - benchPctR) : rawPctR;
        return { t, startPrice, endPrice, rawPctR, pct, isBench };
      })
      .sort((a, b) => b.pct - a.pct);

    const s = n => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
    const startDay = new Date(rangeStartTime.getFullYear(), rangeStartTime.getMonth(), rangeStartTime.getDate());
    const endDay   = new Date(currentTime.getFullYear(),   currentTime.getMonth(),   currentTime.getDate());
    const days = Math.round((endDay - startDay) / 86_400_000);
    panel.innerHTML = `
      <div class="compare-info-drag-handle"></div>
      <div class="compare-info-header">
        ${fmtMonthYear(rangeStartTime)} &rarr; ${fmtMonthYear(currentTime)}
        <span class="compare-info-days">(${days} day${days !== 1 ? 's' : ''})</span>
      </div>
      ${rows.map(r => {
        const breakdown = normBenchmark !== "none"
          ? r.isBench
            ? `<span class="compare-info-breakdown">(${benchPctR <= 0 ? '+' : '−'}${Math.abs(benchPctR).toFixed(1)}%)</span>`
            : `<span class="compare-info-breakdown">(${s(r.rawPctR)} ${benchPctR >= 0 ? '−' : '+'} ${Math.abs(benchPctR).toFixed(1)}%)</span>`
          : '';
        return `
        <div class="compare-info-row">
          <div class="compare-info-left">
            <span class="compare-info-name" style="color:${COLORS[r.t]}">${COMPANY_NAMES[r.t]}</span>
            <span class="compare-info-prices">$${r.startPrice.toFixed(1)} → $${r.endPrice.toFixed(1)}</span>
          </div>
          <div class="compare-info-right">
            <span class="compare-info-pct ${r.pct >= 0 ? 'cmp-pos' : 'cmp-neg'}">${s(r.pct)}</span>
            ${breakdown}
          </div>
        </div>`;
      }).join('')}
    `;
    panel.style.display = "block";
    makeDraggable(panel);
  }

  // Transparent overlay for hover tooltips on stock lines
  svg.append("rect").attr("width", width).attr("height", height)
    .style("fill", "none").style("pointer-events", "all").style("cursor", "crosshair");

  // Brush must always sit above the hover overlay in SVG z-order
  brushG.raise();

  // Clear brush selection when year filter changes
  yearRangeListeners.push(() => {
    brush.move(brushG, null);
  });

  function updateLines() {
    tickers.forEach(t => {
      const vis = active.has(t);
      svg.selectAll(`.line-${t}`).style("opacity", vis ? 1 : 0);
      svg.selectAll(`.future-${t}`).style("opacity", vis ? 0.15 : 0);
      svg.selectAll(`.marker-${t}`).style("display", function(d) {
        return vis && d.date >= TIME_START && d.date <= TIME_END ? null : "none";
      });
      cursorDots[t].style("display", vis ? null : "none");
      cursorLabels[t].style("display", vis ? null : "none");
    });

    // Recalculate y domain from rebased currentData within the visible time window
    const activeVals = [];
    currentData.forEach((v, t) => {
      if (active.has(t)) {
        v.filter(d => d.date >= TIME_START && d.date <= TIME_END)
         .forEach(d => activeVals.push(d.value));
      }
    });
    if (activeVals.length === 0) return;
    const newMin = Math.min(d3.min(activeVals), 100);
    const newMax = Math.max(d3.max(activeVals), 100);
    const newPad = (newMax - newMin) * 0.05;
    y = d3.scaleLinear().domain([newMin - newPad, newMax + newPad]).range([height, 0]);

    // Redraw axis, grid, and zero line with transition
    yAxisG.transition().duration(400).call(d3.axisLeft(y).tickValues(yTickValues(y)).tickFormat(fmtYAxis));
    gridG.transition().duration(400).call(d3.axisLeft(y).tickValues(yTickValues(y)).tickSize(-width).tickFormat(""));
    zeroLine.transition().duration(400).attr("y1", y(100)).attr("y2", y(100));
    zeroLineLabel.transition().duration(400).attr("y", y(100) - 4);

    // Redraw all line paths with new scale
    tickers.forEach(t => {
      svg.selectAll(`.line-${t}`).transition().duration(400).attr("d", lineGen);
      svg.selectAll(`.future-${t}`).transition().duration(400).attr("d", lineGen);
    });

    // Redraw layoff markers using rebased currentData for cy
    svg.selectAll(".layoff-marker")
      .transition("marker-y").duration(400)
      .attr("cy", d => {
        const vals = currentData.get(d.ticker);
        if (!vals) return 0;
        return y(nearestValue(vals, d.date));
      });

    // Re-fire time listeners to reposition cursor dots at new scale
    timeListeners.forEach(fn => fn(currentTime));
    // Re-position start cursor labels at new scale
    updateStartCursorLabels(rangeStartTime);
  }

  // Zoom the stock chart when year filter changes
  yearRangeListeners.push((startDate, endDate) => {
    x.domain([startDate, endDate]);
    xAxisG.transition().duration(400).call(
      activeYear === null
        ? d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y"))
        : d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%b"))
    );
    // Redraw lines and faded background lines
    tickers.forEach(t => {
      svg.selectAll(`.line-${t}`).transition().duration(400).attr("d", lineGen);
      svg.selectAll(`.future-${t}`).transition().duration(400).attr("d", lineGen);
    });
    // Reset cursor and clip rect
    cursorLine.attr("x1", x(endDate)).attr("x2", x(endDate));
    rangeStartLine.attr("x1", x(startDate)).attr("x2", x(startDate));
    d3.select("#stock-clip-rect").attr("x", 0).attr("width", x(endDate));
    // Rebase to year start (or original baseline for All years)
    rebaseCurrentData(activeYear !== null ? startDate : null);
    // Recalculate y domain, redraw axis and lines (updateLines handles marker-y)
    updateLines();
    // Reposition marker x with new scale (y handled inside updateLines)
    svg.selectAll(".layoff-marker")
      .transition("marker-x").duration(400)
      .attr("cx", d => x(d.date));
  });

  // Listen to global time changes
  timeListeners.push((t) => {
    const cx = x(t);

    // Move clip rect — in compare mode only show [rangeStart, currentTime]
    const clipX = compareMode ? x(rangeStartTime) : 0;
    d3.select("#stock-clip-rect").attr("x", clipX).attr("width", Math.max(0, cx - clipX));

    // Move cursor line
    cursorLine.attr("x1", cx).attr("x2", cx);

    // Update price dots & labels
    let labelPositions = [];
    tickers.forEach(ticker => {
      if (!active.has(ticker)) return;
      const data = currentData.get(ticker);
      // Floor lookup — same as getCloseAtTime so price matches compare panel
      const i = Math.max(0, bisect(data, t, 1) - 1);
      const d = data[Math.min(i, data.length - 1)];
      if (!d || d.date > t) {
        cursorDots[ticker].style("display", "none");
        cursorLabels[ticker].style("display", "none");
        return;
      }

      cursorDots[ticker].style("display", null)
        .attr("cx", cx).attr("cy", y(d.value));

      labelPositions.push({ ticker, yPos: y(d.value), value: d.value, close: d.close });
    });

    // Avoid label overlap — sort by y and space them
    labelPositions.sort((a, b) => a.yPos - b.yPos);
    for (let i = 1; i < labelPositions.length; i++) {
      if (labelPositions[i].yPos - labelPositions[i - 1].yPos < 12) {
        labelPositions[i].yPos = labelPositions[i - 1].yPos + 12;
      }
    }

    const scrubPanel = document.getElementById("scrub-info");

    if (!compareMode && scrubPanel) {
      // Cursor mode: show compare-style panel (date range, prices, %, breakdown)
      labelPositions.forEach(lp => cursorLabels[lp.ticker].style("display", "none"));

      // Benchmark return from range start to cursor
      let benchPctR = 0;
      if (normBenchmark !== "none") {
        const bStart = getCloseAtTime(normBenchmark, rangeStartTime);
        const bEnd   = getCloseAtTime(normBenchmark, t);
        benchPctR = Math.round((bEnd - bStart) / bStart * 1000) / 10;
      }

      const s = n => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
      const startDay = new Date(rangeStartTime.getFullYear(), rangeStartTime.getMonth(), rangeStartTime.getDate());
      const endDay   = new Date(t.getFullYear(), t.getMonth(), t.getDate());
      const days = Math.round((endDay - startDay) / 86_400_000);

      const rows = labelPositions.slice()
        .map(lp => {
          const startPrice = getCloseAtTime(lp.ticker, rangeStartTime);
          const rawPctR = Math.round((lp.close - startPrice) / startPrice * 1000) / 10;
          const isBench = normBenchmark !== "none" && lp.ticker === normBenchmark;
          const pct = normBenchmark !== "none" ? (isBench ? 0 : rawPctR - benchPctR) : rawPctR;
          return { ticker: lp.ticker, startPrice, endPrice: lp.close, rawPctR, pct, isBench };
        })
        .sort((a, b) => b.pct - a.pct)
        .map(r => {
          const breakdown = normBenchmark !== "none"
            ? r.isBench
              ? `<span class="compare-info-breakdown">(${benchPctR <= 0 ? '+' : '−'}${Math.abs(benchPctR).toFixed(1)}%)</span>`
              : `<span class="compare-info-breakdown">(${s(r.rawPctR)} ${benchPctR >= 0 ? '−' : '+'} ${Math.abs(benchPctR).toFixed(1)}%)</span>`
            : '';
          return `
          <div class="compare-info-row">
            <div class="compare-info-left">
              <span class="compare-info-name" style="color:${COLORS[r.ticker]}">${COMPANY_NAMES[r.ticker]}</span>
              <span class="compare-info-prices">$${r.startPrice.toFixed(1)} &rarr; $${r.endPrice.toFixed(1)}</span>
            </div>
            <div class="compare-info-right">
              <span class="compare-info-pct ${r.pct >= 0 ? 'cmp-pos' : 'cmp-neg'}">${s(r.pct)}</span>
              ${breakdown}
            </div>
          </div>`;
        }).join('');

      scrubPanel.innerHTML = `
        <div class="compare-info-drag-handle"></div>
        <div class="compare-info-header">
          ${fmtMonthYear(rangeStartTime)} &rarr; ${fmtMonthYear(t)}
          <span class="compare-info-days">(${days} day${days !== 1 ? 's' : ''})</span>
        </div>
        ${rows}`;
      scrubPanel.style.display = labelPositions.length > 0 ? "block" : "none";
      makeDraggable(scrubPanel);
    } else {
      // Compare mode: hide scrub panel, show inline labels on cursor
      if (scrubPanel) scrubPanel.style.display = "none";
      labelPositions.forEach(lp => {
        const startClose = getCloseAtTime(lp.ticker, rangeStartTime);
        let rangePct = (lp.close - startClose) / startClose * 100;
        if (normBenchmark !== "none") {
          const bStart = getCloseAtTime(normBenchmark, rangeStartTime);
          const bEnd   = getCloseAtTime(normBenchmark, t);
          rangePct -= (bEnd - bStart) / bStart * 100;
        }
        const sign = rangePct >= 0 ? "+" : "";
        cursorLabels[lp.ticker].style("display", null)
          .attr("text-anchor", "start")
          .attr("x", cx + 8).attr("y", lp.yPos + 4)
          .text(`$${lp.close.toFixed(1)} (${sign}${rangePct.toFixed(1)}%)`);
      });
    }
  });

  // Position layoff markers at correct y on initial load
  updateLines();
}

// ============================================
// Chart 2: CapEx — bars grow up to current time
// ============================================
function renderCapexChart(capex, allTickers) {
  const container = d3.select("#capex-chart");
  const rect = container.node().getBoundingClientRect();
  const margin = { top: 10, right: 10, bottom: 40, left: 50 };
  const width = rect.width - margin.left - margin.right;
  const height = rect.height - margin.top - margin.bottom - 5;

  // Tickers that have capex data (array for scales, set for fast lookup)
  const showTickers = [...new Set(capex.map(d => d.ticker))].sort((a, b) => COMPANY_NAMES[a].localeCompare(COMPANY_NAMES[b]));
  const dataTickers = new Set(showTickers);
  const filtered = capex.filter(d => {
    const year = parseInt(d.calendar_quarter.slice(0, 4));
    return year >= TIME_START.getFullYear() && year <= TIME_END.getFullYear();
  });

  // Legend uses all Mag 7 tickers in the same order as the company filter (from stock CSV)
  const legendTickers = allTickers.filter(t => !BENCHMARKS.has(t));
  const capexLegend = d3.select("#capex-legend");
  legendTickers.forEach(t => {
    const item = capexLegend.append("div").attr("class", "legend-item").attr("data-ticker", t)
      .on("click", () => toggleCompanyFilter(t));
    item.append("div").attr("class", "legend-swatch").style("background", COLORS[t]);
    item.append("span").text(COMPANY_NAMES[t]);
    if (!dataTickers.has(t)) item.attr("title", "No data available").attr("data-no-capex", "1");
  });

  const svg = container.append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const quarters = [...new Set(filtered.map(d => d.calendar_quarter))].sort();

  // Map quarters to approximate dates for time-based filtering
  function quarterToDate(q) {
    const [y, qn] = q.split("Q");
    const month = (parseInt(qn) - 1) * 3;
    return new Date(parseInt(y), month + 2, 28); // end of quarter
  }

  const x0 = d3.scaleBand().domain(quarters).range([0, width]).padding(0.15);
  const x1 = d3.scaleBand().domain(showTickers).range([0, x0.bandwidth()]).padding(0.05);
  const y = d3.scaleLinear().domain([0, d3.max(filtered, d => d.val) * 1.1]).range([height, 0]);

  const capexGridG = svg.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(4).tickSize(-width).tickFormat(""));
  const capexXAxisG = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x0).tickValues(quarters.filter((_, i) => i % 3 === 0)));
  capexXAxisG.selectAll("text").attr("transform", "rotate(-35)").style("text-anchor", "end").style("font-size", "9px");
  const capexYAxisG = svg.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(4).tickFormat(fmtBillions));

  // Group by quarter
  const grouped = d3.group(filtered, d => d.calendar_quarter);

  // Draw bars
  quarters.forEach(q => {
    const qData = grouped.get(q) || [];
    const qDate = quarterToDate(q);

    qData.forEach(d => {
      svg.append("rect")
        .attr("class", "capex-bar")
        .attr("data-ticker", d.ticker)
        .attr("data-quarter", q)
        .attr("data-quarter-date", qDate.toISOString())
        .attr("data-val", d.val)
        .attr("x", x0(q) + x1(d.ticker))
        .attr("y", y(d.val))
        .attr("width", x1.bandwidth())
        .attr("height", height - y(d.val))
        .attr("fill", COLORS[d.ticker])
        .attr("opacity", 0.8)
        .on("mouseover", (event) => {
          showTooltip(event, `
            <div class="tt-title">${COMPANY_NAMES[d.ticker]}</div>
            <div class="tt-row"><span class="tt-label">Quarter:</span><span>${d.calendar_quarter}</span></div>
            <div class="tt-row"><span class="tt-label">CapEx:</span><span>${fmtBillions(d.val)}</span></div>
          `);
        })
        .on("mousemove", (event) => {
          tooltip.style("left", Math.min(event.clientX + 15, window.innerWidth - 300) + "px")
            .style("top", (event.clientY - 10) + "px");
        })
        .on("mouseout", hideTooltip);
    });
  });

  // Listen to filter changes
  filterListeners.push(() => {
    // Update x1 domain to only visible companies so bars fill the group evenly
    const visibleTickers = showTickers.filter(t => showingAll || selectedCompanies.has(t));
    x1.domain(visibleTickers.length > 0 ? visibleTickers : showTickers);

    // Collect visible values to rescale y BEFORE transitioning bars
    const visibleVals = [];
    svg.selectAll(".capex-bar").each(function () {
      const bar = d3.select(this);
      const barTicker = bar.attr("data-ticker");
      const companyOk = showingAll || selectedCompanies.has(barTicker);
      const qDate = new Date(bar.attr("data-quarter-date"));
      const inYear = qDate >= TIME_START && qDate <= TIME_END;
      if (companyOk && inYear) visibleVals.push(+bar.attr("data-val"));
    });

    // Update y domain now so bar transitions use the correct y values
    if (visibleVals.length > 0) {
      y.domain([0, d3.max(visibleVals) * 1.1]);
      capexYAxisG.transition().duration(400).call(d3.axisLeft(y).ticks(4).tickFormat(fmtBillions));
      capexGridG.transition().duration(400).call(d3.axisLeft(y).ticks(4).tickSize(-width).tickFormat(""));
    }

    // Single transition per bar for all 4 attributes
    svg.selectAll(".capex-bar").each(function () {
      const bar = d3.select(this);
      const barTicker = bar.attr("data-ticker");
      const companyOk = showingAll || selectedCompanies.has(barTicker);
      const qDate = new Date(bar.attr("data-quarter-date"));
      const inYear = qDate >= TIME_START && qDate <= TIME_END;
      const visible = companyOk && inYear;
      bar.style("display", visible ? null : "none");
      if (visible) {
        const q = bar.attr("data-quarter");
        const val = +bar.attr("data-val");
        bar.transition().duration(400)
          .attr("x", x0(q) + x1(barTicker))
          .attr("y", y(val))
          .attr("width", x1.bandwidth())
          .attr("height", height - y(val));
      }
    });

    capexLegend.selectAll(".legend-item").each(function () {
      const item = d3.select(this);
      const t = item.attr("data-ticker");
      const selected = showingAll || selectedCompanies.has(t);
      const noData = item.attr("data-no-capex") === "1";
      item.classed("disabled", !selected);
      item.style("opacity", selected ? null : (noData ? 0.15 : null));
    });

    timeListeners.forEach(fn => fn(currentTime));
  });

  // Time cursor line on capex chart
  const capexCursor = svg.append("line").attr("class", "time-cursor")
    .attr("y1", 0).attr("y2", height);

  // Convert a date to the x position of its quarter in the current x0 scale
  function dateToCapexX(t) {
    const year = t.getFullYear();
    const quarter = Math.floor(t.getMonth() / 3) + 1;
    const q = `${year}Q${quarter}`;
    const pos = x0(q);
    if (pos === undefined) return null; // quarter not in current view
    return pos + x0.bandwidth() / 2;
  }

  // Listen to time changes — dim bars outside the active range
  timeListeners.push((t) => {
    const cx = dateToCapexX(t);
    if (cx !== null) {
      capexCursor.attr("x1", cx).attr("x2", cx).style("display", null);
    } else {
      capexCursor.style("display", "none");
    }

    svg.selectAll(".capex-bar").each(function () {
      const bar = d3.select(this);
      const qDate = new Date(bar.attr("data-quarter-date"));
      const inRange = compareMode
        ? qDate >= rangeStartTime && qDate <= t
        : qDate <= t;
      bar.attr("opacity", inRange ? 0.85 : 0.1);
    });
  });

  // Update x-axis domain + reposition all bars when year filter changes
  yearRangeListeners.push((startDate, endDate) => {
    // Update x scale to only cover visible quarters
    const visibleQuarters = quarters.filter(q => {
      const qDate = quarterToDate(q);
      return qDate >= startDate && qDate <= endDate;
    });
    x0.domain(visibleQuarters);
    // Also update x1 domain to only visible companies so bars fill the group evenly
    const visibleTickers = showTickers.filter(t => showingAll || selectedCompanies.has(t));
    x1.domain(visibleTickers.length > 0 ? visibleTickers : showTickers).range([0, x0.bandwidth()]);

    // Update x-axis ticks
    const tickEvery = visibleQuarters.length <= 4 ? 1 : visibleQuarters.length <= 8 ? 2 : 3;
    capexXAxisG.transition().duration(400)
      .call(d3.axisBottom(x0).tickValues(visibleQuarters.filter((_, i) => i % tickEvery === 0)))
      .selectAll("text")
        .attr("transform", "rotate(-35)").style("text-anchor", "end").style("font-size", "9px");

    // Show/hide bars; collect visible values to recalculate y domain
    const visibleVals = [];
    svg.selectAll(".capex-bar").each(function () {
      const bar = d3.select(this);
      const qDate = new Date(bar.attr("data-quarter-date"));
      const inYear = qDate >= startDate && qDate <= endDate;
      const ticker = bar.attr("data-ticker");
      const companyOk = showingAll || selectedCompanies.has(ticker);
      const visible = inYear && companyOk;
      bar.style("display", visible ? null : "none");
      if (visible) visibleVals.push(+bar.attr("data-val"));
    });

    // Recalculate y domain from visible bars
    if (visibleVals.length > 0) {
      y.domain([0, d3.max(visibleVals) * 1.1]);
      capexYAxisG.transition().duration(400).call(d3.axisLeft(y).ticks(4).tickFormat(fmtBillions));
      capexGridG.transition().duration(400).call(d3.axisLeft(y).ticks(4).tickSize(-width).tickFormat(""));
    }

    // Reposition all visible bars in ONE transition (x + y + width + height together)
    svg.selectAll(".capex-bar").each(function () {
      const bar = d3.select(this);
      if (bar.style("display") === "none") return;
      const q = bar.attr("data-quarter");
      const ticker = bar.attr("data-ticker");
      const val = +bar.attr("data-val");
      bar.transition().duration(400)
        .attr("x", x0(q) + x1(ticker))
        .attr("y", y(val))
        .attr("width", x1.bandwidth())
        .attr("height", height - y(val));
    });

    // Re-trigger time listener for cursor + opacity
    timeListeners.forEach(fn => fn(currentTime));
  });
}

// ============================================
// Layoff info cards — highlight as time passes
// ============================================
function renderLayoffPanel(layoffs) {
  const panel = d3.select("#layoff-panel");

  // Sort by date
  const sorted = [...layoffs].sort((a, b) => a.date - b.date);

  sorted.forEach(d => {
    const card = panel.append("div")
      .attr("class", "layoff-card")
      .attr("data-ticker", d.ticker)
      .attr("data-date", d.date.toISOString());

    card.append("div").attr("class", "card-company")
      .style("color", COLORS[d.ticker])
      .text(COMPANY_NAMES[d.ticker]);

    card.append("div").attr("class", "card-count").text(fmtNum(d.laid_off));

    card.append("div").attr("class", "card-detail")
      .text(d.percentage != null ? `${fmtDate(d.date)} · ${fmtPct(d.percentage)} of workforce` : fmtDate(d.date));
  });

  // Listen to filter changes — must also respect the active year range
  filterListeners.push(() => {
    panel.selectAll(".layoff-card").each(function () {
      const card = d3.select(this);
      const cardTicker = card.attr("data-ticker");
      const cardDate = new Date(card.attr("data-date"));
      const companyOk = showingAll || selectedCompanies.has(cardTicker);
      const inYear = cardDate >= TIME_START && cardDate <= TIME_END;
      card.style("display", companyOk && inYear ? null : "none");
    });
  });

  // Listen to time — show cards within the active range
  timeListeners.push((t) => {
    panel.selectAll(".layoff-card").each(function () {
      const card = d3.select(this);
      const cardDate = new Date(card.attr("data-date"));
      // Always respect rangeStartTime (updated by year filter or compare mode)
      const inRange = cardDate >= rangeStartTime && cardDate <= t;
      card.classed("visible", inRange);
    });
  });

  // Show/hide cards when year filter changes
  yearRangeListeners.push((startDate, endDate) => {
    panel.selectAll(".layoff-card").each(function () {
      const card = d3.select(this);
      const ticker = card.attr("data-ticker");
      const cardDate = new Date(card.attr("data-date"));
      const inYear = cardDate >= startDate && cardDate <= endDate;
      const companyOk = showingAll || selectedCompanies.has(ticker);
      card.style("display", inYear && companyOk ? null : "none");
      card.classed("visible", inYear && companyOk);
    });
  });
}

// ============================================
// Draggable panel helper
// ============================================
function makeDraggable(el) {
  const handle = el.querySelector(".compare-info-drag-handle");
  if (!handle) return;

  // Apply shared position if one exists from a previous drag
  if (sharedPanelPos) {
    el.style.left = sharedPanelPos.left + "px";
    el.style.top  = sharedPanelPos.top  + "px";
  }

  let startX, startY, startLeft, startTop;

  handle.addEventListener("mousedown", e => {
    e.stopPropagation();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(el.style.left) || el.offsetLeft;
    startTop  = parseInt(el.style.top)  || el.offsetTop;

    function onMove(e) {
      const left = startLeft + e.clientX - startX;
      const top  = startTop  + e.clientY - startY;
      el.style.left = left + "px";
      el.style.top  = top  + "px";
      sharedPanelPos = { left, top };
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
