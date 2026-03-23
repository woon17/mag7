// Analysis colors
const COLORS = {
    AMZN: "#ff9900", GOOGL: "#4285f4", META: "#0668E1",
    MSFT: "#00a4ef", TSLA: "#cc0000", AAPL: "#a2aaad", NVDA: "#76b900"
};

const COMPANY_NAMES = {
    AMZN: "Amazon", GOOGL: "Google", META: "Meta",
    MSFT: "Microsoft", TSLA: "Tesla", AAPL: "Apple", NVDA: "Nvidia"
};

// Load and analyze data
Promise.all([
    d3.csv("data/stock_prices.csv"),
    d3.json("data/layoffs.json"),
    d3.json("data/capex.json")
]).then(([stockRaw, layoffs, capex]) => {
    // Parse data
    const stockData = stockRaw.map(d => ({
        date: new Date(d.date),
        ticker: d.ticker,
        close: +d.close
    }));

    layoffs.forEach(d => {
        d.date = new Date(d.Date_layoffs);
        d.laid_off = +d.Laid_Off;
        d.percentage = +d.Percentage;
    });

    // ========== ANALYSIS 1: EVENT STUDY ==========
    analyzeEventStudy(stockData, layoffs);

    // ========== ANALYSIS 2: CAPEX TRENDS ==========
    analyzeCapexTrends(stockData, layoffs, capex);

    // ========== ANALYSIS 3: CORRELATION ==========
    analyzeCorrelation(stockData, layoffs, capex);

    // ========== SUMMARY STATISTICS ==========
    generateSummaryStats(stockData, layoffs, capex);
})
    .catch(err => console.error("Data loading error:", err));

// ============================================
// Analysis 1: Event Study (abnormal returns around layoff dates)
// ============================================
function analyzeEventStudy(stockData, layoffs) {
    const section = d3.select("#event-study-section");
    section.html(""); // Clear

    // Group stock data by ticker
    const grouped = d3.group(stockData, d => d.ticker);

    // For each company, calculate average abnormal returns around layoff events
    const eventResults = new Map();
    const mag7 = ["AAPL", "AMZN", "GOOGL", "META", "MSFT", "NVDA", "TSLA"];

    mag7.forEach(ticker => {
        const tickerStock = grouped.get(ticker) || [];
        const tickerLayoffs = layoffs.filter(l => l.ticker === ticker);

        if (tickerLayoffs.length === 0) {
            eventResults.set(ticker, { events: 0, avgReturn: null, returnWindow: [] });
            return;
        }

        // Event window: -5 to +10 days
        const eventWindow = [];
        const returns = [];

        tickerLayoffs.forEach(layoff => {
            const eventDate = layoff.date;
            const windowData = tickerStock.filter(d => {
                const daysFromEvent = (d.date - eventDate) / (1000 * 60 * 60 * 24);
                return daysFromEvent >= -5 && daysFromEvent <= 10;
            }).sort((a, b) => a.date - b.date);

            if (windowData.length > 0) {
                const startPrice = windowData[0].close;
                const endPrice = windowData[windowData.length - 1].close;
                const returns_pct = ((endPrice - startPrice) / startPrice) * 100;
                returns.push(returns_pct);
            }
        });

        const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b) / returns.length : null;
        eventResults.set(ticker, {
            events: tickerLayoffs.length,
            avgReturn: avgReturn,
            returnWindow: returns
        });
    });

    // Create chart
    const svg = section.append("svg")
        .attr("width", 800)
        .attr("height", 300);

    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const width = 800 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Prepare data for bars
    const barData = [];
    eventResults.forEach((val, ticker) => {
        if (val.avgReturn !== null && val.events > 0) {
            barData.push({ ticker, avgReturn: val.avgReturn, events: val.events });
        }
    });

    // Scales
    const xScale = d3.scaleBand()
        .domain(barData.map(d => COMPANY_NAMES[d.ticker]))
        .range([0, width])
        .padding(0.3);

    const yScale = d3.scaleLinear()
        .domain([-3, 3])
        .range([height, 0]);

    // Zero line
    g.append("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", yScale(0))
        .attr("y2", yScale(0))
        .attr("stroke", "#30363d")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4");

    // Bars
    g.selectAll(".bar")
        .data(barData)
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", d => xScale(COMPANY_NAMES[d.ticker]))
        .attr("y", d => d.avgReturn >= 0 ? yScale(d.avgReturn) : yScale(0))
        .attr("width", xScale.bandwidth())
        .attr("height", d => Math.abs(yScale(d.avgReturn) - yScale(0)))
        .attr("fill", d => d.avgReturn >= 0 ? "#3fb950" : "#f85149")
        .attr("opacity", 0.8)
        .on("mouseover", function (event, d) {
            d3.select(this).attr("opacity", 1);
            showTooltip(event, `<strong>${COMPANY_NAMES[d.ticker]}</strong><br/>Avg Return: ${d.avgReturn.toFixed(2)}%<br/>Events: ${d.events}`);
        })
        .on("mouseout", hideTooltip);

    // Axes
    g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
    g.append("g").call(d3.axisLeft(yScale).ticks(5).tickFormat(d => d + "%"));

    // Labels
    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -40)
        .attr("x", -height / 2)
        .attr("text-anchor", "middle")
        .style("fill", "#8b949e")
        .style("font-size", "12px")
        .text("Average Abnormal Return (%)");

    g.append("text")
        .attr("x", width / 2)
        .attr("y", height + 35)
        .attr("text-anchor", "middle")
        .style("fill", "#8b949e")
        .style("font-size", "12px")
        .text("Company");

    // Add insights
    const hasNegative = barData.some(d => d.avgReturn < 0);
    const hasPositive = barData.some(d => d.avgReturn > 0);

    const insights = section.append("div").attr("class", "insights");
    let info = "<strong>Interpretation:</strong> ";
    if (hasPositive && !hasNegative) {
        info += "All companies show positive average returns in the 15-day window around layoff announcements, suggesting markets may react favorably to cost-cutting measures.";
    } else if (hasNegative && !hasPositive) {
        info += "All companies show negative average returns around layoff announcements, suggesting market concerns about economic outlook.";
    } else {
        info += "Mixed reactions across companies suggest market perception depends on company-specific factors and concurrent strategic signals (e.g., CapEx investment).";
    }
    insights.html(info);
}

// ============================================
// Analysis 2: CapEx Trends during layoff era
// ============================================
function analyzeCapexTrends(stockData, layoffs, capex) {
    const section = d3.select("#capex-trends-section");
    section.html(""); // Clear

    // Parse capex
    capex.forEach(d => {
        d.end = new Date(d.end);
        d.val = +d.val;
    });

    // Filter to layoff era (2020-2024)
    const capexFiltered = capex.filter(d => d.end.getFullYear() >= 2020 && d.end.getFullYear() <= 2024);

    // Group by ticker and year
    const mag7 = ["AAPL", "AMZN", "GOOGL", "META", "MSFT", "NVDA", "TSLA"];
    const capexByYear = new Map();

    mag7.forEach(ticker => {
        const years = new Map();
        capexFiltered.filter(d => d.ticker === ticker).forEach(d => {
            const year = d.end.getFullYear();
            if (!years.has(year)) years.set(year, []);
            years.get(year).push(d.val);
        });

        // Annual average
        const annual = [];
        for (let year = 2020; year <= 2024; year++) {
            const vals = years.get(year) || [];
            const avg = vals.length > 0 ? vals.reduce((a, b) => a + b) / vals.length : 0;
            annual.push({ year, capex: avg, ticker });
        }
        capexByYear.set(ticker, annual);
    });

    // Create line chart
    const svg = section.append("svg")
        .attr("width", 800)
        .attr("height", 300);

    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear().domain([2020, 2024]).range([0, width]);
    const allCapex = Array.from(capexByYear.values()).flat().map(d => d.capex);
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(allCapex) * 1.1])
        .range([height, 0]);

    // Lines
    const line = d3.line().x(d => xScale(d.year)).y(d => yScale(d.capex));

    mag7.forEach(ticker => {
        const data = capexByYear.get(ticker) || [];
        g.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", COLORS[ticker])
            .attr("stroke-width", 2.5)
            .attr("d", line);

        // Points
        g.selectAll(`.point-${ticker}`)
            .data(data)
            .enter()
            .append("circle")
            .attr("cx", d => xScale(d.year))
            .attr("cy", d => yScale(d.capex))
            .attr("r", 4)
            .attr("fill", COLORS[ticker])
            .on("mouseover", function (event, d) {
                d3.select(this).attr("r", 6);
                showTooltip(event, `<strong>${COMPANY_NAMES[ticker]} (${d.year})</strong><br/>CapEx: $${(d.capex / 1e9).toFixed(1)}B`);
            })
            .on("mouseout", function () {
                d3.select(this).attr("r", 4);
                hideTooltip();
            });
    });

    // Axes
    g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale).tickFormat(d3.format("d")));
    g.append("g").call(d3.axisLeft(yScale).tickFormat(d => `$${(d / 1e9).toFixed(0)}B`));

    // Labels
    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -50)
        .attr("x", -height / 2)
        .attr("text-anchor", "middle")
        .style("fill", "#8b949e")
        .style("font-size", "12px")
        .text("Average Annual CapEx");

    // Legend
    const legend = section.append("div").attr("class", "legend");
    mag7.forEach(ticker => {
        const item = legend.append("div").attr("class", "legend-item");
        item.append("div")
            .attr("class", "legend-swatch")
            .style("background-color", COLORS[ticker]);
        item.append("span").text(COMPANY_NAMES[ticker]);
    });

    // Insights
    const insights = section.append("div").attr("class", "insights");
    insights.html("<strong>Key Observation:</strong> Examine the trend trajectories - are companies increasing CapEx during the layoff era? Rising CapEx alongside layoffs suggests a strategic shift from labor to capital/automation investment.");
}

// ============================================
// Analysis 3: Correlation Analysis
// ============================================
function analyzeCorrelation(stockData, layoffs, capex) {
    const section = d3.select("#correlation-section");
    section.html(""); // Clear

    const mag7 = ["AAPL", "AMZN", "GOOGL", "META", "MSFT", "NVDA", "TSLA"];
    const results = [];

    mag7.forEach(ticker => {
        const tickerLayoffs = layoffs.filter(l => l.ticker === ticker);
        const totalLayoffs = tickerLayoffs.reduce((sum, l) => sum + (l.laid_off || 0), 0);
        const layoffCount = tickerLayoffs.length;

        const tickerCapex = capex.filter(d => d.ticker === ticker && new Date(d.end).getFullYear() >= 2020);
        const avgCapex = tickerCapex.length > 0 ? tickerCapex.reduce((sum, d) => sum + (+d.val || 0), 0) / tickerCapex.length : 0;

        // Trend analysis: is CapEx increasing?
        const capexByYear = new Map();
        tickerCapex.forEach(d => {
            const year = new Date(d.end).getFullYear();
            if (!capexByYear.has(year)) capexByYear.set(year, []);
            capexByYear.get(year).push(+d.val);
        });

        let capexTrend = "stable";
        if (capexByYear.size >= 2) {
            const years = Array.from(capexByYear.keys()).sort();
            const firstYear = capexByYear.get(years[0]).reduce((a, b) => a + b) / capexByYear.get(years[0]).length;
            const lastYear = capexByYear.get(years[years.length - 1]).reduce((a, b) => a + b) / capexByYear.get(years[years.length - 1]).length;
            capexTrend = lastYear > firstYear * 1.1 ? "increasing" : lastYear < firstYear * 0.9 ? "decreasing" : "stable";
        }

        results.push({
            ticker,
            company: COMPANY_NAMES[ticker],
            totalLayoffs,
            layoffCount,
            avgCapex,
            capexTrend,
            color: COLORS[ticker]
        });
    });

    // Create visual correlation matrix
    const html = `
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 12px;">
        <thead style="background: #0d1117; border-bottom: 2px solid #21262d;">
          <tr>
            <th style="padding: 12px; text-align: left; color: #58a6ff;">Company</th>
            <th style="padding: 12px; text-align: right; color: #58a6ff;">Layoff Events</th>
            <th style="padding: 12px; text-align: right; color: #58a6ff;">Total Laid Off</th>
            <th style="padding: 12px; text-align: right; color: #58a6ff;">Avg CapEx ($B)</th>
            <th style="padding: 12px; text-align: center; color: #58a6ff;">CapEx Trend</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(r => `
            <tr style="border-bottom: 1px solid #21262d;">
              <td style="padding: 12px; font-weight: 600; color: ${r.color};">${r.company}</td>
              <td style="padding: 12px; text-align: right;">${r.layoffCount}</td>
              <td style="padding: 12px; text-align: right;">${r.totalLayoffs.toLocaleString()}</td>
              <td style="padding: 12px; text-align: right;">$${(r.avgCapex / 1e9).toFixed(1)}B</td>
              <td style="padding: 12px; text-align: center; font-weight: 500;">
                <span style="color: ${r.capexTrend === 'increasing' ? '#3fb950' : r.capexTrend === 'decreasing' ? '#f85149' : '#8b949e'};">
                  ${r.capexTrend === 'increasing' ? '📈 Increasing' : r.capexTrend === 'decreasing' ? '📉 Decreasing' : '➡️ Stable'}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

    section.html(html);

    // Insights
    const insights = section.append("div").attr("class", "insights");
    const increasingCapex = results.filter(r => r.capexTrend === "increasing").length;
    const totalCompanies = results.length;

    let insight = `<strong>Pattern Analysis:</strong> `;
    insight += `${increasingCapex} out of ${totalCompanies} companies show <strong>increasing CapEx</strong> during the layoff era. `;
    insight += `This suggests evidence of capital deepening (labor → capital/automation substitution). `;
    insight += `Companies with rising CapEx + layoffs may signal efficiency improvements rather than economic distress.`;

    insights.html(insight);
}

// ============================================
// Summary Statistics Table
// ============================================
function generateSummaryStats(stockData, layoffs, capex) {
    const mag7 = ["AAPL", "AMZN", "GOOGL", "META", "MSFT", "NVDA", "TSLA"];
    const table = d3.select("#summary-table");

    const rows = [];

    mag7.forEach(ticker => {
        const tickerStock = stockData.filter(d => d.ticker === ticker).sort((a, b) => a.date - b.date);
        const tickerLayoffs = layoffs.filter(l => l.ticker === ticker);

        // Stock metrics
        const startPrice = tickerStock[0]?.close || 0;
        const endPrice = tickerStock[tickerStock.length - 1]?.close || 0;
        const totalReturn = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;

        // Layoff metrics
        const totalLayoffs = tickerLayoffs.reduce((sum, l) => sum + (l.laid_off || 0), 0);

        // CapEx metrics
        const tickerCapex = capex.filter(d => d.ticker === ticker && new Date(d.end).getFullYear() >= 2020);
        const totalCapex = tickerCapex.reduce((sum, d) => sum + (+d.val || 0), 0);

        rows.push({
            ticker: COMPANY_NAMES[ticker],
            color: COLORS[ticker],
            returns: totalReturn,
            layoffs: totalLayoffs,
            capex: totalCapex,
            capexEvents: tickerCapex.length
        });
    });

    // Header
    table.append("thead").append("tr")
        .selectAll("th")
        .data(["Company", "Total Return (2020-24)", "Total Laid Off", "Total CapEx ($B)", "CapEx Events"])
        .enter()
        .append("th")
        .text(d => d)
        .style("padding", "12px")
        .style("text-align", "center");

    // Rows
    table.append("tbody")
        .selectAll("tr")
        .data(rows)
        .enter()
        .append("tr")
        .html(d => `
      <td style="padding: 12px; font-weight: 600; color: ${d.color};">${d.ticker}</td>
      <td style="padding: 12px; text-align: center; color: ${d.returns >= 0 ? '#3fb950' : '#f85149'};">${d.returns.toFixed(1)}%</td>
      <td style="padding: 12px; text-align: center;">${d.layoffs.toLocaleString()}</td>
      <td style="padding: 12px; text-align: center;">$${(d.capex / 1e9).toFixed(1)}B</td>
      <td style="padding: 12px; text-align: center;">${d.capexEvents}</td>
    `)
        .style("border-bottom", "1px solid #21262d");
}

// ============================================
// Utility functions
// ============================================
const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("position", "absolute");

function showTooltip(event, html) {
    tooltip.html(html)
        .style("opacity", 1)
        .style("left", (event.clientX + 10) + "px")
        .style("top", (event.clientY - 30) + "px")
        .attr("class", "tooltip visible");
}

function hideTooltip() {
    tooltip.style("opacity", 0).attr("class", "tooltip");
}
