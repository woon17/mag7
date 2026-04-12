// ============================================
// Mag 7: Mouse-Driven Time Explorer
// Mouse X position = time cursor across all charts
// ============================================

const COLORS = {
  AAPL: "#f0f0f0", // bright silver — Apple grey kept visible on dark bg
  AMZN: "#ff9900", // Amazon orange — unchanged, distinct
  GOOGL: "#34a853", // Google green — avoids blue clash with MSFT/META
  META: "#e040fb", // purple — moves Meta off blue entirely
  MSFT: "#00a4ef", // Microsoft blue — now the sole blue
  NVDA: "#76b900", // Nvidia green — unchanged
  TSLA: "#ff3d3d", // bright red — Tesla, more visible than dark #cc0000
};
const COMPANY_NAMES = {
  AMZN: "Amazon", GOOGL: "Google", META: "Meta",
  MSFT: "Microsoft", TSLA: "Tesla", AAPL: "Apple", NVDA: "Nvidia"
};

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

function setTimeRange(startDate, endDate) {
  TIME_START = startDate;
  TIME_END = endDate;
  globalTimeScale.domain([TIME_START, TIME_END]);
  renderTimelineLabels();
}

function renderTimelineLabels() {
  const labels = d3.select(".timeline-labels");
  if (labels.empty()) return;

  const startYear = TIME_START.getFullYear();
  const endYear = TIME_END.getFullYear();
  const years = d3.range(startYear, endYear + 1);

  labels.selectAll("span").remove();
  years.forEach(y => {
    const pct = globalTimeScale(new Date(y, 0, 1)) * 100;
    labels.append("span").text(y).style("left", pct + "%");
  });
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
      if (selectedCompanies.size === 0) {
        selectedCompanies.clear();
        showingAll = true;
      }
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
      }
    });

  allLabel.append("span")
    .attr("class", "checkbox-text")
    .text("All Companies");

  // Individual company checkboxes
  tickers.forEach(t => {
    const label = container.append("label")
      .attr("class", "filter-checkbox-label")
      .attr("id", `label-${t}`);

    label.append("input")
      .attr("type", "checkbox")
      .attr("class", "company-checkbox")
      .attr("id", `checkbox-${t}`)
      .on("change", () => {
        toggleCompanyFilter(t);
      });

    label.append("span")
      .attr("class", "checkbox-text")
      .style("color", COLORS[t])
      .text(COMPANY_NAMES[t]);
  });

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
      .style("left", pct + "%")
      .style("background", COLORS[d.ticker]);
  });

  // Hide/show ticks when company filter changes
  filterListeners.push(() => {
    eventsContainer.selectAll(".timeline-tick").each(function() {
      const tick = d3.select(this);
      const ticker = tick.attr("data-ticker");
      tick.style("display", showingAll || selectedCompanies.has(ticker) ? null : "none");
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
  if (dateExtent[0] && dateExtent[1]) {
    const minDate = new Date(dateExtent[0].getFullYear(), 0, 1);
    const maxDate = new Date(dateExtent[1].getFullYear(), 11, 31);
    setTimeRange(minDate, maxDate);
    rangeStartTime = minDate;
  }

  layoffs.forEach(d => {
    d.date = new Date(d.Date_layoffs);
    d.laid_off = +d.Laid_Off;
    d.percentage = d.Percentage;
  });

  const tickers = [...new Set(stockData.map(d => d.ticker))];
  setupCompanyFilter(tickers);
  setupTimelineBar(layoffs);
  renderStockChart(stockData, layoffs);
  renderCapexChart(capex);
  renderLayoffPanel(layoffs);

  // Initialize to show full timeline
  setGlobalTime(TIME_END);
  const track = document.getElementById("timeline-track");
  const trackCursor = document.getElementById("timeline-cursor");

  // Align timeline bar padding so track + labels both match the stock chart's x-axis
  const stockSvg = document.querySelector("#stock-chart svg");
  if (stockSvg) {
    const chartMarginLeft = 55, chartMarginRight = 20;
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

// ============================================
// Chart 1: Stock Price — mouse X = time cursor
// ============================================
function renderStockChart(stockData, layoffs) {
  const container = d3.select("#stock-chart");
  const rect = container.node().getBoundingClientRect();
  const margin = { top: 15, right: 20, bottom: 35, left: 55 };
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

  // Legend with toggle
  const legendEl = d3.select("#stock-legend");
  const active = new Set(tickers);
  tickers.forEach(t => {
    const item = legendEl.append("div").attr("class", "legend-item")
      .on("click", () => {
        if (active.has(t)) active.delete(t); else active.add(t);
        item.classed("disabled", !active.has(t));
        updateLines();
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
  const yMin = Math.min(d3.min(allVals), 100); // always include 0%
  const yMax = Math.max(d3.max(allVals), 100); // always include 0%
  const yPad = (yMax - yMin) * 0.05;
  const y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([height, 0]);

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
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)));
  const yAxisG = svg.append("g").attr("class", "axis").call(d3.axisLeft(y).tickValues(yTickValues(y)).tickFormat(fmtYAxis));

  // Persistent 0% baseline
  const zeroLine = svg.append("line").attr("class", "zero-line")
    .attr("x1", 0).attr("x2", width)
    .attr("y1", y(100)).attr("y2", y(100));

  svg.append("text").attr("transform", "rotate(-90)")
    .attr("y", -40).attr("x", -height / 2).attr("text-anchor", "middle")
    .style("fill", "#8b949e").style("font-size", "11px").text("% Change from Start");

  // Clip path — reveals data up to current time
  svg.append("defs").append("clipPath").attr("id", "stock-clip")
    .append("rect").attr("id", "stock-clip-rect")
    .attr("x", 0).attr("y", -5).attr("height", height + 10).attr("width", width);

  const clipArea = svg.append("g").attr("clip-path", "url(#stock-clip)");

  // Use normalized directly — no rebasing
  const currentData = normalized;

  // Full lines (faded) as background reference
  const lineGen = d3.line().x(d => x(d.date)).y(d => y(d.value)).curve(d3.curveMonotoneX);
  tickers.forEach(t => {
    svg.insert("path", ":first-child").datum(normalized.get(t))
      .attr("class", `stock-line-future future-${t}`)
      .attr("d", lineGen).attr("stroke", COLORS[t]);
  });

  // Solid lines up to time cursor
  tickers.forEach(t => {
    clipArea.append("path").datum(normalized.get(t))
      .attr("class", `stock-line line-${t}`)
      .attr("d", lineGen).attr("stroke", COLORS[t]);
  });

  // Layoff markers
  const markerData = layoffs.map(d => {
    const tickerData = normalized.get(d.ticker);
    if (!tickerData) return null;
    const closest = tickerData.reduce((prev, curr) =>
      Math.abs(curr.date - d.date) < Math.abs(prev.date - d.date) ? curr : prev);
    return { ...d, yVal: closest.value };
  }).filter(Boolean);

  clipArea.selectAll(".layoff-marker").data(markerData).enter()
    .append("circle").attr("class", d => `layoff-marker marker-${d.ticker}`)
    .attr("cx", d => x(d.date)).attr("cy", d => y(d.yVal))
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

  // Price dots on cursor
  const cursorDots = {};
  const cursorLabels = {};
  tickers.forEach(t => {
    cursorDots[t] = svg.append("circle").attr("class", "cursor-dot")
      .attr("r", 4).attr("fill", COLORS[t]).attr("stroke", "#0d1117").attr("stroke-width", 1.5);
    cursorLabels[t] = svg.append("text")
      .style("fill", COLORS[t]).style("font-size", "10px").style("font-weight", "600")
      .attr("pointer-events", "none");
  });

  const bisect = d3.bisector(d => d.date).left;

  // Get close price for a ticker at a given date
  function getCloseAtTime(ticker, t) {
    const data = normalized.get(ticker);
    const i = Math.max(0, bisect(data, t, 1) - 1);
    return data[Math.min(i, data.length - 1)].close;
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
        // Hide any residual cursor labels left from scrub mode
        tickers.forEach(t => cursorLabels[t].style("display", "none"));
      }
      rangeStartLine.attr("x1", x0).attr("x2", x0);
      cursorLine.attr("x1", x1).attr("x2", x1);
      d3.select("#stock-clip-rect").attr("x", x0).attr("width", Math.max(0, x1 - x0));
      syncTimelineCursors(t0, t1);
      // Update all panels live while dragging
      rangeStartTime = t0;
      currentTime    = t1;
      timeListeners.forEach(fn => fn(t1));
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
    updateComparePanel();
  }
  rangeListeners.push(onRangeStartChange);

  function updateComparePanel() {
    const panel = document.getElementById("compare-info");
    if (!panel) return;
    if (!compareMode) { panel.style.display = "none"; return; }

    const rows = tickers
      .filter(t => active.has(t))
      .map(t => {
        const startPrice = getCloseAtTime(t, rangeStartTime);
        const endPrice   = getCloseAtTime(t, currentTime);
        const change = endPrice - startPrice;
        const pct    = (change / startPrice) * 100;
        return { t, startPrice, endPrice, change, pct };
      })
      .sort((a, b) => b.pct - a.pct);

    panel.innerHTML = `
      <div class="compare-info-header">
        ${fmtMonthYear(rangeStartTime)} &rarr; ${fmtMonthYear(currentTime)}
      </div>
      ${rows.map(r => `
        <div class="compare-info-row">
          <span class="compare-info-name" style="color:${COLORS[r.t]}">${COMPANY_NAMES[r.t]}</span>
          <span class="compare-info-prices">$${r.startPrice.toFixed(1)} → $${r.endPrice.toFixed(1)}</span>
          <span class="compare-info-pct ${r.pct >= 0 ? 'cmp-pos' : 'cmp-neg'}">
            ${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%
          </span>
        </div>
      `).join('')}
    `;
    panel.style.display = "block";
  }

  // Transparent overlay for hover tooltips on stock lines
  svg.append("rect").attr("width", width).attr("height", height)
    .style("fill", "none").style("pointer-events", "all").style("cursor", "crosshair");

  // Brush must always sit above the hover overlay in SVG z-order
  brushG.raise();

  function updateLines() {
    tickers.forEach(t => {
      const vis = active.has(t);
      svg.selectAll(`.line-${t}`).style("opacity", vis ? 1 : 0);
      svg.selectAll(`.future-${t}`).style("opacity", vis ? 0.15 : 0);
      svg.selectAll(`.marker-${t}`).style("display", vis ? null : "none");
      cursorDots[t].style("display", vis ? null : "none");
      cursorLabels[t].style("display", vis ? null : "none");
    });

    // Recalculate y domain from only visible tickers
    const activeVals = [];
    normalized.forEach((v, t) => {
      if (active.has(t)) v.forEach(d => activeVals.push(d.value));
    });
    if (activeVals.length === 0) return;
    const newMin = Math.min(d3.min(activeVals), 100); // always include 0%
    const newMax = Math.max(d3.max(activeVals), 100); // always include 0%
    const newPad = (newMax - newMin) * 0.05;
    y.domain([newMin - newPad, newMax + newPad]);

    // Redraw axis, grid, and zero line with transition
    yAxisG.transition().duration(400).call(d3.axisLeft(y).tickValues(yTickValues(y)).tickFormat(fmtYAxis));
    gridG.transition().duration(400).call(d3.axisLeft(y).tickValues(yTickValues(y)).tickSize(-width).tickFormat(""));
    zeroLine.transition().duration(400).attr("y1", y(100)).attr("y2", y(100));

    // Redraw all line paths with new scale
    tickers.forEach(t => {
      svg.selectAll(`.line-${t}`).transition().duration(400).attr("d", lineGen);
      svg.selectAll(`.future-${t}`).transition().duration(400).attr("d", lineGen);
    });

    // Redraw layoff markers
    svg.selectAll(".layoff-marker")
      .transition().duration(400)
      .attr("cy", d => y(d.yVal));

    // Re-fire time listeners to reposition cursor dots at new scale
    timeListeners.forEach(fn => fn(currentTime));
  }

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
      const i = bisect(data, t, 1);
      if (i === 0 || i >= data.length) {
        cursorDots[ticker].style("display", "none");
        cursorLabels[ticker].style("display", "none");
        return;
      }
      const d0 = data[i - 1], d1 = data[i];
      const d = (t - d0.date > d1.date - t) ? d1 : d0;

      // Only show if date is before cursor
      if (d.date > t) {
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

    labelPositions.forEach(lp => {
      const pctChange = (lp.value - 100).toFixed(0);
      const sign = pctChange >= 0 ? "+" : "";
      cursorLabels[lp.ticker].style("display", compareMode ? "none" : null)
        .attr("x", cx + 8).attr("y", lp.yPos + 4)
        .text(`$${lp.close.toFixed(1)} (${sign}${pctChange}%)`);
    });
  });
}

// ============================================
// Chart 2: CapEx — bars grow up to current time
// ============================================
function renderCapexChart(capex) {
  const container = d3.select("#capex-chart");
  const rect = container.node().getBoundingClientRect();
  const margin = { top: 10, right: 10, bottom: 40, left: 50 };
  const width = rect.width - margin.left - margin.right;
  const height = rect.height - margin.top - margin.bottom - 5;

  // Use all tickers present in the data and clip by current dashboard year range.
  const showTickers = [...new Set(capex.map(d => d.ticker))].sort();
  const filtered = capex.filter(d => {
    const year = parseInt(d.calendar_quarter.slice(0, 4));
    return showTickers.includes(d.ticker) && year >= TIME_START.getFullYear() && year <= TIME_END.getFullYear();
  });

  // Capex legend
  const capexLegend = d3.select("#capex-legend");
  showTickers.forEach(t => {
    const item = capexLegend.append("div").attr("class", "legend-item");
    item.append("div").attr("class", "legend-swatch").style("background", COLORS[t]);
    item.append("span").text(COMPANY_NAMES[t]);
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

  svg.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(4).tickSize(-width).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x0).tickValues(quarters.filter((_, i) => i % 3 === 0)))
    .selectAll("text").attr("transform", "rotate(-35)").style("text-anchor", "end").style("font-size", "9px");
  svg.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(4).tickFormat(fmtBillions));

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
        .attr("data-quarter-date", qDate.toISOString())
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
    svg.selectAll(".capex-bar").each(function () {
      const bar = d3.select(this);
      const barTicker = bar.attr("data-ticker");
      if (showingAll) {
        // Show all
        bar.style("display", null);
      } else {
        // Show only selected
        bar.style("display", selectedCompanies.has(barTicker) ? null : "none");
      }
    });
  });

  // Time cursor line on capex chart
  const capexCursor = svg.append("line").attr("class", "time-cursor")
    .attr("y1", 0).attr("y2", height);

  // Map time to x position on capex chart
  const capexTimeScale = d3.scaleTime()
    .domain([quarterToDate(quarters[0]), quarterToDate(quarters[quarters.length - 1])])
    .range([0, width]);

  // Listen to time changes — dim bars outside the active range
  timeListeners.push((t) => {
    const cx = Math.max(0, Math.min(width, capexTimeScale(t)));
    capexCursor.attr("x1", cx).attr("x2", cx);

    svg.selectAll(".capex-bar").each(function () {
      const bar = d3.select(this);
      const qDate = new Date(bar.attr("data-quarter-date"));
      const inRange = compareMode
        ? qDate >= rangeStartTime && qDate <= t
        : qDate <= t;
      bar.attr("opacity", inRange ? 0.85 : 0.1);
    });
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
      .text(`${fmtDate(d.date)} · ${fmtPct(d.percentage)} of workforce`);
  });

  // Listen to filter changes
  filterListeners.push(() => {
    panel.selectAll(".layoff-card").each(function () {
      const card = d3.select(this);
      const cardTicker = card.attr("data-ticker");
      if (showingAll) {
        // Show all
        card.style("display", null);
      } else {
        // Show only selected
        card.style("display", selectedCompanies.has(cardTicker) ? null : "none");
      }
    });
  });

  // Listen to time — show cards within the active range
  timeListeners.push((t) => {
    panel.selectAll(".layoff-card").each(function () {
      const card = d3.select(this);
      const cardDate = new Date(card.attr("data-date"));
      const inRange = compareMode
        ? cardDate >= rangeStartTime && cardDate <= t
        : cardDate <= t;
      card.classed("visible", inRange);
    });
  });
}
